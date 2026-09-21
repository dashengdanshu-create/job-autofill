/**
 * DOM → DetectedField[]. The only module that reads layout.
 *
 * Two decisions worth knowing:
 *  1. Elements are registered in a module-level Map keyed by a synthetic
 *     `jaf-<n>` id, and the mapping is what FILL uses later. Re-deriving
 *     selectors would break on any re-render between Detect and Fill.
 *  2. Radios and checkboxes sharing a `name` collapse into ONE logical field
 *     carrying `options[]`, because "Gender: ○M ○F" is one question.
 */

import type { ControlKind, DetectedField, FieldOption, SectionKind } from '../core/types.ts';
import { classifySection, parseOrdinal } from '../core/sections.ts';
import type { SiteAdapter } from '../adapters/types.ts';

export type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * fieldId → the element(s) it represents; groups hold every radio/checkbox.
 *
 * Kept per-document so detecting in one document cannot invalidate the ids
 * handed out for another. A content script only ever sees one document, but
 * tests parse several, and the weaker global form silently loses entries.
 */
const registries = new WeakMap<Document, Map<string, FormControl[]>>();
let counter = 0;

function registryFor(doc: Document): Map<string, FormControl[]> {
  let map = registries.get(doc);
  if (!map) {
    map = new Map();
    registries.set(doc, map);
  }
  return map;
}

export function resetRegistry(doc?: Document): void {
  const target = doc ?? (typeof document === 'undefined' ? null : document);
  if (target) registries.delete(target);
}

export function elementsFor(fieldId: string, doc?: Document): FormControl[] {
  const target = doc ?? (typeof document === 'undefined' ? null : document);
  if (!target) return [];
  return registries.get(target)?.get(fieldId) ?? [];
}

/** Input types that are never worth filling from a profile. */
const IGNORED_TYPES = new Set([
  'submit', 'button', 'reset', 'image', 'file', 'hidden', 'password', 'range', 'color',
]);

const CONTROL_SELECTOR = 'input, select, textarea';

type ControlRoot = Document | ShadowRoot;
function rootFor(el: Element): ControlRoot {
  return el.getRootNode() as ControlRoot;
}

/** Open component trees are separate label/id namespaces. */
function controlRoots(doc: Document): ControlRoot[] {
  const roots: ControlRoot[] = [doc];
  for (let i = 0; i < roots.length; i += 1) {
    for (const el of roots[i]!.querySelectorAll('*')) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }
  }
  return roots;
}


function isVisible(el: Element, doc: Document): boolean {
  const win = doc.defaultView;
  if (!win) return true; // linkedom in tests: assume visible, guards still apply

  const style = win.getComputedStyle(el as HTMLElement);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
    return false;
  }
  if (Number.parseFloat(style.opacity || '1') < 0.05) return false;

  const rect = (el as HTMLElement).getBoundingClientRect?.();
  if (rect && rect.width === 0 && rect.height === 0) {
    // Radios and checkboxes are routinely 0×0 with a styled label on top.
    const type = (el as HTMLInputElement).type;
    if (type !== 'radio' && type !== 'checkbox') return false;
  }

  // `hidden` attribute and inert ancestors.
  if ((el as HTMLElement).hidden) return false;
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  return true;
}

function isFillable(el: FormControl): boolean {
  if (el.disabled) return false;
  if ((el as HTMLInputElement).readOnly) return false;
  if (el.tagName === 'INPUT' && IGNORED_TYPES.has((el as HTMLInputElement).type)) return false;
  return true;
}

function kindOf(el: FormControl): ControlKind {
  if (el.tagName === 'SELECT') return 'select';
  if (el.tagName === 'TEXTAREA') return 'textarea';
  const type = (el as HTMLInputElement).type;
  if (type === 'radio') return 'radio';
  if (type === 'checkbox') return 'checkbox';
  return 'text';
}

const clean = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * Text of a `<label for=id>`, an ancestor `<label>`, `aria-labelledby`, or a
 * `<label>` in a preceding sibling column (see `siblingColumnLabel`).
 */
