/**
 * TypeScript mirror of schema/candidate-profile.schema.json.
 *
 * Deliberately absent: government ID, passport, bank account, national
 * insurance. There is no slot to put them in, so there is nothing to leak.
 */

import type { FieldKey, SectionKind } from './types.ts';

export const SCHEMA_VERSION = '0.1' as const;

export type Locale = 'zh' | 'en' | 'ja' | 'any' | '';
export type Gender = 'male' | 'female' | 'nonbinary' | 'undisclosed' | '';
export type Degree = 'highschool' | 'associate' | 'bachelor' | 'master' | 'doctorate' | 'other' | '';
export type EmploymentType = 'fulltime' | 'parttime' | 'contract' | 'internship' | 'freelance' | '';
export type WorkMode = 'onsite' | 'hybrid' | 'remote' | '';
export type Proficiency = 'native' | 'fluent' | 'professional' | 'intermediate' | 'basic' | '';
export type SalaryPeriod = 'year' | 'month' | 'day' | 'hour' | '';

export interface BasicInfo {
  fullName: string;
  firstName: string;
  lastName: string;
  middleName: string;
  preferredName: string;
  nameLatin: string;
  nameKana: string;
  pronouns: string;
  gender: Gender;
  birthDate: string;
  nationality: string;
  headline: string;
  summary: string;
  photoUrl: string;
}

export interface PostalAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface ProfileLinks {
  website: string;
  linkedin: string;
  github: string;
  portfolio: string;
  other: string[];
}

export interface ContactInfo {
  email: string;
  emailAlternate: string;
  phone: string;
  phoneCountryCode: string;
  phoneE164: string;
  wechat: string;
  line: string;
  address: PostalAddress;
  links: ProfileLinks;
}

export interface EducationEntry {
  school: string;
  schoolLatin: string;
  degree: Degree;
  degreeLabel: string;
  major: string;
  minor: string;
  startDate: string;
  endDate: string;
  ongoing: boolean;
  gpa: string;
  gpaScale: string;
  location: string;
  highlights: string[];
}

export interface WorkEntry {
  company: string;
  companyLatin: string;
  title: string;
  department: string;
  employmentType: EmploymentType;
  startDate: string;
  endDate: string;
  current: boolean;
  location: string;
  industry: string;
  teamSize: string;
  reportsTo: string;
  salaryLabel: string;
  leaveReason: string;
  description: string;
  highlights: string[];
}

export interface ProjectEntry {
  name: string;
  role: string;
  organization: string;
  startDate: string;
  endDate: string;
  url: string;
  repoUrl: string;
  techStack: string[];
  description: string;
  highlights: string[];
}

/**
 * Internships are their own section rather than WorkEntry rows tagged
 * `employmentType: 'internship'`. Campus recruitment forms in China commonly
 * print 实习经历 and 工作经历 as two separate tables, and a single list cannot
 * tell the matcher which table a "公司名称" belongs to.
 */
export interface InternshipEntry {
  company: string;
  companyLatin: string;
  title: string;
  department: string;
  startDate: string;
  endDate: string;
  ongoing: boolean;
  location: string;
  industry: string;
  /** Days per week / hours — often asked on internship forms. */
  commitment: string;
  description: string;
  highlights: string[];
}

/**
 * Campus and extracurricular experience: student council, clubs, volunteering,
 * competitions. Distinct from projects (which are deliverable-shaped) and from
 * work (which is employment-shaped).
 */
export interface CampusEntry {
  /** Club, society, student body, or the competition's organiser. */
  organization: string;
  /** The post held, e.g. 部长 / 队长 / 志愿者. */
  role: string;
  /** What the activity was, when the organisation name is not self-evident. */
  activity: string;
  startDate: string;
  endDate: string;
  ongoing: boolean;
  /** Prizes or honours attached to this activity. */
  awards: string;
  description: string;
  highlights: string[];
}

export interface LanguageEntry {
  language: string;
  proficiency: Proficiency;
  certification: string;
  score: string;
}

