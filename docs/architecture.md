# Job Autofill — Architecture (V0.2)

## 1. Product boundary

Job Autofill is a **form-filling assistant**, not an application bot.

| Does | Does not |
| --- | --- |
| Detect visible form fields on the current page | Navigate or crawl job boards |
| Map fields to a locally stored Candidate Profile | Submit applications |
| Fill fields the user approves | Tick legal / consent declarations |
| Show confidence + evidence for every match | Solve CAPTCHA |
| Keep all data in `chrome.storage.local` | Enter SMS / OTP codes |
| — | Send candidate data off-device |

Those five "does not" items are enforced in code (`src/core/guards.ts`), not just
by convention: the filler refuses to write to any field a guard flags, and the
side panel labels them as blocked.

## 2. Component map

```
┌──────────────────────────── Chrome Side Panel (React) ────────────────────────┐
│  App.tsx                                                                      │
│   ├── PageHeader        current tab URL / adapter in use                      │
│   ├── DetectPanel       "Detect Form" → counts + per-group lists              │
│   ├── MatchList         auto-fill / needs-review / unmatched / blocked        │
│   └── ProfileEditor     JSON editor over CandidateProfile                     │
└───────────────┬───────────────────────────────────────────────┬───────────────┘
                │ chrome.tabs.sendMessage (via SW)              │ profile-store
                ▼                                               ▼
┌───────── background/service-worker.ts ─────────┐   ┌──── storage/profile-store ────┐
│ • opens side panel on action click             │   │ chrome.storage.local          │
│ • relays DETECT / FILL / PING to the tab       │   │ validate + migrate + defaults │
│ • injects content script on demand             │   └───────────────────────────────┘
└───────────────┬────────────────────────────────┘
                │ (content script, runs in page)
                ▼
┌──────────────────────── content/index.ts (message router) ────────────────────┐
│  field-detector.ts   DOM sweep → DetectedField[]  (visible, enabled, labelled)│
│  form-filler.ts      apply FillPlan → native setters + framework events       │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │ pure, DOM-free
                ▼
┌──────────────────────────────── core/ (unit-tested) ──────────────────────────┐
│  aliases.ts        zh / en / ja alias tables per field key                    │
│  field-matcher.ts  5-stage cascade → FieldMatch { fieldKey, confidence, … }   │
│  confidence.ts     score arithmetic + the 0.90 / 0.65 policy bands            │
│  guards.ts         sensitive-field + submit-control detection                 │
│  candidate-profile.ts  schema types, defaults, value resolution               │
└───────────────┬───────────────────────────────────────────────────────────────┘
                ▼
        adapters/generic.ts   (+ site adapters register here later)
```

The `core/` layer never touches the DOM. `field-detector.ts` converts DOM nodes
into plain `DetectedField` records; everything downstream operates on those
records, which is what makes the matcher unit-testable without a browser.

## 3. Data flow

### Detect
1. Side panel sends `DETECT` to the service worker.
2. SW resolves the active tab, ensures the content script is present
   (`chrome.scripting.executeScript` fallback for pages loaded before install),
   forwards the message.
3. `field-detector.ts` walks `input, select, textarea` inside every form plus
   orphan controls, filters to *visible and enabled*, and harvests context:
   `label[for]`, ancestor `<label>`, `aria-label`, `aria-labelledby`,
   `placeholder`, `name`, `id`, `title`, sibling text, fieldset `<legend>`,
   and `<option>` text for selects.
4. Radios/checkboxes are collapsed into one logical field per `name` with an
   `options[]` list, so "Gender: ○ Male ○ Female" is one field, not two.
5. Each field gets a stable `fieldId` (`jaf-<n>`) recorded in a `WeakMap` so a
   later `FILL` can find the same element without re-querying by selector.
6. Result travels back to the panel as `DetectResult`.

#### Recovering a label when the page never associated one

Component-library forms (ant-design, element-plus and the enterprise campus
systems built on them) are the hardest class to detect, because they break every
association at once: the `<label>` carries no `for`, the control carries no `id`,
its `name` is a generated token (`f_7a2c91`), and the two sit in *different
sibling columns* several `<div>`s apart. Nothing links them but layout.

So there are four routes to a label, in descending trustworthiness:

1. `label[for=id]` — the explicit association.
2. An ancestor `<label>` wrapping the control.
3. `aria-label` / `aria-labelledby`.
4. **A `<label>` in an earlier sibling of an ancestor** — walk up to 4 levels and
   scan up to 3 preceding siblings at each. This is the sibling-column case. It
   keys on `<label>` and document order rather than on framework class names, so
   it describes the layout itself and is not tied to any one library version.