function labelTextFor(el: FormControl, doc: Document): string {
  const parts: string[] = [];

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const node = rootFor(el).getElementById(id);
      if (node) parts.push(clean(node.textContent));
    }
  }

  if (el.id) {
    const escaped = cssEscape(el.id);
    for (const label of rootFor(el).querySelectorAll(`label[for="${escaped}"]`)) {
      parts.push(clean(label.textContent));
    }
  }

  const ancestor = el.closest('label');
  if (ancestor) {
    // Strip the control's own option text so "Male" doesn't become the label.
    const cloneText = clean(ancestor.textContent);
    if (cloneText) parts.push(cloneText);
  }

  // Each fallback is only consulted when nothing better was found, so test for
  // real text rather than array length — an empty push would look like a hit.
  const empty = (): boolean => parts.every((p) => !p);

  if (empty()) parts.push(siblingColumnLabel(el));

  // A `<th>` above this cell's column *is* that column's heading — as explicit
  // an association as `label[for]`, just expressed through table structure. It
  // belongs on the label path rather than in nearbyText, where the section
  // heading picked up by the ancestor walk would dilute it into a review score.
  if (empty()) {
    const cell = el.closest('td, th');
    if (cell) parts.push(columnHeaderFor(cell));
  }

  return dedupeJoin(parts.filter(Boolean));
}

/**
 * A `<label>` sitting in a *preceding sibling* of one of the control's
 * ancestors — the two-column form row that component frameworks emit:
 *
 *     <div class="form-item">
 *       <div class="form-item-label"><label>姓名</label></div>   ← no `for`
 *       <div class="form-item-control">…<input>…</div>
 *     </div>
 *
 * These labels are real `<label>` elements, so they deserve label-strength
 * scoring (0.82) rather than the weaker nearby-text score — but they carry no
 * `for`, and the control usually has no `id`, so none of the association-based
 * lookups above can find them. Framework class names are not matched: relying on
 * `.ant-*` / `.el-*` would only work for the frameworks we happened to name,
 * whereas "a label element in an earlier sibling column" describes the layout
 * itself and generalises.
 *
 * Only *preceding* siblings count. What follows a control is normally a
 * validation message or a unit suffix, not its name.
 */
function siblingColumnLabel(el: Element): string {
  const MAX_LEN = 80;
  // Start at the control itself, not at its parent: `<p><label>学历</label>
  // <select></p>` puts the label in the control's *own* preceding siblings.
  // Skipping that level missed the adjacent label and climbed straight to the
  // previous row, so every field took the label of the field above it — the
  // whole form off by one, which looks like "nothing matches" but is worse: the
  // matches it does make are wrong.
  let node: Element | null = el;

  for (let depth = 0; node && depth < 5; depth += 1) {
    let sibling = node.previousElementSibling;
    let hops = 0;
    while (sibling && hops < 3) {
      // The sibling may *be* the label or merely contain it.
      const label = sibling.matches('label') ? sibling : sibling.querySelector('label');
      if (label) {
        const text = clean(label.textContent);
        if (text && text.length <= MAX_LEN) return text;
      }
      sibling = sibling.previousElementSibling;
      hops += 1;
    }
    node = node.parentElement;
  }
  return '';
}