export interface SkillSet {
  primary: string[];
  secondary: string[];
  tools: string[];
  certifications: string[];
}

export interface JobPreferences {
  targetTitles: string[];
  targetIndustries: string[];
  employmentType: EmploymentType;
  workMode: WorkMode;
  preferredLocations: string[];
  willingToRelocate: boolean;
  noticePeriod: string;
  availableFrom: string;
  expectedSalary: string;
  expectedSalaryCurrency: string;
  salaryPeriod: SalaryPeriod;
  requiresVisaSponsorship: boolean;
  workAuthorization: string;
}

export interface AnswerTemplate {
  key: string;
  label: string;
  answer: string;
  locale: Locale;
  matchHints: string[];
}

export interface CandidateProfile {
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: string;
  basic: BasicInfo;
  contact: ContactInfo;
  education: EducationEntry[];
  workExperience: WorkEntry[];
  internships: InternshipEntry[];
  campusExperience: CampusEntry[];
  projects: ProjectEntry[];
  languages: LanguageEntry[];
  skills: SkillSet;
  jobPreferences: JobPreferences;
  answerTemplates: AnswerTemplate[];
  meta: { defaultLocale: Locale; notes: string };
}

export const EMPTY_EDUCATION: EducationEntry = {
  school: '', schoolLatin: '', degree: '', degreeLabel: '', major: '', minor: '',
  startDate: '', endDate: '', ongoing: false, gpa: '', gpaScale: '', location: '',
  highlights: [],
};

export const EMPTY_WORK: WorkEntry = {
  company: '', companyLatin: '', title: '', department: '', employmentType: '',
  startDate: '', endDate: '', current: false, location: '', industry: '', teamSize: '',
  reportsTo: '', salaryLabel: '', leaveReason: '', description: '', highlights: [],
};

export const EMPTY_PROJECT: ProjectEntry = {
  name: '', role: '', organization: '', startDate: '', endDate: '', url: '', repoUrl: '',
  techStack: [], description: '', highlights: [],
};

export const EMPTY_INTERNSHIP: InternshipEntry = {
  company: '', companyLatin: '', title: '', department: '', startDate: '', endDate: '',
  ongoing: false, location: '', industry: '', commitment: '', description: '', highlights: [],
};

export const EMPTY_CAMPUS: CampusEntry = {
  organization: '', role: '', activity: '', startDate: '', endDate: '', ongoing: false,
  awards: '', description: '', highlights: [],
};

export const EMPTY_LANGUAGE: LanguageEntry = {
  language: '', proficiency: '', certification: '', score: '',
};

export const EMPTY_ANSWER: AnswerTemplate = {
  key: '', label: '', answer: '', locale: 'any', matchHints: [],
};

export function createEmptyProfile(): CandidateProfile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    basic: {
      fullName: '', firstName: '', lastName: '', middleName: '', preferredName: '',
      nameLatin: '', nameKana: '', pronouns: '', gender: '', birthDate: '',
      nationality: '', headline: '', summary: '', photoUrl: '',
    },
    contact: {
      email: '', emailAlternate: '', phone: '', phoneCountryCode: '', phoneE164: '',
      wechat: '', line: '',
      address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
      links: { website: '', linkedin: '', github: '', portfolio: '', other: [] },
    },
    education: [],
    workExperience: [],
    internships: [],
    campusExperience: [],
    projects: [],
    languages: [],
    skills: { primary: [], secondary: [], tools: [], certifications: [] },
    jobPreferences: {
      targetTitles: [], targetIndustries: [], employmentType: '', workMode: '',
      preferredLocations: [], willingToRelocate: false, noticePeriod: '', availableFrom: '',
      expectedSalary: '', expectedSalaryCurrency: '', salaryPeriod: '',
      requiresVisaSponsorship: false, workAuthorization: '',
    },
    answerTemplates: [],
    meta: { defaultLocale: '', notes: '' },
  };
}

