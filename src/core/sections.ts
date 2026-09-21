/**
 * Section and ordinal inference for repeating form groups.
 *
 * Two problems this solves:
 *
 * 1. **Which section?** A campus recruitment form often prints 实习经历 and
 *    工作经历 as two tables whose inner labels are identical ("公司名称").
 *    The label alone cannot disambiguate them, so we classify the nearest
 *    preceding heading and let the matcher prefer keys from that section.
 *
 * 2. **Which entry?** A form asking for three employers repeats the same
 *    labels three times. Where the form numbers its own fields
 *    (`work_2_company`, `education[1].school`) we trust that; otherwise we
 *    number by document order within each section.
 */

import type { SectionKind } from './types.ts';
import { normalizeLabel } from './normalize.ts';

/**
 * Heading vocabulary per section, most specific first. Order matters: 实习经历
 * must be tested before 工作经历 or the shared 经历 suffix would misfile it.
 */
const SECTION_HEADINGS: Array<{ kind: SectionKind; needles: string[] }> = [
  {
    kind: 'internship',
    needles: [
      'internship experience', 'internship history', 'internships', 'internship',
      'intern experience',
      '实习经历', '实习经验', '实习信息', '实习情况', '实习履历',
      'インターン経験', 'インターンシップ', '実習経験',
    ],
  },
  {
    kind: 'campus',
    needles: [
      'campus experience', 'extracurricular', 'student activities', 'campus activities',
      'club experience', 'volunteer experience', 'leadership experience',
      'awards and honors', 'honors and awards',
      '校园经历', '在校经历', '校内经历', '课外活动', '社会实践', '社团经历',
      '学生工作', '校园活动', '获奖情况', '荣誉奖项', '志愿服务',
      '課外活動', 'サークル活動', '学生時代',
    ],
  },
  {
    kind: 'education',
    needles: [
      'education', 'education history', 'educational background', 'academic background',
      'education experience', 'schooling',
      '教育经历', '教育背景', '学历信息', '教育信息', '学习经历', '学籍信息',
      '学歴', '学歴情報', '最終学歴',
    ],
  },
  {
    kind: 'work',
    needles: [
      'work experience', 'employment history', 'work history', 'professional experience',
      'employment', 'career history', 'previous employment',
      '工作经历', '工作经验', '工作履历', '职业经历', '任职经历', '就职经历', '工作信息',
      '職歴', '職務経歴', '就業経験',
    ],
  },
  {
    kind: 'project',
    needles: [
      'project experience', 'projects', 'project history', 'portfolio projects',
      '项目经历', '项目经验', '项目信息',
      'プロジェクト経験', '担当プロジェクト',
    ],
  },
  {
    kind: 'language',
    needles: [
      'language skills', 'languages', 'language proficiency',
      '语言能力', '语言技能', '外语能力',
      '語学力', '語学スキル',
    ],
  },
];

/** Classifies a heading / legend string into a section, or 'unknown'. */
export function classifySection(heading: string): SectionKind {
  const norm = normalizeLabel(heading);
  if (!norm) return 'unknown';
  for (const { kind, needles } of SECTION_HEADINGS) {
    for (const needle of needles) {
      if (norm.includes(normalizeLabel(needle))) return kind;
    }
  }
  return 'unknown';
}

/**
 * Extracts a repeat ordinal from a field's attributes.
 *
 * Recognised shapes, all normalised to 0-based:
 *   work[1].company   → 1      (already 0-based, bracket form)
 *   work_2_company    → 1      (1-based, underscore form)
 *   education-3-major → 2      (1-based, dash form)
 *   company2          → 1      (1-based, bare suffix)
 *
 * Returns null when no ordinal is present, which is the common case for forms
 * that render each entry into an identically-named group of inputs.
 *
 * The ambiguity between 0-based brackets and 1-based suffixes is real: JS
 * frameworks emit `items[0]`, whereas hand-written server forms label the first
 * row `_1`. We treat brackets as 0-based and everything else as 1-based, which
 * matches what those two populations actually do.
 */
export function parseOrdinal(...attributes: string[]): number | null {
  for (const raw of attributes) {
    if (!raw) continue;

    // Bracket form is 0-based: work[1].company, items[0][name]
    const bracket = raw.match(/\[(\d{1,2})\]/);
    if (bracket?.[1] !== undefined) {
      const n = Number.parseInt(bracket[1], 10);
      if (n >= 0 && n < 50) return n;
    }

    // Delimited form is 1-based: work_2_company, education-3-major
    const delimited = raw.match(/[_\-.](\d{1,2})(?:[_\-.]|$)/);
    if (delimited?.[1] !== undefined) {
      const n = Number.parseInt(delimited[1], 10);
      if (n >= 1 && n <= 50) return n - 1;
    }

    // Bare trailing digit is 1-based: company2, school3
    const trailing = raw.match(/[a-z\]](\d{1,2})$/i);
    if (trailing?.[1] !== undefined) {
      const n = Number.parseInt(trailing[1], 10);
      if (n >= 1 && n <= 50) return n - 1;
    }
  }
  return null;
}

export const SECTION_LABELS: Record<SectionKind, string> = {
  education: '教育经历',
  work: '工作经历',
  internship: '实习经历',
  campus: '校园经历',
  project: '项目经历',
  language: '语言能力',
  unknown: '未归类',
};
