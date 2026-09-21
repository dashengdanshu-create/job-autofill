/**
 * The five-stage matching cascade.
 *
 * All stages run for every field and each contributes candidate scores; the
 * highest-scoring key wins. Running all stages rather than stopping at the
 * first hit matters: a weak exact-alias hit on a `name` attribute should lose
 * to a strong semantic signal like `type=email`, and corroboration between two
 * stages is itself evidence worth a bonus.
 */

import type {
  DetectedField,
  Evidence,
  EvidenceSource,
  FieldKey,
  FieldMatch,
  SectionKind,
} from './types.ts';
import { SECTION_OF_KEY, isRepeatingKey } from './types.ts';
import { SECTION_LABELS } from './sections.ts';
import {
  ALIASES,
  ALL_FIELD_KEYS,
  AUTOCOMPLETE_MAP,
  BOOLEAN_KEYS,
  DATE_KEYS,
  INPUT_TYPE_MAP,
  LONG_TEXT_KEYS,
  containsAlias,
  isVetoed,
  lookupExact,
  lookupIdentifier,
} from './aliases.ts';
import {
  AMBIGUITY_WINDOW,
  BANDS,
  BASE_SCORES,
  FUZZY_MIN_SIMILARITY,
  MODIFIERS,
  applyModifiers,
  bandFor,
  clamp01,
  fuzzyScore,
  round2,
} from './confidence.ts';
import { guardField } from './guards.ts';
import { normalizeLabel, similarity } from './normalize.ts';
import type { SiteAdapter } from '../adapters/types.ts';

interface Candidate {
  key: FieldKey;
  score: number;
  evidence: Evidence[];
}

/** Accumulates candidate scores, keeping the best score per key. */
class CandidateSet {
  private readonly byKey = new Map<FieldKey, Candidate>();
  /** Keys that only mean something relative to a section heading we never found. */
  private readonly needsSection = new Set<FieldKey>();

  add(key: FieldKey, score: number, evidence: Evidence): void {
    const existing = this.byKey.get(key);
    if (!existing) {
      this.byKey.set(key, { key, score, evidence: [evidence] });
      return;
    }
    existing.evidence.push(evidence);
    if (score > existing.score) existing.score = score;
  }

  /** Sorted best-first; ties break on key name for deterministic output. */
  ranked(): Candidate[] {
    return [...this.byKey.values()].sort(
      (a, b) => b.score - a.score || a.key.localeCompare(b.key),
    );
  }

  /**
   * Reinterprets candidates that name the right field in the wrong section.
   *
   * The alias tables can only carry *qualified* labels for a section — 实习公司,
   * 实习开始时间. Real forms almost never write those: they print the heading
   * 实习经历 once and then label the column plainly 公司名称, exactly as the
   * 工作经历 table above it does. Bias alone cannot fix that, because
   * `internship.company` was never a candidate — only `work.company` was.
   *
   * So before biasing, each candidate whose section disagrees with the heading is
   * offered its counterpart in the heading's section. Both survive as candidates;
   * the bias below then decides. Keeping both matters: a stray 现单位 inside an
   * 实习经历 block should still be able to win as work.company.
   */
  remapToSection(field: DetectedField, fieldSection: SectionKind): void {
    if (fieldSection === 'unknown') return;
    const texts = describedBy(field).map((d) => d.text);

    for (const candidate of [...this.byKey.values()]) {
      const alternative = sectionCounterpart(candidate.key, fieldSection);
      if (!alternative) continue;

      // The counterpart's own negative aliases still apply. This is what keeps a
      // section-pinned label honest: 现单位 says "current employer" outright, and
      // internship.company vetoes it, so no counterpart is offered at all.
      if (texts.some((text) => isVetoed(alternative, text))) continue;

      // Slightly below the observed candidate: this key was inferred from the
      // heading, not read off the label. Without the gap the two would tie and
      // the section bias would decide every such pair by fiat.
      const offered = clamp01(candidate.score - MODIFIERS.corroborated);
      const existing = this.byKey.get(alternative);

      // Raise, never lower. The counterpart is often already present from a weak
      // fuzzy hit — 公司名称 is 0.75-similar to 实习公司 — and leaving that score
      // in place would waste the far stronger evidence the section provides.
      if (existing && existing.score >= offered) continue;

      const note = `字段位于${SECTION_LABELS[fieldSection]}区块，按该区块解释原本匹配到的 ${candidate.key}`;
      if (existing) {
        existing.score = offered;
        existing.evidence.push({ source: 'section', value: SECTION_LABELS[fieldSection], note });
        continue;
      }

      this.byKey.set(alternative, {
        key: alternative,
        score: offered,
        // Fresh evidence, not a copy: claiming the alias hit belonged to this key
        // would be a lie, and the evidence trail is what the user checks.
        evidence: [{ source: 'section', value: SECTION_LABELS[fieldSection], note }],
      });
    }
  }