/** Fills any missing branch of a partially-shaped object read from storage. */
export function normalizeProfile(input: unknown): CandidateProfile {
  const base = createEmptyProfile();
  if (!input || typeof input !== 'object') return base;
  const raw = input as Record<string, unknown>;

  const mergeFlat = <T extends object>(fallback: T, value: unknown): T => {
    if (!value || typeof value !== 'object') return fallback;
    const out = { ...fallback } as Record<string, unknown>;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k in out && v !== null && v !== undefined) out[k] = v;
    }
    return out as T;
  };

  const arr = <T>(value: unknown, empty: T): T[] =>
    Array.isArray(value) ? value.map((v) => mergeFlat(empty as object, v) as T) : [];

  const contact = mergeFlat(base.contact, raw.contact);
  const rawContact = (raw.contact ?? {}) as Record<string, unknown>;
  contact.address = mergeFlat(base.contact.address, rawContact.address);
  contact.links = mergeFlat(base.contact.links, rawContact.links);

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    basic: mergeFlat(base.basic, raw.basic),
    contact,
    education: arr<EducationEntry>(raw.education, EMPTY_EDUCATION),
    workExperience: arr<WorkEntry>(raw.workExperience, EMPTY_WORK),
    internships: arr<InternshipEntry>(raw.internships, EMPTY_INTERNSHIP),
    campusExperience: arr<CampusEntry>(raw.campusExperience, EMPTY_CAMPUS),
    projects: arr<ProjectEntry>(raw.projects, EMPTY_PROJECT),
    languages: arr<LanguageEntry>(raw.languages, EMPTY_LANGUAGE),
    skills: mergeFlat(base.skills, raw.skills),
    jobPreferences: mergeFlat(base.jobPreferences, raw.jobPreferences),
    answerTemplates: arr<AnswerTemplate>(raw.answerTemplates, EMPTY_ANSWER),
    meta: mergeFlat(base.meta, raw.meta),
  };
}

export interface ResolvedValue {
  value: string;
  sourcePath: string;
}

/** Human-readable option labels for enum-ish keys, used when filling selects. */
/**
 * How a yes/no answer is actually worded on a choice control.
 *
 * Booleans resolve to the bare strings 'yes'/'no', which almost never appear as
 * an option label: real forms write 接受/不接受, 愿意/不愿意, 有/无, はい/いいえ.
 * Without these the option lookup finds nothing and the field silently fails to
 * fill even though the match was correct.
 *
 * Longer synonyms come first so the filler's substring fallback prefers 不接受
 * over 接受 — the negative contains the positive, and picking the wrong one here
 * would answer the opposite of what the user meant.
 */
const BOOLEAN_LABELS: Record<string, string[]> = {
  yes: [
    'yes', 'true', 'y', 'agree', 'accept', 'willing', 'available', 'have',
    '愿意', '接受', '同意', '可以', '需要', '是', '有',
    'はい', '可能', 'あり',
  ],
  no: [
    'no', 'false', 'n', 'disagree', 'not willing', 'do not accept', 'none',
    '不愿意', '不接受', '不同意', '不可以', '不需要', '没有', '无', '否',
    'いいえ', '不可', 'なし',
  ],
};