function cssEscape(value: string): string {
  const w = globalThis as { CSS?: { escape?: (v: string) => string } };
  if (typeof w.CSS?.escape === 'function') return w.CSS.escape(value);
  return value.replace(/["\\\]\[#.:>+~*^$|=()]/g, '\\$&');
}

function dedupeJoin(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (!part || seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out.join(' ').trim();
}

function legendFor(el: Element): string {
  const fieldset = el.closest('fieldset');
  if (!fieldset) return '';
  const legend = fieldset.querySelector('legend');
  return clean(legend?.textContent);
}

/**
 * Visible text immediately before the control. Walks previous siblings, then up
 * through ancestors, collecting short text nodes — the pattern used by forms
 * that style a `<div>` as a label without associating it.
 *
 * The climb is anchored on the element itself rather than on its previous
 * sibling. Anchoring on the sibling looks equivalent but silently loses the
 * whole ancestor walk whenever a control has no previous sibling at all: the
 * recursion would start from `null` and `null?.parentElement` ends it
 * immediately. That is the common case in component-framework markup, where the
 * input is wrapped several divs deep and the label lives in a sibling *column*
 * of an ancestor:
 *
 *     <div class="form-item">
 *       <div class="form-item-label"><label>姓名</label></div>
 *       <div class="form-item-control"><div><input name="field_a8f3c2"></div></div>
 *     </div>
 */
function nearbyTextFor(el: Element): string {
  const parts: string[] = [];
  const MAX_LEN = 80;

  /** From `node`, scan its preceding siblings; failing that, go up a level. */
  const collect = (node: Element | null, depth: number): void => {
    if (!node) return;
    let cursor = node.previousElementSibling;
    let hops = 0;
    while (cursor && hops < 4) {
      const text = clean(cursor.textContent);
      if (text && text.length <= MAX_LEN && !spansSeveralCells(cursor)) parts.push(text);
      cursor = cursor.previousElementSibling;
      hops += 1;
    }
    // Only climb while nothing has been found, so the nearest text wins and the
    // evidence string stays specific to this field.
    if (parts.length === 0 && depth < 4) {
      const parent = node.parentElement;
      if (parent) {
        const own = directTextOf(parent);
        if (own && own.length <= MAX_LEN) parts.push(own);
        collect(parent, depth + 1);
      }
    }
  };

  collect(el, 0);

  // Table layouts. Two orientations exist and they need opposite lookups:
  //
  //   vertical    <tr><th>公司名称</th><td><input></td></tr>      → row header
  //   horizontal  <thead><tr><th>公司名称</th><th>职位名称</th>…    → column header
  //               <tbody><tr><td><input></td><td><input></td>…
  //
  // Taking the row header in the horizontal case hands every input in the row
  // the *same* text — the whole header line concatenated — so a four-column
  // table collapses onto one field key and dedupe demotes the lot to review.
  // The cell's column position is what disambiguates: cell N belongs to header N.
  const cell = el.closest('td, th');
  if (cell) {
    const columnHeader = columnHeaderFor(cell);
    if (columnHeader) parts.push(columnHeader.slice(0, MAX_LEN));

    const prevCell = cell.previousElementSibling;
    if (prevCell && !spansSeveralCells(prevCell)) {
      parts.push(clean(prevCell.textContent).slice(0, MAX_LEN));
    }
    const row = cell.closest('tr');
    const header = row?.querySelector('th');
    if (header && header !== cell && !spansSeveralCells(header)) {
      parts.push(clean(header.textContent).slice(0, MAX_LEN));
    }
  }

  // A preceding sibling of the wrapper often holds the question text.
  const wrapper = el.parentElement;
  const wrapperPrev = wrapper?.previousElementSibling;
  if (wrapperPrev) {
    const text = clean(wrapperPrev.textContent);
    if (text && text.length <= MAX_LEN) parts.push(text);
  }

  return dedupeJoin(parts);
}

/**
 * Whether this element holds several cells, and so describes a whole row rather
 * than any one field. A `<tr>` of column headers is the case that matters: its
 * text is every column's label run together, which describes no single input.
 */
function spansSeveralCells(el: Element): boolean {
  return el.querySelectorAll('td, th').length > 1;
}

/**
 * The header text for `cell`'s column, in a table whose headers run across the
 * top. Counts colspans so a merged header still lines up with the right column,
 * and only accepts a header row that has no controls of its own — otherwise the
 * first data row of a table without a `<thead>` would be read as its headings.
 */
function columnHeaderFor(cell: Element): string {
  const row = cell.closest('tr');
  const table = cell.closest('table');
  if (!row || !table) return '';

  // Which column does this cell start at, counting spans of earlier cells?
  let column = 0;
  for (const sibling of Array.from(row.children)) {
    if (sibling === cell) break;
    column += Math.max(1, Number((sibling as HTMLTableCellElement).colSpan) || 1);
  }

  // The nearest preceding row that is all headers and holds no inputs.
  const rows = Array.from(table.querySelectorAll('tr'));
  const index = rows.indexOf(row as HTMLTableRowElement);
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = rows[i]!;
    const headers = Array.from(candidate.querySelectorAll('th'));
    if (headers.length < 2) continue;
    if (candidate.querySelector(CONTROL_SELECTOR)) continue;

    let at = 0;
    for (const header of headers) {
      const span = Math.max(1, Number((header as HTMLTableCellElement).colSpan) || 1);
      if (column < at + span) return clean(header.textContent);
      at += span;
    }
    return '';
  }
  return '';
}

/** Text belonging to this element directly, excluding child elements. */
function directTextOf(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) out += node.textContent ?? '';
  }
  return clean(out);
}