  /**
   * Caps candidates that were won by a label meaning nothing on its own.
   *
   * "开始时间" / "from" / "结束时间" name a *role within a section*, not a field:
   * under 工作经历 the first is a job start, under 培训经历 it is a training
   * start, and the profile has no slot for the latter. Alias tables cannot
   * express that — they list "开始时间" under `work.startDate`, so the bare label
   * alone reaches auto and would write a job date into a training row.
   *
   * When the section is unknown these are held below the auto threshold rather
   * than dropped: the label really might mean the work key, so the match is
   * still worth showing, just not worth writing unreviewed. Keys whose own name
   * carries the section ("入职时间" → `work.startDate`) are unaffected, because
   * they matched on a qualified alias instead.
   */
  private demandSectionForBareLabels(): void {
    for (const candidate of this.byKey.values()) {
      if (!SECTION_OF_KEY[candidate.key]) continue;
      if (!candidate.evidence.some((e) => SECTION_AGNOSTIC.has(normalizeLabel(e.value)))) continue;
      this.needsSection.add(candidate.key);
      candidate.evidence.push({
        source: 'section',
        value: '区块未知',
        note: '这个标签只在某个区块里才有确定含义，页面没有可识别的区块标题，需人工确认',
      });
    }
  }

  /**
   * Whether this key won on a section-agnostic label with no section to anchor
   * it. Recorded rather than subtracted, because the caller's modifiers run
   * afterwards and a corroboration bonus would otherwise lift the score straight
   * back over the threshold. It has to be a ceiling on the final confidence.
   */
  requiresSection(key: FieldKey): boolean {
    return this.needsSection.has(key);
  }

  /**
   * Nudges every candidate by how well its section matches the heading the
   * field appears under. Applied before ranking because it must be able to
   * reorder candidates — that is the whole point: 实习公司 and 公司 score
   * identically on the label, and only the section tells them apart.
   */
  applySectionBias(fieldSection: SectionKind): void {
    if (fieldSection === 'unknown') {
      this.demandSectionForBareLabels();
      return;
    }
    for (const candidate of this.byKey.values()) {
      const keySection = SECTION_OF_KEY[candidate.key];
      if (!keySection) continue;
      if (keySection === fieldSection) {
        candidate.score = clamp01(candidate.score + MODIFIERS.sectionAgrees);
        candidate.evidence.push({
          source: 'section',
          value: SECTION_LABELS[fieldSection],
          note: '所在区块与该字段类别一致',
        });
      } else {
        candidate.score = clamp01(candidate.score + MODIFIERS.sectionConflicts);
        candidate.evidence.push({
          source: 'section',
          value: SECTION_LABELS[fieldSection],
          note: `所在区块是${SECTION_LABELS[fieldSection]}，与 ${SECTION_LABELS[keySection]} 不符`,
        });
      }
    }
  }
}

/**
 * Labels that name a role inside a section rather than a field.
 *
 * Each is a perfectly good alias *given* a section heading, and useless without
 * one. Kept as a small explicit list rather than derived from the alias tables:
 * these are the handful of labels forms reuse verbatim across every section, and
 * the set should grow only deliberately.
 */
const SECTION_AGNOSTIC = new Set(
  [
    '开始时间', '结束时间', '起始时间', '终止时间', '至今', '时间', '起止时间',
    'start date', 'end date', 'from', 'to', 'date', 'period',
    '開始日', '終了日', '期間',
  ].map((label) => normalizeLabel(label)),
);

/**
 * The same question asked in a different section.
 *
 * Sections share a small set of roles — who, what, when-from, when-to, describe
 * it — under different key names. This table says which keys play the same role,
 * so a candidate found in one section can be offered its equivalent in another.
 * Roles are deliberately coarse: `campus.organization` answers "who" for a club
 * the way `work.company` does for an employer.
 */
