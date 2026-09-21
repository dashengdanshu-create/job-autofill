# Implementation plan — V0.1 → V0.2

Ordered so that each step is verifiable before the next depends on it.

## Phase 0 — Scaffold
- [x] `package.json`, `tsconfig.json`, esbuild bundle script (no framework CLI —
      keeps deps at React + esbuild + typescript + linkedom + playwright).
- [x] `manifest.json` (MV3, side panel, `activeTab` + `scripting` + `storage`,
      no host permissions, no network).

## Phase 1 — Schema + storage
- [x] `src/schema/candidate-profile.schema.json` — JSON Schema, draft 2020-12.
- [x] `src/core/candidate-profile.ts` — TS types mirroring the schema, defaults,
      `resolveValue(profile, fieldKey)` returning the fill value + source path.
- [x] `src/storage/profile-store.ts` — load / save / patch / export / import over
      `chrome.storage.local`, with version stamp and a redaction pass that
      strips sensitive keys on import.

## Phase 2 — Core matching (pure, no DOM)
- [x] `src/core/aliases.ts` — per-field-key alias sets in zh / en / ja, plus
      negative aliases to break known collisions
      (e.g. "公司名称" belongs to workExperience, not to fullName).
- [x] `src/core/confidence.ts` — band constants, modifier arithmetic, clamping.
- [x] `src/core/guards.ts` — sensitive-field patterns (ID card, passport, bank,
      CAPTCHA, SMS, consent, submit) in three languages.
- [x] `src/core/field-matcher.ts` — the 5-stage cascade, returns
      `FieldMatch { fieldKey, confidence, evidence, band }`.
- [x] `src/adapters/generic.ts` + adapter registry with host matching.

## Phase 3 — Content script
- [x] `src/content/field-detector.ts` — DOM → `DetectedField[]`, visibility
      filtering, radio/checkbox grouping, label harvesting, `WeakMap` registry.
- [x] `src/content/form-filler.ts` — framework-safe value setting + events.
- [x] `src/content/index.ts` — message router (`PING` / `DETECT` / `FILL`).

## Phase 4 — Background + side panel
- [x] `src/background/service-worker.ts` — side panel wiring, tab relay,
      on-demand injection.
- [x] `src/sidepanel/App.tsx` + `index.tsx` + `styles.css` — the six sections.

## Phase 5 — Tests
- [x] Unit: `field-matcher.test.ts`, `confidence.test.ts`, `guards.test.ts`,
      `profile.test.ts`.
- [x] DOM: `field-detector.test.ts`, `form-filler.test.ts` (linkedom).
- [x] Fixtures: en / zh / ja / react-like / hostile.
- [x] Privacy lint: `no-network.test.ts` over the built bundle.
- [x] E2E: `tests/e2e/extension.spec.ts` — load unpacked build in Chromium,
      open fixture, detect, fill, assert values + assert nothing submitted.

## Phase 6 — Run, fix, report
- [x] `npm run build && npm test && npm run test:e2e`, fix failures, report.

## Phase 7 — V0.2: internships, campus experience, multi-entry
- [x] `internships` + `campusExperience` in the schema, TS types, and the editor.
- [x] `FieldKey` dropped its baked-in indices (`work[0].company` → `work.company`);
      the ordinal moved to `FieldMatch.entryIndex`, so alias tables are written
      once instead of once per repetition.
- [x] `sections.ts`: `classifySection` (nearest preceding heading) and
      `parseOrdinal` (bracket 0-based / delimited and trailing 1-based).
- [x] Detector records `sectionKind`, `sectionLabel`, `explicitIndex`, `groupId`.
- [x] Matcher: section remap + section bias, entry-index assignment, and
      `dedupeByKey` re-keyed on (fieldKey, entryIndex).
- [x] Panel shows which entry each match targets（「工作经历 第2条 · 公司」）.
- [x] `zh-campus.html` fixture; `sections.test.ts` and `multi-entry.test.ts`;
      one more E2E covering the whole multi-entry flow.
- [x] Verified: typecheck + build clean, 223 unit tests, 8 E2E, 0 vulnerabilities.

## Phase 8 — Fix: detected but all unmatched (component-library forms)
Reported against an enterprise self-built campus system; reproduced locally.
- [x] `nearbyTextFor` anchored the ancestor climb on the control's *previous
      sibling*, so a control without one skipped the whole upward walk silently.
      Anchored on the element itself.
- [x] New label route: a `<label>` in an earlier sibling of an ancestor, for the
      two-column layout where `for`/`id`/`aria` are all absent.
- [x] `ordinalsNumberFields` — a trailing digit that numbers fields within one
      card is no longer read as an entry ordinal.
- [x] `zh-spa-form.html` fixture: the coverage blind spot (every existing fixture
      used `label[for]`, `<th>`, or `<dt>`).
- [x] Panel says 「未命名字段（代号）」 with a reason instead of a bare token.
- [x] Verified: 238 unit tests, 9 E2E, guards still block every sensitive field.

## Phase 9 — Fix: horizontal tables and unanchored labels
Second report from the same user: 5 of 46 fields matched.
- [x] Column-header lookup by cell position (`columnHeaderFor`), counting
      colspans. Row-header lookup gave every input in a row the same text.
- [x] `<th>` column headers score on the label path, not as nearby text, so the
      section heading picked up by the ancestor walk cannot dilute them.
- [x] Unclassifiable headings end the preceding section instead of being dropped,
      so 培训经历 no longer inherits `work` and takes a job date.
- [x] Section-agnostic labels (开始时间 / from) capped below auto when no section
      anchors them.
- [x] `work.salaryLabel` key + aliases, mutually vetoing `pref.expectedSalary`.
- [x] `zh-table-columns.html` fixture: the horizontal orientation, a merged
      header, and labels the profile has no slot for (证明人姓名, 培训机构).
- [x] Verified: 250 unit tests, 10 E2E, guards unchanged.

## Non-goals guarded against scope creep
LLM matching, resume parsing, file upload, multi-step wizard automation,
cloud sync, per-site adapters beyond generic, analytics of any kind.