/** Elements whose text can act as a section heading. */
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, legend, caption, summary, th[colspan]';

interface Headings {
  /** Classifying headings, document order. */
  list: Array<{ node: Element; kind: SectionKind; text: string; position: number }>;
  /** Every element's position in document order. */
  order: Map<Element, number>;
}

/**
 * Finds the section a control belongs to: the nearest heading that classifies
 * and precedes it in document order.
 *
 * Document order rather than DOM ancestry: forms mark sections with a bare
 * `<h3>` followed by sibling tables far more often than they wrap each section
 * in a container, so an ancestor-only search misses most real markup.
 *
 * Positions come from an explicit index built by `collectHeadings`, not from
 * `compareDocumentPosition`. That API is exactly what this wants, but linkedom
 * returns DOCUMENT_POSITION_FOLLOWING for every pair regardless of order, which
 * silently assigns every field the last heading's section. An integer
 * comparison is both correct everywhere and cheaper than N DOM comparisons.
 */
function sectionFor(
  el: Element,
  doc: Document,
  headings: Headings,
): { kind: SectionKind; label: string } {
  // A fieldset legend that classifies wins: it is unambiguously scoped.
  const fieldset = el.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    const kind = classifySection(clean(legend?.textContent));
    if (kind !== 'unknown') return { kind, label: clean(legend?.textContent) };
  }

  const own = headings.order.get(el);
  if (own === undefined) return { kind: 'unknown', label: '' };

  let best: { kind: SectionKind; label: string } | null = null;
  for (const heading of headings.list) {
    if (heading.position < own) best = { kind: heading.kind, label: heading.text };
    else break; // list is in document order, so we are past el
  }
  return best ?? { kind: 'unknown', label: '' };
}

/**
 * All classifying headings in document order, plus the position index every
 * element is looked up in. `querySelectorAll('*')` is specified to return
 * document order, so one pass gives a total ordering.
 */
function collectHeadings(doc: ControlRoot): Headings {
  const order = new Map<Element, number>();
  let position = 0;
  for (const node of doc.querySelectorAll('*')) {
    order.set(node, position);
    position += 1;
  }

  // Unrecognised headings are kept, as 'unknown'. Dropping them would let the
  // fields under a heading we cannot classify inherit the *previous* section:
  // 培训经历 following 工作经历 would take on 'work', and its 开始时间 would then
  // resolve to a job start date. Filling a field with the wrong thing is worse
  // than leaving it blank, so an unclassifiable heading ends the section above it
  // instead of extending it. Only headings that plausibly *are* section headings
  // count — see `isSectionHeading`.
  const list: Headings['list'] = [];
  for (const node of doc.querySelectorAll(HEADING_SELECTOR)) {
    const text = clean(node.textContent);
    const kind = classifySection(text);
    if (kind === 'unknown' && !isSectionHeading(node, text)) continue;
    list.push({ node, kind, text, position: order.get(node) ?? 0 });
  }
  list.sort((a, b) => a.position - b.position);
  return { list, order };
}

/**
 * Whether an unclassified heading is plausibly a *section* heading — one that
 * ends whichever section precedes it.
 *
 * `HEADING_SELECTOR` also matches `<legend>`, `<caption>`, `<summary>` and
 * `th[colspan]`, which are often per-field or per-row furniture rather than
 * section breaks. Treating those as breaks would fragment a section a real
 * `<h2>` opened. Real headings are also short: a paragraph of instructions
 * rendered as a `<caption>` is not a heading.
 */
function isSectionHeading(node: Element, text: string): boolean {
  if (!text || text.length > 40) return false;
  return /^H[1-6]$/.test(node.tagName);
}

/**
 * Identifies the repeated wrapper a control sits in, so sibling fields of one
 * entry share a group id.
 *
 * A wrapper qualifies when it has a same-tag-and-class sibling that holds
 * controls *from the same section*. That same-section requirement is what makes
 * this work across both common layouts, which disagree about which DOM level is
 * the entry boundary:
 *
 *   两个 `<tbody>` in one table   → the tbody repeats, the table does not
 *   两张并列的 `<table>`          → the table repeats, its lone tbody does not
 *
 * Judged by tag alone, an education field's `<table>` looks repeated too — its
 * siblings are the internship and work tables. Requiring the twin to hold
 * education fields rejects it and correctly settles on the `<tbody>`.
 *
 * Of the qualifying levels the outermost wins, so an entry spanning several rows
 * stays one group rather than one group per row.
 *
 * The id carries the wrapper's document position, so identical tag-and-class
 * wrappers under different parents never collide.
 */