const SECTION_ROLES: Array<Partial<Record<SectionKind, FieldKey>>> = [
  // who / where
  { work: 'work.company', internship: 'internship.company', campus: 'campus.organization', education: 'education.school' },
  // what you were
  { work: 'work.title', internship: 'internship.title', campus: 'campus.role' },
  // sub-unit
  { work: 'work.department', internship: 'internship.department' },
  { work: 'work.startDate', internship: 'internship.startDate', campus: 'campus.startDate', education: 'education.startDate' },
  { work: 'work.endDate', internship: 'internship.endDate', campus: 'campus.endDate', education: 'education.endDate' },
  { work: 'work.location', internship: 'internship.location' },
  { work: 'work.description', internship: 'internship.description', campus: 'campus.description', project: 'project.description' },
];

/** Index built once: key → the role row it belongs to. */
const ROLE_OF_KEY = new Map<FieldKey, Partial<Record<SectionKind, FieldKey>>>();
for (const row of SECTION_ROLES) {
  for (const key of Object.values(row)) ROLE_OF_KEY.set(key, row);
}

/** The key playing `key`'s role in `section`, if there is one and it differs. */
function sectionCounterpart(key: FieldKey, section: SectionKind): FieldKey | null {
  const row = ROLE_OF_KEY.get(key);
  if (!row) return null;
  const alternative = row[section];
  return alternative && alternative !== key ? alternative : null;
}

/** Every descriptive string on the field, tagged with where it came from. */
function describedBy(field: DetectedField): Array<{ source: EvidenceSource; text: string }> {
  return [
    { source: 'label' as EvidenceSource, text: field.label },
    { source: 'label' as EvidenceSource, text: field.ariaLabel },
    { source: 'label' as EvidenceSource, text: field.placeholder },
    { source: 'label' as EvidenceSource, text: field.title },
    { source: 'legend' as EvidenceSource, text: field.legend },
    { source: 'nearby-text' as EvidenceSource, text: field.nearbyText },
  ].filter((d) => d.text.trim().length > 0);
}

function stageAdapter(field: DetectedField, adapter: SiteAdapter | null, out: CandidateSet): void {
  if (!adapter?.match) return;
  const hit = adapter.match(field);
  if (!hit) return;
  out.add(hit.fieldKey, hit.score ?? BASE_SCORES.adapter, {
    source: 'adapter',
    value: adapter.id,
    note: hit.note ?? `站点适配器 ${adapter.id} 指定`,
  });
}

function stageAliasExact(field: DetectedField, out: CandidateSet): void {
  // Attribute identifiers: name / id are machine-authored and usually precise.
  for (const [attr, raw] of [['name', field.name], ['id', field.id]] as const) {
    for (const key of lookupIdentifier(raw)) {
      if (isVetoed(key, raw)) continue;
      out.add(key, BASE_SCORES.aliasExactAttr, {
        source: 'alias-exact',
        value: `${attr}="${raw}"`,
        note: '属性名精确命中别名',
      });
    }
  }

  // Whole-label exact hits.
  for (const { text } of describedBy(field)) {
    for (const key of lookupExact(text)) {
      if (isVetoed(key, text)) continue;
      out.add(key, BASE_SCORES.aliasExact, {
        source: 'alias-exact',
        value: text,
        note: '标签文本精确命中别名',
      });
    }
  }
}

function stageSemanticHtml(field: DetectedField, out: CandidateSet): void {
  const auto = normalizeLabel(field.autocomplete).replace(/^(shipping|billing)\s+/, '');
  const autoKey = AUTOCOMPLETE_MAP[auto];
  if (autoKey) {
    out.add(autoKey, BASE_SCORES.semanticHtml, {
      source: 'semantic-html',
      value: `autocomplete="${field.autocomplete}"`,
      note: '语义属性明确指定',
    });
  }

  const typeKey = INPUT_TYPE_MAP[field.inputType];
  if (typeKey) {
    out.add(typeKey, BASE_SCORES.semanticHtml, {
      source: 'semantic-html',
      value: `type="${field.inputType}"`,
      note: '输入类型语义匹配',
    });
  }
}

function stageNearbyLabels(field: DetectedField, out: CandidateSet): void {
  for (const { source, text } of describedBy(field)) {
    for (const key of ALL_FIELD_KEYS) {
      if (isVetoed(key, text)) continue;
      const probe = containsAlias(key, text);
      if (!probe) continue;
      const base =
        source === 'label'
          ? BASE_SCORES.label
          : source === 'legend'
            ? BASE_SCORES.legend
            : BASE_SCORES.nearbyText;
      out.add(key, base, {
        source,
        value: text,
        note: `包含别名「${probe}」`,
      });
    }
  }
}