Tables come in two orientations and they need opposite lookups. A *vertical*
table puts one field per row with its `<th>` on the left, so the label is the row
header. A *horizontal* table puts the labels in `<thead>` and one whole entry per
`<tbody>` row, so the label is the **column** header — and asking for the row
header there hands every input in the row the same text (the entire header line
concatenated), collapsing a seven-column table onto a single field key. A cell's
column position, counting colspans, is what identifies its label. A `<th>` above
a cell's column is as explicit an association as `label[for]`, so it scores on
the label path too.

Route 4 scores as a label (0.82), not as nearby text (0.70), because it really is
a `<label>` element. Failing all four, `nearbyTextFor` runs the same upward walk
over arbitrary text; it stops at the first text it finds, so a nearer sibling
always wins over a further ancestor and the evidence stays specific to the field.

### Match
`field-matcher.ts` runs a five-stage cascade per detected field. Stages are
ordered by trustworthiness and the **best** scoring candidate wins (not the
first — a weak exact-alias hit should lose to a strong semantic one):

| Stage | Signal | Base score |
| --- | --- | --- |
| 1 | Exact alias hit on a normalised token | 0.95 |
| 2 | Semantic HTML (`type=email`, `autocomplete=tel`, …) | 0.92 |
| 3 | Nearby label / legend / sibling text contains an alias | 0.82 |
| 4 | Fuzzy (token Jaccard + trigram Dice, CJK-aware) | 0.55–0.80 |
| 5 | Site adapter override | up to 0.99 |

Modifiers (in `confidence.ts`): +0.04 when two independent sources agree,
+0.08 when the field's section agrees with the key's, −0.20 when they conflict,
−0.15 when a rival key scores within 0.05 (ambiguity), −0.10 when the field
type contradicts the key (`type=number` for `fullName`), hard 0 for guarded
fields. Every match carries `evidence: Evidence[]` — `{ source, value, note }` —
so the panel can explain *why* it matched, which is the main trust mechanism.

### Section inference (V0.2)

A campus recruitment form typically prints 实习经历 and 工作经历 as two tables
whose inner labels are **identical** ("公司名称", "职位"). The label alone cannot
tell them apart, so `sections.ts` classifies the nearest preceding heading and
the detector records it on every field as `sectionKind`.

The matcher then does two things with it, in order:

1. **Remap.** The alias tables can only carry *qualified* labels (实习公司,
   实习开始时间), and real forms rarely write those — they state the section once
   in the heading and label the column plainly. So each candidate whose section
   disagrees with the heading has its counterpart in the heading's section
   offered alongside it, scored 0.04 below (inferred from structure, not read off
   the label). `SECTION_ROLES` in `field-matcher.ts` defines which keys play the
   same role across sections. The counterpart's own negative aliases still veto:
   a 现单位 inside an 实习经历 block means what it says and stays `work.company`.
2. **Bias.** Every candidate is then nudged ±by the modifiers above. This runs
   before ranking precisely so it can reorder — that reordering is the mechanism
   that separates `internship.company` from `work.company`.

Headings are located by an explicit document-order index rather than
`compareDocumentPosition`; see the comment on `sectionFor`.

An **unclassifiable heading ends the section above it** rather than extending it.
培训经历 following 工作经历 is the case that matters: if the unknown heading were
dropped, that table's 开始时间 would inherit `work` and be filled with a job start
date. Filling a field with the wrong value is worse than leaving it blank, so
fields under a heading we cannot classify get `sectionKind: 'unknown'`. Only
`<h1>`–`<h6>` under 40 characters count as section breaks — `HEADING_SELECTOR`
also matches `<legend>`, `<caption>` and `th[colspan]`, which are usually per-row
furniture and would fragment a section a real `<h2>` opened.

Some labels then mean nothing on their own. 开始时间 / from / 结束时间 name a *role
within a section*, not a field, so with no section to anchor them they are capped
just below the auto threshold: shown to the user, never written unreviewed. The
cap is applied to the final confidence rather than to the candidate score,
because the corroboration bonus runs afterwards and would lift it straight back
over the line.

### Entry inference (V0.2)

`FieldMatch.entryIndex` says which entry of a repeating section a field belongs
to, so a form asking for three employers fills all three. Two signals:

1. **An ordinal the page wrote itself.** `parseOrdinal` reads `work[1].company`
   as 0-based (JS frameworks emit `items[0]`) and `intern_2_company` /
   `company2` as 1-based (hand-written server forms label the first row `_1`).
   That split is a real ambiguity between two populations with no signal to
   resolve it, so the shape decides; a unit test pins both readings.
2. **Repeat counting.** Otherwise, the Nth field claiming a key within a section
   is entry N. `groupId` — the detector's id for the repeated wrapper a field
   sits in — refines this rather than replacing it: when a container has already
   claimed a key, its sibling fields join that same entry. It cannot be the
   primary signal, because "is this container repeated?" is a different question
   from "is this a second entry?" — a one-field-per-row layout repeats its
   `<div class="row">` around every single field.