function groupIdFor(
  el: Element,
  doc: Document,
  headings: Headings,
  section: SectionKind,
): string {
  const sameSection = (candidate: Element): boolean => {
    for (const control of candidate.querySelectorAll(CONTROL_SELECTOR)) {
      if (sectionFor(control, doc, headings).kind === section) return true;
    }
    return false;
  };

  let found: Element | null = null;
  let node: Element | null = el.parentElement;

  for (let depth = 0; node && depth < 8; depth += 1) {
    const parent = node.parentElement;
    if (parent) {
      const signature = `${node.tagName}.${node.className || ''}`;
      const twins = Array.from(parent.children).filter(
        (sib) =>
          `${sib.tagName}.${sib.className || ''}` === signature &&
          (sib === node || sameSection(sib)),
      );
      if (twins.length > 1) found = node;
    }
    node = parent;
  }

  if (!found) return '';
  return `${found.tagName}.${found.className || ''}#${headings.order.get(found) ?? 0}`;
}

function optionsOfSelect(el: HTMLSelectElement): FieldOption[] {
  return Array.from(el.options).map((opt) => ({
    value: opt.value,
    label: clean(opt.textContent) || opt.value,
  }));
}

/** The visible text tied to one radio/checkbox input. */
function optionLabelFor(el: HTMLInputElement, doc: Document): string {
  const ancestor = el.closest('label');
  if (ancestor) {
    const text = clean(ancestor.textContent);
    if (text) return text;
  }
  if (el.id) {
    const label = rootFor(el).querySelector(`label[for="${cssEscape(el.id)}"]`);
    const text = clean(label?.textContent);
    if (text) return text;
  }
  const next = el.nextElementSibling;
  const nextText = clean(next?.textContent);
  if (nextText && nextText.length <= 60) return nextText;
  return el.value || '';
}

/**
 * The shared question text for a radio/checkbox group: whatever the members
 * agree on, which is normally the legend or the container's own text.
 */
function groupQuestionFor(members: HTMLInputElement[], doc: Document): string {
  const legend = legendFor(members[0]!);
  if (legend) return legend;

  // A container that holds all members and has its own text node.
  let container: HTMLElement | null = members[0]!.parentElement;
  for (let depth = 0; depth < 4 && container; depth += 1) {
    if (members.every((m) => container!.contains(m))) {
      const own = directTextOf(container);
      if (own) return own;
      const prev = container.previousElementSibling;
      const prevText = clean(prev?.textContent);
      if (prevText && prevText.length <= 80) return prevText;
      const heading = container.querySelector('legend, .label, [class*="label" i]');
      const headingText = clean(heading?.textContent);
      if (headingText && headingText.length <= 80) return headingText;
    }
    container = container.parentElement;
  }
  return nearbyTextFor(members[0]!);
}

function matchesAnySelector(el: Element, selectors: string[] | undefined): boolean {
  if (!selectors?.length) return false;
  return selectors.some((sel) => {
    try {
      return el.matches(sel);
    } catch {
      return false;
    }
  });
}

export interface DetectOptions {
  adapter?: SiteAdapter | null;
  /** Injected for tests; defaults to the ambient document. */
  doc?: Document;
}