function stageFuzzy(field: DetectedField, out: CandidateSet): void {
  const haystacks = describedBy(field).map((d) => d.text);
  if (field.name) haystacks.push(field.name);
  if (haystacks.length === 0) return;

  for (const key of ALL_FIELD_KEYS) {
    let best = 0;
    let bestText = '';
    let bestAlias = '';
    for (const text of haystacks) {
      if (isVetoed(key, text)) continue;
      for (const alias of aliasSurface(key)) {
        const score = similarity(text, alias);
        if (score > best) {
          best = score;
          bestText = text;
          bestAlias = alias;
        }
      }
    }
    if (best >= FUZZY_MIN_SIMILARITY) {
      out.add(key, fuzzyScore(best), {
        source: 'fuzzy',
        value: bestText,
        note: `与「${bestAlias}」相似度 ${round2(best)}`,
      });
    }
  }
}

/** Alias strings compared during fuzzy scoring, memoised per key. */
const surfaceCache = new Map<FieldKey, string[]>();
function aliasSurface(key: FieldKey): string[] {
  let surface = surfaceCache.get(key);
  if (!surface) {
    const entry = ALIASES[key];
    surface = entry ? [...entry.exact, ...(entry.contains ?? [])] : [];
    surfaceCache.set(key, surface);
  }
  return surface;
}

/** Penalty when the control type contradicts what the key expects. */
function typeMismatchPenalty(field: DetectedField, key: FieldKey): number {
  const numeric = field.inputType === 'number';
  const isDateInput = field.inputType === 'date' || field.inputType === 'month';
  const isTextual = field.kind === 'text' || field.kind === 'textarea';

  if (numeric && !DATE_KEYS.has(key) && key !== 'education.gpa'
    && key !== 'pref.expectedSalary' && key !== 'contact.address.postalCode'
    && key !== 'contact.phone' && key !== 'contact.phoneCountryCode') {
    return MODIFIERS.typeMismatch;
  }
  if (isDateInput && !DATE_KEYS.has(key)) return MODIFIERS.typeMismatch;
  if (DATE_KEYS.has(key) && field.kind === 'checkbox') return MODIFIERS.typeMismatch;
  if (BOOLEAN_KEYS.has(key) && field.kind === 'textarea') return MODIFIERS.typeMismatch;

  // A key wanting free prose cannot be answered by picking from a list. Forms ask
  // plenty of closed questions the profile has no slot for — 婚姻状况, 政治面貌 —
  // and a weak fuzzy hit on one of these would otherwise write a whole
  // self-evaluation paragraph into a two-option dropdown.
  if (LONG_TEXT_KEYS.has(key) && (field.kind === 'select' || field.kind === 'radio')) {
    return MODIFIERS.wrongControlShape;
  }

  // A one-line text input for a key that wants an essay is suspicious, unless
  // the site set a generous maxlength.
  if (LONG_TEXT_KEYS.has(key) && field.kind === 'text' && isTextual) {
    const cap = field.maxLength;
    if (cap !== null && cap > 0 && cap < 120) return MODIFIERS.typeMismatch;
  }
  return 0;
}

export interface MatchContext {
  adapter?: SiteAdapter | null;
}

