/**
 * Shared vocabulary between the DOM layer (content/) and the pure matching
 * layer (core/). Nothing here may reference DOM types — field-detector.ts is
 * responsible for flattening real elements into these plain records so the
 * matcher stays unit-testable outside a browser.
 */

/** Logical control kinds we support. */
export type ControlKind = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox';

/** One choice of a select / radio group / checkbox group. */
export interface FieldOption {
  /** The submitted value (`<option value>` / `<input value>`). */
  value: string;
  /** Human-visible text next to the control. */
  label: string;
}

/**
 * Which repeating section of the form a field appears to belong to.
 *
 * Recruitment forms routinely present 实习经历 and 工作经历 as separate tables
 * whose inner labels are identical ("公司名称", "职位"). Without the section
 * context those fields are indistinguishable, so the detector records the
 * nearest preceding section heading and the matcher uses it to pick between
 * otherwise-equal candidates.
 */
export type SectionKind =
  | 'education'
  | 'work'
  | 'internship'
  | 'campus'
  | 'project'
  | 'language'
  | 'unknown';

/**
 * A form control as seen by the detector, stripped of DOM identity.
 * `fieldId` is the only handle back to the live element (via a WeakMap in the
 * content script) — we never re-derive selectors, which would break on
 * re-render.
 */
export interface DetectedField {
  fieldId: string;
  /** Recognized field whose custom control needs manual interaction. */
  manualReason?: string;
  kind: ControlKind;
  /** Raw `type` attribute for inputs, e.g. email / tel / number / date. */
  inputType: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  /** Text from `<label for>`, ancestor `<label>`, or `aria-labelledby`. */
  label: string;
  /** Nearest fieldset `<legend>`, if any. */
  legend: string;
  /** Visible text scraped from preceding siblings / parent — the fallback. */
  nearbyText: string;
  title: string;
  autocomplete: string;
  required: boolean;
  maxLength: number | null;
  options: FieldOption[];
  /** Current value, so the filler can skip fields the user already filled. */
  currentValue: string;
  /** Section the nearest preceding heading / legend puts this field in. */
  sectionKind: SectionKind;
  /** The heading text that produced `sectionKind`, for the evidence trail. */
  sectionLabel: string;
  /**
   * Repeat-group ordinal parsed out of the field's own attributes — the `2` in
   * `work_2_company` or `education[1].school`, normalised to 0-based. Null when
   * the form gives no explicit ordinal, in which case the matcher assigns one
   * by document order.
   */
  explicitIndex: number | null;
  /**
   * DOM-container ordinal: fields sharing a repeated wrapper (a row, a card)
   * share a group id. Lets the matcher keep one entry's fields together even
   * when attribute names carry no ordinal.
   */
  groupId: string;
}

/** Where a piece of matching evidence came from, roughly best-first. */
export type EvidenceSource =
  | 'adapter'
  | 'alias-exact'
  | 'semantic-html'
  | 'label'
  | 'legend'
  | 'nearby-text'
  | 'fuzzy'
  | 'option-shape'
  | 'section'
  | 'ordinal'
  | 'guard';

export interface Evidence {
  source: EvidenceSource;
  /** The concrete string that triggered this evidence. */
  value: string;
  note?: string;
}

/** Confidence policy bands. */
export type MatchBand = 'auto' | 'review' | 'skip' | 'blocked';

export interface FieldMatch {
  fieldId: string;
  /** Null when nothing scored above the floor, or when the field is blocked. */
  fieldKey: FieldKey | null;
  /**
   * Which entry of a repeating section this field belongs to, 0-based. Always 0
   * for the non-repeating keys. Derived from the form's own ordinals where they
   * exist, otherwise from document order within a section.
   */
  entryIndex: number;
  confidence: number;
  band: MatchBand;
  evidence: Evidence[];
  /** Populated when band === 'blocked'. */
  blockedReason?: string;
  /** The value that would be written, resolved from the profile. */
  proposedValue?: string;
  /** Dotted path into CandidateProfile the value came from. */
  sourcePath?: string;
}

/**
 * Every profile slot the matcher can target.
 *
 * Keys name a *field*, never a specific entry: the ordinal lives in
 * `FieldMatch.entryIndex`. Keeping them separate means the alias tables are
 * written once instead of once per repetition, and a form with five employers
 * needs no new keys.
 */