const ENUM_LABELS: Partial<Record<FieldKey, Record<string, string[]>>> = {
  'pref.willingToRelocate': BOOLEAN_LABELS,
  'pref.requiresVisaSponsorship': BOOLEAN_LABELS,
  'basic.gender': {
    male: ['male', 'man', '男', '男性', '男士'],
    female: ['female', 'woman', '女', '女性', '女士'],
    nonbinary: ['non-binary', 'nonbinary', '非二元'],
    undisclosed: ['prefer not to say', 'undisclosed', '不愿透露', '回答しない'],
  },
  'education.degree': {
    highschool: ['high school', '高中', '高校'],
    associate: ['associate', '专科', '大专', '短大'],
    bachelor: ["bachelor", "bachelor's", '本科', '学士', '大学卒'],
    master: ["master", "master's", '硕士', '修士', '大学院'],
    doctorate: ['doctorate', 'phd', '博士'],
  },
  'pref.employmentType': {
    fulltime: ['full-time', 'full time', 'fulltime', '全职', '正社員'],
    parttime: ['part-time', 'part time', '兼职', 'アルバイト'],
    contract: ['contract', 'contractor', '合同', '契約社員'],
    internship: ['internship', 'intern', '实习', 'インターン'],
    freelance: ['freelance', '自由职业'],
  },
  'pref.workMode': {
    onsite: ['on-site', 'onsite', 'in office', '现场', '出社'],
    hybrid: ['hybrid', '混合', 'ハイブリッド'],
    remote: ['remote', 'work from home', '远程', 'リモート'],
  },
  'language.proficiency': {
    native: ['native', '母语', 'ネイティブ'],
    fluent: ['fluent', '流利', '流暢'],
    professional: ['professional', 'business', '商务', 'ビジネス'],
    intermediate: ['intermediate', '中级', '中級'],
    basic: ['basic', 'beginner', '初级', '初級'],
  },
};

export function enumLabelsFor(key: FieldKey, value: string): string[] {
  const table = ENUM_LABELS[key];
  if (!table || !value) return value ? [value] : [];
  return table[value] ?? [value];
}

const joinList = (list: string[]): string => list.filter(Boolean).join(', ');


/**
 * Resolves the string to write into a field of the given key.
 *
 * `index` selects which entry of a repeating section to read (0-based); it is
 * ignored for the flat keys. Returns null when the profile has nothing to
 * offer — callers must treat that as "do not fill" rather than writing an empty
 * string over whatever the user already typed.
 */