export function matchField(field: DetectedField, ctx: MatchContext = {}): FieldMatch {
  const guard = guardField(field);
  if (guard.blocked) {
    return {
      fieldId: field.fieldId,
      fieldKey: null,
      entryIndex: 0,
      confidence: 0,
      band: 'blocked',
      blockedReason: guard.reason,
      evidence: [
        {
          source: 'guard',
          value: guard.matched ?? '',
          note: guard.reason,
        },
      ],
    };
  }

  const candidates = new CandidateSet();
  stageAdapter(field, ctx.adapter ?? null, candidates);
  stageAliasExact(field, candidates);
  stageSemanticHtml(field, candidates);
  stageNearbyLabels(field, candidates);
  stageFuzzy(field, candidates);
  candidates.remapToSection(field, field.sectionKind);
  candidates.applySectionBias(field.sectionKind);

  const ranked = candidates.ranked();
  const winner = ranked[0];
  if (!winner) {
    return {
      fieldId: field.fieldId,
      fieldKey: null,
      entryIndex: 0,
      confidence: 0,
      band: 'skip',
      evidence: [],
    };
  }

  const mods: number[] = [];

  // Corroboration: at least two evidence entries from distinct stages.
  const distinctSources = new Set(winner.evidence.map((e) => e.source));
  if (distinctSources.size >= 2) mods.push(MODIFIERS.corroborated);

  // Ambiguity: a different key came within the window of the winner.
  const rival = ranked[1];
  if (rival && winner.score - rival.score <= AMBIGUITY_WINDOW) {
    mods.push(MODIFIERS.ambiguous);
  }

  const penalty = typeMismatchPenalty(field, winner.key);
  if (penalty !== 0) mods.push(penalty);

  if (field.currentValue?.trim()) mods.push(MODIFIERS.prefilled);

  // A section-agnostic label with no section is capped below auto: it may well
  // mean this key, but writing it unreviewed risks putting a job date in a
  // training row. Applied after the modifiers so a corroboration bonus cannot
  // lift it back over the line.
  const confidence = candidates.requiresSection(winner.key)
    ? Math.min(applyModifiers(winner.score, mods), BANDS.AUTO - 0.01)
    : applyModifiers(winner.score, mods);
  const evidence = [...winner.evidence];
  if (rival && winner.score - rival.score <= AMBIGUITY_WINDOW) {
    evidence.push({
      source: 'fuzzy',
      value: rival.key,
      note: `与 ${rival.key} 得分接近，已降低置信度`,
    });
  }

  return {
    fieldId: field.fieldId,
    fieldKey: winner.key,
    // Refined by assignEntryIndices() once the whole page is visible; a single
    // field in isolation can only know the ordinal it carries in its own name.
    entryIndex: isRepeatingKey(winner.key) ? (field.explicitIndex ?? 0) : 0,
    confidence,
    band: bandFor(confidence),
    evidence,
  };
}

export function matchFields(fields: DetectedField[], ctx: MatchContext = {}): FieldMatch[] {
  const matches = fields.map((f) => matchField(f, ctx));
  return dedupeByKey(assignEntryIndices(fields, matches));
}

/**
 * Decides which entry of a repeating section each field belongs to.
 *
 * Two signals:
 *
 *  1. The form numbered the field itself (`work_2_company`, `edu[1].school`).
 *     Nothing beats an ordinal the page author wrote down.
 *  2. Otherwise: how many times this key has already been claimed in this
 *     section. The Nth 公司名称 under 工作经历 is the Nth employer.
 *
 * `groupId` refines signal 2 rather than replacing it. It cannot be the primary
 * signal, because "is this container repeated?" is not the same question as "is
 * this a second entry?": a one-field-per-row layout has a repeated `<div
 * class="row">` around every single field, so counting containers would read a
 * five-field education block as five separate entries. Instead the count is
 * keyed on the key, and `groupId` only supplies the tie-break — when a container
 * has already claimed this key, its sibling fields still resolve to the same
 * entry. That keeps 公司名称 and 职位 of row 2 together without inventing entries
 * in the flat layout.
 *
 * Signal 1 is also cross-checked against the container before it is trusted; see
 * `ordinalsNumberFields`.
 */
/**
 * Whether this page's trailing digits number *fields* rather than *entries*.
 *
 * `parseOrdinal` cannot tell the two apart from one name alone. Both of these
 * are three inputs whose names end in 1, 2, 3:
 *
 *     f_edu_a1 f_edu_a2 f_edu_a3   ← ONE entry; the digit numbers the field
 *     company1 company2 company3   ← THREE entries; the digit numbers the entry
 *
 * Trusting the digit blindly shatters the first layout into three phantom
 * entries (每条只填到一个字段), and — worse — makes the two cards of a repeated
 * section collapse onto the same indices, so entry 2 silently overwrites entry 1.
 *
 * The repeat container settles it. Fields of one entry share a container, so if
 * several fields inside a single container disagree about their ordinal, those
 * ordinals cannot be entry numbers. One disagreement is enough to disqualify the
 * whole page: a form mixes conventions far less often than it numbers fields.
 */
function ordinalsNumberFields(fields: DetectedField[]): boolean {
  const seen = new Map<string, number>();
  for (const field of fields) {
    if (!field.groupId || field.explicitIndex === null) continue;
    const previous = seen.get(field.groupId);
    if (previous !== undefined && previous !== field.explicitIndex) return true;
    seen.set(field.groupId, field.explicitIndex);
  }
  return false;
}