export function detectFields(options: DetectOptions = {}): DetectedField[] {
  const doc = options.doc ?? document;
  const adapter = options.adapter ?? null;
  const registry = registryFor(doc);
  registry.clear();

  const roots = controlRoots(doc);
  const all = roots.flatMap((root) => Array.from(root.querySelectorAll(CONTROL_SELECTOR))) as FormControl[];
  const usable = all.filter(
    (el) =>
      isFillable(el) &&
      !matchesAnySelector(el, adapter?.ignoreSelectors) &&
      isVisible(el, doc),
  );

  const fields: DetectedField[] = [];
  const consumed = new Set<FormControl>();
  const headingMaps = new Map(roots.map((root) => [root, collectHeadings(root)]));

  for (const el of usable) {
    const headings = headingMaps.get(rootFor(el))!;
    if (consumed.has(el)) continue;
    const kind = kindOf(el);

    if (kind === 'radio' || kind === 'checkbox') {
      const input = el as HTMLInputElement;
      const group = input.name
        ? usable.filter(
            (c) =>
              c.tagName === 'INPUT' &&
              (c as HTMLInputElement).type === input.type &&
              (c as HTMLInputElement).name === input.name &&
              c.getRootNode() === input.getRootNode() && c.form === input.form,
          ) as HTMLInputElement[]
        : [input];

      for (const member of group) consumed.add(member);
      fields.push(buildGroupField(group, kind, doc, registry, headings));
      continue;
    }

    consumed.add(el);
    fields.push(buildSingleField(el, kind, doc, registry, headings));
  }

  // Repeated wrapper positions are local to each component tree.
  for (const field of fields) {
    const el = registry.get(field.fieldId)![0]!;
    if (adapter?.describe) Object.assign(field, adapter.describe(el));
    if (field.groupId) field.groupId = `${roots.indexOf(rootFor(el))}:${field.groupId}`;
  }
  return fields;
}

function nextId(): string {
  counter += 1;
  return `jaf-${counter}`;
}

function buildSingleField(
  el: FormControl,
  kind: ControlKind,
  doc: Document,
  registry: Map<string, FormControl[]>,
  headings: Headings,
): DetectedField {
  const fieldId = nextId();
  registry.set(fieldId, [el]);
  const section = sectionFor(el, doc, headings);

  const input = el as HTMLInputElement;
  const maxLengthAttr = el.getAttribute('maxlength');
  const maxLength = maxLengthAttr ? Number.parseInt(maxLengthAttr, 10) : null;

  return {
    fieldId,
    kind,
    inputType: el.tagName === 'INPUT' ? (input.type || 'text') : el.tagName.toLowerCase(),
    name: el.getAttribute('name') ?? '',
    id: el.id ?? '',
    placeholder: el.getAttribute('placeholder') ?? '',
    ariaLabel: el.getAttribute('aria-label') ?? '',
    label: labelTextFor(el, doc),
    legend: legendFor(el),
    nearbyText: nearbyTextFor(el),
    title: el.getAttribute('title') ?? '',
    autocomplete: el.getAttribute('autocomplete') ?? '',
    required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    maxLength: Number.isFinite(maxLength) && maxLength! > 0 ? maxLength : null,
    options: kind === 'select' ? optionsOfSelect(el as HTMLSelectElement) : [],
    // `?? ''` matters: linkedom leaves `value` undefined on untouched controls.
    currentValue: (el as HTMLInputElement).value ?? '',
    sectionKind: section.kind,
    sectionLabel: section.label,
    explicitIndex: parseOrdinal(
      el.getAttribute('name') ?? '',
      el.id ?? '',
      el.getAttribute('data-index') ?? '',
    ),
    groupId: groupIdFor(el, doc, headings, section.kind),
  };
}

function buildGroupField(
  group: HTMLInputElement[],
  kind: ControlKind,
  doc: Document,
  registry: Map<string, FormControl[]>,
  headings: Headings,
): DetectedField {
  const fieldId = nextId();
  registry.set(fieldId, group);
  const first = group[0]!;
  const section = sectionFor(first, doc, headings);

  const options: FieldOption[] = group.map((member) => ({
    value: member.value,
    label: optionLabelFor(member, doc),
  }));

  const question = groupQuestionFor(group, doc);
  const checked = group.find((m) => m.checked);

  return {
    fieldId,
    kind,
    inputType: first.type,
    name: first.name ?? '',
    id: group.length === 1 ? first.id ?? '' : '',
    placeholder: '',
    ariaLabel: first.getAttribute('aria-label') ?? '',
    // For a group the "label" is the question, not any single option's text.
    label: group.length === 1 ? labelTextFor(first, doc) : question,
    legend: legendFor(first),
    nearbyText: question,
    title: first.getAttribute('title') ?? '',
    autocomplete: first.getAttribute('autocomplete') ?? '',
    required: group.some((m) => m.hasAttribute('required')),
    maxLength: null,
    options,
    currentValue: checked ? checked.value ?? '' : '',
    sectionKind: section.kind,
    sectionLabel: section.label,
    explicitIndex: parseOrdinal(first.getAttribute('name') ?? '', first.id ?? ''),
    groupId: groupIdFor(first, doc, headings, section.kind),
  };
}