export function resolveValue(
  profile: CandidateProfile,
  key: FieldKey,
  index = 0,
): ResolvedValue | null {
  const p = profile;
  const i = Number.isInteger(index) && index >= 0 ? index : 0;
  const edu = p.education[i];
  const work = p.workExperience[i];
  const intern = p.internships[i];
  const campus = p.campusExperience[i];
  const proj = p.projects[i];
  const lang = p.languages[i];
  const pref = p.jobPreferences;

  const hit = (value: string | boolean, sourcePath: string): ResolvedValue | null => {
    const str = typeof value === 'boolean' ? (value ? 'yes' : 'no') : value;
    return str ? { value: str, sourcePath } : null;
  };

  switch (key) {
    // basic — fullName falls back to composing from parts
    case 'basic.fullName': {
      const composed = p.basic.fullName || joinName(p.basic.firstName, p.basic.lastName);
      return hit(composed, 'basic.fullName');
    }
    case 'basic.firstName': return hit(p.basic.firstName, 'basic.firstName');
    case 'basic.lastName': return hit(p.basic.lastName, 'basic.lastName');
    case 'basic.middleName': return hit(p.basic.middleName, 'basic.middleName');
    case 'basic.preferredName':
      return hit(p.basic.preferredName || p.basic.firstName, 'basic.preferredName');
    case 'basic.nameLatin': return hit(p.basic.nameLatin, 'basic.nameLatin');
    case 'basic.nameKana': return hit(p.basic.nameKana, 'basic.nameKana');
    case 'basic.pronouns': return hit(p.basic.pronouns, 'basic.pronouns');
    case 'basic.gender': return hit(p.basic.gender, 'basic.gender');
    case 'basic.birthDate': return hit(p.basic.birthDate, 'basic.birthDate');
    case 'basic.nationality': return hit(p.basic.nationality, 'basic.nationality');
    case 'basic.headline': return hit(p.basic.headline, 'basic.headline');
    case 'basic.summary': return hit(p.basic.summary || p.basic.headline, 'basic.summary');

    // contact
    case 'contact.email': return hit(p.contact.email, 'contact.email');
    case 'contact.emailAlternate': return hit(p.contact.emailAlternate, 'contact.emailAlternate');
    case 'contact.phone': return hit(p.contact.phone, 'contact.phone');
    case 'contact.phoneCountryCode':
      return hit(p.contact.phoneCountryCode, 'contact.phoneCountryCode');
    case 'contact.wechat': return hit(p.contact.wechat, 'contact.wechat');
    case 'contact.line': return hit(p.contact.line, 'contact.line');
    case 'contact.address.line1': return hit(p.contact.address.line1, 'contact.address.line1');
    case 'contact.address.line2': return hit(p.contact.address.line2, 'contact.address.line2');
    case 'contact.address.city': return hit(p.contact.address.city, 'contact.address.city');
    case 'contact.address.state': return hit(p.contact.address.state, 'contact.address.state');
    case 'contact.address.postalCode':
      return hit(p.contact.address.postalCode, 'contact.address.postalCode');
    case 'contact.address.country': return hit(p.contact.address.country, 'contact.address.country');
    case 'contact.links.website': return hit(p.contact.links.website, 'contact.links.website');
    case 'contact.links.linkedin': return hit(p.contact.links.linkedin, 'contact.links.linkedin');
    case 'contact.links.github': return hit(p.contact.links.github, 'contact.links.github');
    case 'contact.links.portfolio': return hit(p.contact.links.portfolio, 'contact.links.portfolio');

    // education (repeating)
    case 'education.school': return hit(edu?.school ?? '', `education[${i}].school`);
    case 'education.degree':
      return hit(edu?.degree || edu?.degreeLabel || '', `education[${i}].degree`);
    case 'education.major': return hit(edu?.major ?? '', `education[${i}].major`);
    case 'education.startDate': return hit(edu?.startDate ?? '', `education[${i}].startDate`);
    case 'education.endDate': return hit(edu?.endDate ?? '', `education[${i}].endDate`);
    case 'education.gpa': return hit(edu?.gpa ?? '', `education[${i}].gpa`);

    // work (repeating)
    case 'work.company': return hit(work?.company ?? '', `workExperience[${i}].company`);
    case 'work.title': return hit(work?.title ?? '', `workExperience[${i}].title`);
    case 'work.department': return hit(work?.department ?? '', `workExperience[${i}].department`);
    case 'work.startDate': return hit(work?.startDate ?? '', `workExperience[${i}].startDate`);
    case 'work.endDate': return hit(work?.endDate ?? '', `workExperience[${i}].endDate`);
    case 'work.location': return hit(work?.location ?? '', `workExperience[${i}].location`);
    case 'work.industry': return hit(work?.industry ?? '', `workExperience[${i}].industry`);
    case 'work.leaveReason': return hit(work?.leaveReason ?? '', `workExperience[${i}].leaveReason`);
    case 'work.salaryLabel': return hit(work?.salaryLabel ?? '', `workExperience[${i}].salaryLabel`);
    case 'work.description':
      return hit(
        work?.description || (work?.highlights ?? []).join('\n'),
        `workExperience[${i}].description`,
      );

    // internships (repeating)
    case 'internship.company': return hit(intern?.company ?? '', `internships[${i}].company`);
    case 'internship.title': return hit(intern?.title ?? '', `internships[${i}].title`);
    case 'internship.department':
      return hit(intern?.department ?? '', `internships[${i}].department`);
    case 'internship.startDate': return hit(intern?.startDate ?? '', `internships[${i}].startDate`);
    case 'internship.endDate': return hit(intern?.endDate ?? '', `internships[${i}].endDate`);
    case 'internship.location': return hit(intern?.location ?? '', `internships[${i}].location`);
    case 'internship.description':
      return hit(
        intern?.description || (intern?.highlights ?? []).join('\n'),
        `internships[${i}].description`,
      );

    // campus / extracurricular (repeating)
    case 'campus.organization':
      return hit(campus?.organization ?? '', `campusExperience[${i}].organization`);
    case 'campus.role': return hit(campus?.role ?? '', `campusExperience[${i}].role`);
    case 'campus.activity':
      // Falls back to the organisation name when no separate activity is stored.
      return hit(
        campus?.activity || campus?.organization || '',
        `campusExperience[${i}].activity`,
      );
    case 'campus.startDate':
      return hit(campus?.startDate ?? '', `campusExperience[${i}].startDate`);
    case 'campus.endDate': return hit(campus?.endDate ?? '', `campusExperience[${i}].endDate`);
    case 'campus.awards': return hit(campus?.awards ?? '', `campusExperience[${i}].awards`);
    case 'campus.description':
      return hit(
        campus?.description || (campus?.highlights ?? []).join('\n'),
        `campusExperience[${i}].description`,
      );

    // projects (repeating)
    case 'project.name': return hit(proj?.name ?? '', `projects[${i}].name`);
    case 'project.role': return hit(proj?.role ?? '', `projects[${i}].role`);
    case 'project.url': return hit(proj?.url || proj?.repoUrl || '', `projects[${i}].url`);
    case 'project.description':
      return hit(
        proj?.description || (proj?.highlights ?? []).join('\n'),
        `projects[${i}].description`,
      );

    // languages (repeating) / skills
    case 'language.language': return hit(lang?.language ?? '', `languages[${i}].language`);
    case 'language.proficiency':
      return hit(lang?.proficiency ?? '', `languages[${i}].proficiency`);
    case 'skills.primary':
      return hit(joinList([...p.skills.primary, ...p.skills.secondary]), 'skills.primary');
    case 'skills.certifications':
      return hit(joinList(p.skills.certifications), 'skills.certifications');

    // preferences
    case 'pref.targetTitle': return hit(pref.targetTitles[0] ?? '', 'jobPreferences.targetTitles[0]');
    case 'pref.employmentType': return hit(pref.employmentType, 'jobPreferences.employmentType');
    case 'pref.workMode': return hit(pref.workMode, 'jobPreferences.workMode');
    case 'pref.preferredLocation':
      return hit(pref.preferredLocations[0] ?? '', 'jobPreferences.preferredLocations[0]');
    case 'pref.willingToRelocate':
      return hit(pref.willingToRelocate, 'jobPreferences.willingToRelocate');
    case 'pref.noticePeriod': return hit(pref.noticePeriod, 'jobPreferences.noticePeriod');
    case 'pref.availableFrom': return hit(pref.availableFrom, 'jobPreferences.availableFrom');
    case 'pref.expectedSalary': {
      const amount = pref.expectedSalary;
      if (!amount) return null;
      const currency = pref.expectedSalaryCurrency;
      return hit(currency ? `${amount} ${currency}`.trim() : amount, 'jobPreferences.expectedSalary');
    }
    case 'pref.requiresVisaSponsorship':
      return hit(pref.requiresVisaSponsorship, 'jobPreferences.requiresVisaSponsorship');
    case 'pref.workAuthorization':
      return hit(pref.workAuthorization, 'jobPreferences.workAuthorization');

    // long-form answers, looked up by template key
    case 'answer.coverLetter':
    case 'answer.selfIntroduction':
    case 'answer.whyThisCompany':
    case 'answer.strengths':
    case 'answer.careerGoal': {
      const wanted = key.slice('answer.'.length);
      const tpl = p.answerTemplates.find((t) => t.key === wanted);
      return tpl ? hit(tpl.answer, `answerTemplates[${wanted}].answer`) : null;
    }
  }
}

/** How many entries the profile holds for a repeating section. */
export function entryCountFor(profile: CandidateProfile, section: SectionKind): number {
  switch (section) {
    case 'education': return profile.education.length;
    case 'work': return profile.workExperience.length;
    case 'internship': return profile.internships.length;
    case 'campus': return profile.campusExperience.length;
    case 'project': return profile.projects.length;
    case 'language': return profile.languages.length;
    default: return 0;
  }
}

function joinName(first: string, last: string): string {
  if (!first && !last) return '';
  return [first, last].filter(Boolean).join(' ');
}