A trailing digit is genuinely ambiguous, and signal 1 alone cannot read it: in
`f_edu_a1 / f_edu_a2 / f_edu_a3` the digit numbers the *fields* of one card,
while in `company1 / company2` it numbers the *entries*. `ordinalsNumberFields`
settles it from the repeat container — fields of one entry share a container, so
ordinals that disagree inside a single container cannot be entry numbers, and the
page's digits are then ignored in favour of repeat counting. One disagreement
disqualifies the whole page: a form mixes conventions far less often than it
numbers fields. Trusting the digit blindly did both possible harms at once — it
shattered one card into phantom entries, and collapsed two cards onto the same
indices so the second silently overwrote the first.

`dedupeByKey` keys on (fieldKey, entryIndex) rather than fieldKey alone: three
公司名称 inputs under one heading are three entries, not three rivals for one
slot. Two fields landing on the *same* slot are still rivals and still get
demoted to review.

### Fill
1. Panel builds a `FillPlan`: auto-fill entries (≥ 0.90) plus any
   needs-review entries (0.65–0.89) the user explicitly checked.
2. `form-filler.ts` resolves each `fieldId` back to its element, re-checks
   visibility + guards, then writes by control type:
   - text/textarea → native `value` setter from the prototype descriptor,
     then `input` + `change` (+ `blur`) events
   - select → match option by value, then exact text, then normalised text
   - checkbox/radio → `click()` on the matching option (respects framework
     handlers) with a `checked`-setter fallback
   - contenteditable → `beforeinput`/`input` with text node replacement
3. React/Vue detection: React tracks `_valueTracker` on the node, so the filler
   clears it before dispatching, otherwise React's dedupe swallows the event.
   Vue and native listeners need only the standard bubbling `input`/`change`.
4. Returns `FillResult[]` with `status: filled | skipped | failed` and a reason,
   which the panel renders inline. Nothing is submitted, ever.

## 4. Confidence policy

```
score >= 0.90            → AUTO      fill on "Fill"
0.65 <= score <= 0.8999  → REVIEW    fill only if user checks the box
score <  0.65            → SKIP      never filled, listed as unmatched
guarded field            → BLOCKED   never filled, reason shown
```

Thresholds live in one place (`confidence.ts: BANDS`) and are asserted by unit
tests so a scoring tweak that shifts a band fails loudly.

## 5. Privacy model

- Storage: `chrome.storage.local` only. No `sync` (would leave the device), no
  `IndexedDB`, no cookies.
- No `host_permissions` beyond `activeTab` + on-demand `scripting`; the content
  script is injected when the user clicks Detect, not on every page load.
- Manifest declares **no** network permissions. There is no `fetch` to any
  remote origin anywhere in `src/` — enforced by a lint test
  (`tests/no-network.test.ts`) that greps the built bundle.
- Schema deliberately has no field for ID card, passport, bank account, or
  national insurance numbers. `guards.ts` additionally refuses to *fill* a page
  field whose label looks like one of those, even if the user pasted such a
  value into a free-text profile field.

## 6. Testing strategy

| Layer | Tool | Scope |
| --- | --- | --- |
| Unit | `node:test` + `tsx` | matcher cascade, confidence bands, aliases, guards, profile resolution |
| DOM | `node:test` + `linkedom` | detector + filler against parsed fixture HTML |
| E2E | Playwright + persistent context | real extension loaded in Chromium, side panel driven, fixtures filled |

Fixtures (`src/tests/fixtures/`) are realistic recruitment forms:
`en-generic.html` (Workday-ish), `zh-generic.html` (BOSS/51job-ish),
`ja-generic.html` (Rikunabi-ish), `zh-campus.html` (a CN campus form with
separate 实习经历 / 工作经历 / 校园经历 sections, two entries each, and a
different ordinal convention per section so all of `parseOrdinal`'s readings and
both entry-numbering fallbacks are exercised by one page), plus
`react-like.html` (value-tracker semantics) and `hostile.html` (submit buttons,
consent checkboxes, CAPTCHA, SMS code, ID number — all of which must end up
BLOCKED).

## 7. Deliberate exclusions

No LLM / AI API. No resume file upload. No multi-page wizard traversal. No
site-specific adapters beyond `generic.ts` (the registry exists; it ships with
one entry). No cloud sync.

The panel UI is Chinese; code identifiers and this document stay English. The
matcher is trilingual (zh / en / ja).

### Known limits of entry inference

A form that mixes numbered and unnumbered fields *within one section* can put two
fields on the same (key, entryIndex). That is not silently wrong — `dedupeByKey`
demotes the pair to review — but it does mean the user has to decide. A form that
adds entry rows dynamically after Detect needs a re-Detect: `entryIndex` is
computed from the DOM as it was when the snapshot was taken.

A form asking for more entries than the profile holds leaves the surplus blank
(`resolveValue` returns null past the end) rather than repeating the last entry.