function assignEntryIndices(fields: DetectedField[], matches: FieldMatch[]): FieldMatch[] {
  /** Per section: how many entries of each key have been seen. */
  const keyCounts = new Map<SectionKind, Map<FieldKey, number>>();
  /** Per section: the entry index already assigned to each repeat container. */
  const groupEntry = new Map<SectionKind, Map<string, number>>();
  const ordinalsAreFieldNumbers = ordinalsNumberFields(fields);

  const bump = (section: SectionKind, key: FieldKey): number => {
    let counts = keyCounts.get(section);
    if (!counts) {
      counts = new Map();
      keyCounts.set(section, counts);
    }
    const seen = counts.get(key) ?? 0;
    counts.set(key, seen + 1);
    return seen;
  };

  /** Records an entry index against a container, without overwriting. */
  const remember = (section: SectionKind, groupId: string, entryIndex: number): void => {
    if (!groupId) return;
    let groups = groupEntry.get(section);
    if (!groups) {
      groups = new Map();
      groupEntry.set(section, groups);
    }
    if (!groups.has(groupId)) groups.set(groupId, entryIndex);
  };

  const recalled = (section: SectionKind, groupId: string): number | undefined =>
    groupId ? groupEntry.get(section)?.get(groupId) : undefined;

  return matches.map((match, i) => {
    const field = fields[i];
    if (!field || !match.fieldKey || match.band === 'blocked') return match;
    if (!isRepeatingKey(match.fieldKey)) return match;

    // The key's own section, not the heading's: a work key found under an
    // unrecognised heading still numbers within the work sequence.
    const section = SECTION_OF_KEY[match.fieldKey] ?? 'unknown';

    let entryIndex: number;
    let note: string;
    if (field.explicitIndex !== null && !ordinalsAreFieldNumbers) {
      entryIndex = field.explicitIndex;
      note = `表单自带序号（${field.name || field.id}）`;
      bump(section, match.fieldKey);
    } else {
      const count = bump(section, match.fieldKey);
      const shared = recalled(section, field.groupId);
      if (count === 0 && shared !== undefined) {
        // First sighting of this key, but its container already holds another
        // field of a known entry — join that entry instead of starting a new one.
        entryIndex = shared;
        note = '与同一重复容器内的其他字段归为一条';
      } else {
        entryIndex = count;
        note = `按文档顺序在本区块内第 ${count + 1} 次出现`;
      }
    }

    remember(section, field.groupId, entryIndex);

    return {
      ...match,
      entryIndex,
      evidence: [
        ...match.evidence,
        {
          source: 'ordinal' as EvidenceSource,
          value: `${SECTION_LABELS[section]} 第 ${entryIndex + 1} 条`,
          note,
        },
      ],
    };
  });
}

/**
 * Two fields must not both claim the same profile slot — a page with "Email" and
 * "Confirm email" would otherwise fill both. The stronger match keeps the slot;
 * the weaker is demoted to review so the user decides.
 *
 * The slot is (key, entryIndex), not key alone: since V0.2 a form may legitimately
 * ask for 公司名称 three times, and those three fields are not rivals.
 */
function dedupeByKey(matches: FieldMatch[]): FieldMatch[] {
  const slotOf = (m: FieldMatch): string => `${m.fieldKey}#${m.entryIndex}`;

  const bestBySlot = new Map<string, FieldMatch>();
  for (const m of matches) {
    if (!m.fieldKey || m.band === 'blocked') continue;
    const prev = bestBySlot.get(slotOf(m));
    if (!prev || m.confidence > prev.confidence) bestBySlot.set(slotOf(m), m);
  }

  return matches.map((m) => {
    if (!m.fieldKey || m.band === 'blocked') return m;
    const best = bestBySlot.get(slotOf(m));
    if (best && best.fieldId !== m.fieldId) {
      const demoted = Math.min(m.confidence, BASE_SCORES.label);
      return {
        ...m,
        confidence: demoted,
        band: demoted >= 0.65 ? 'review' : 'skip',
        evidence: [
          ...m.evidence,
          {
            source: 'fuzzy' as EvidenceSource,
            value: best.fieldId,
            note: '同一档案字段已被更高置信度的表单项占用，需人工确认',
          },
        ],
      };
    }
    return m;
  });
}