export type FieldKey =
  // basic
  | 'basic.fullName'
  | 'basic.firstName'
  | 'basic.lastName'
  | 'basic.middleName'
  | 'basic.preferredName'
  | 'basic.nameLatin'
  | 'basic.nameKana'
  | 'basic.pronouns'
  | 'basic.gender'
  | 'basic.birthDate'
  | 'basic.nationality'
  | 'basic.headline'
  | 'basic.summary'
  // contact
  | 'contact.email'
  | 'contact.emailAlternate'
  | 'contact.phone'
  | 'contact.phoneCountryCode'
  | 'contact.wechat'
  | 'contact.line'
  | 'contact.address.line1'
  | 'contact.address.line2'
  | 'contact.address.city'
  | 'contact.address.state'
  | 'contact.address.postalCode'
  | 'contact.address.country'
  | 'contact.links.website'
  | 'contact.links.linkedin'
  | 'contact.links.github'
  | 'contact.links.portfolio'
  // education (repeating)
  | 'education.school'
  | 'education.degree'
  | 'education.major'
  | 'education.startDate'
  | 'education.endDate'
  | 'education.gpa'
  // work experience (repeating)
  | 'work.company'
  | 'work.title'
  | 'work.department'
  | 'work.startDate'
  | 'work.endDate'
  | 'work.location'
  | 'work.industry'
  | 'work.leaveReason'
  | 'work.salaryLabel'
  | 'work.description'
  // internships (repeating) — a separate section on most CN campus forms
  | 'internship.company'
  | 'internship.title'
  | 'internship.department'
  | 'internship.startDate'
  | 'internship.endDate'
  | 'internship.location'
  | 'internship.description'
  // campus / extracurricular experience (repeating)
  | 'campus.organization'
  | 'campus.role'
  | 'campus.activity'
  | 'campus.startDate'
  | 'campus.endDate'
  | 'campus.description'
  | 'campus.awards'
  // projects (repeating)
  | 'project.name'
  | 'project.role'
  | 'project.url'
  | 'project.description'
  // languages (repeating) / skills
  | 'language.language'
  | 'language.proficiency'
  | 'skills.primary'
  | 'skills.certifications'
  // preferences
  | 'pref.targetTitle'
  | 'pref.employmentType'
  | 'pref.workMode'
  | 'pref.preferredLocation'
  | 'pref.willingToRelocate'
  | 'pref.noticePeriod'
  | 'pref.availableFrom'
  | 'pref.expectedSalary'
  | 'pref.requiresVisaSponsorship'
  | 'pref.workAuthorization'
  // long-form answers
  | 'answer.coverLetter'
  | 'answer.selfIntroduction'
  | 'answer.whyThisCompany'
  | 'answer.strengths'
  | 'answer.careerGoal';

/** Messages crossing the panel ⇄ background ⇄ content boundary. */
export type RuntimeMessage =
  | { type: 'PING' }
  | { type: 'DETECT' }
  | { type: 'FILL'; plan: FillPlanEntry[] }
  | { type: 'HIGHLIGHT'; fieldId: string };

export interface FillPlanEntry {
  fieldId: string;
  value: string;
  kind: ControlKind;
}

/** Maps a FieldKey to the repeating profile array it draws from. */
export const SECTION_OF_KEY: Partial<Record<FieldKey, SectionKind>> = {
  'education.school': 'education',
  'education.degree': 'education',
  'education.major': 'education',
  'education.startDate': 'education',
  'education.endDate': 'education',
  'education.gpa': 'education',
  'work.company': 'work',
  'work.title': 'work',
  'work.department': 'work',
  'work.startDate': 'work',
  'work.endDate': 'work',
  'work.location': 'work',
  'work.industry': 'work',
  'work.leaveReason': 'work',
  'work.salaryLabel': 'work',
  'work.description': 'work',
  'internship.company': 'internship',
  'internship.title': 'internship',
  'internship.department': 'internship',
  'internship.startDate': 'internship',
  'internship.endDate': 'internship',
  'internship.location': 'internship',
  'internship.description': 'internship',
  'campus.organization': 'campus',
  'campus.role': 'campus',
  'campus.activity': 'campus',
  'campus.startDate': 'campus',
  'campus.endDate': 'campus',
  'campus.description': 'campus',
  'campus.awards': 'campus',
  'project.name': 'project',
  'project.role': 'project',
  'project.url': 'project',
  'project.description': 'project',
  'language.language': 'language',
  'language.proficiency': 'language',
};

/** True for keys backed by an array, i.e. keys where entryIndex is meaningful. */
export function isRepeatingKey(key: FieldKey): boolean {
  return key in SECTION_OF_KEY;
}

export interface DetectResult {
  url: string;
  title: string;
  adapterId: string;
  fields: DetectedField[];
  matches: FieldMatch[];
}

export type FillStatus = 'filled' | 'skipped' | 'failed';

export interface FillResult {
  fieldId: string;
  status: FillStatus;
  reason?: string;
  writtenValue?: string;
}
