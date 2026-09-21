import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import type { DetectedField } from '../core/types.ts';
import {
  createEmptyProfile,
  type CandidateProfile,
} from '../core/candidate-profile.ts';

const here = dirname(fileURLToPath(import.meta.url));

export function fixturePath(name: string): string {
  return resolve(here, 'fixtures', name);
}

/**
 * Parses a fixture with linkedom and installs the resulting globals so the
 * detector's `document` default and `getComputedStyle` calls resolve.
 */
export function loadFixture(name: string): Document {
  return loadHtml(readFileSync(fixturePath(name), 'utf8'));
}

/**
 * Same shims as `loadFixture`, over an inline HTML string. For tests that assert
 * on one specific DOM shape, where a whole fixture file would bury the point.
 */
export function loadHtml(html: string): Document {
  const { document, window } = parseHTML(html);

  // linkedom has no layout engine: getComputedStyle is absent and every element
  // reports a 0x0 box. In a real browser 0x0 legitimately means hidden, so
  // rather than loosening the detector we give the fixture a plausible layout.
  const win = window as unknown as {
    getComputedStyle: (el: Element) => Record<string, string>;
  };
  win.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });

  const proto = (window as unknown as { Element: { prototype: Element } }).Element.prototype as
    unknown as { getBoundingClientRect: () => DOMRect };
  proto.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 180, bottom: 28, width: 180, height: 28,
      toJSON: () => ({}) }) as DOMRect;

  return document as unknown as Document;
}

/** A DetectedField with sensible blanks, so tests only state what they mean. */
export function field(partial: Partial<DetectedField> = {}): DetectedField {
  return {
    fieldId: partial.fieldId ?? 'jaf-test',
    kind: partial.kind ?? 'text',
    inputType: partial.inputType ?? 'text',
    name: partial.name ?? '',
    id: partial.id ?? '',
    placeholder: partial.placeholder ?? '',
    ariaLabel: partial.ariaLabel ?? '',
    label: partial.label ?? '',
    legend: partial.legend ?? '',
    nearbyText: partial.nearbyText ?? '',
    title: partial.title ?? '',
    autocomplete: partial.autocomplete ?? '',
    required: partial.required ?? false,
    maxLength: partial.maxLength ?? null,
    options: partial.options ?? [],
    currentValue: partial.currentValue ?? '',
    // Defaults describe a field with no section context and no ordinal, so a
    // test that says nothing about V0.2 behaviour keeps its V0.1 meaning.
    sectionKind: partial.sectionKind ?? 'unknown',
    sectionLabel: partial.sectionLabel ?? '',
    explicitIndex: partial.explicitIndex ?? null,
    groupId: partial.groupId ?? '',
  };
}

/** A fully-populated profile used by fill and resolution tests. */
export function sampleProfile(): CandidateProfile {
  const p = createEmptyProfile();
  p.basic.fullName = '张伟';
  p.basic.firstName = 'Wei';
  p.basic.lastName = 'Zhang';
  p.basic.nameLatin = 'Zhang Wei';
  p.basic.nameKana = 'チョウ イ';
  p.basic.gender = 'male';
  p.basic.birthDate = '1995-04-12';
  p.basic.nationality = 'China';
  p.basic.headline = '前端工程师，6 年经验';
  p.basic.summary = '专注 Web 前端与设计系统建设，主导过多个跨端项目。';

  p.contact.email = 'zhangwei@example.com';
  p.contact.emailAlternate = 'wei.backup@example.com';
  p.contact.phone = '13800138000';
  p.contact.phoneCountryCode = '+86';
  p.contact.wechat = 'zhangwei_dev';
  p.contact.address.line1 = '朝阳区建国路 88 号';
  p.contact.address.city = '北京';
  p.contact.address.state = '北京';
  p.contact.address.postalCode = '100022';
  p.contact.address.country = 'China';
  p.contact.links.website = 'https://zhangwei.dev';
  p.contact.links.linkedin = 'https://linkedin.com/in/zhangwei';
  p.contact.links.github = 'https://github.com/zhangwei';
  p.contact.links.portfolio = 'https://zhangwei.dev/work';

  p.education = [
    {
      school: '清华大学',
      schoolLatin: 'Tsinghua University',
      degree: 'bachelor',
      degreeLabel: '工学学士',
      major: '计算机科学与技术',
      minor: '',
      startDate: '2013-09',
      endDate: '2017-06',
      ongoing: false,
      gpa: '3.8',
      gpaScale: '4.0',
      location: '北京',
      highlights: [],
    },
    {
      school: '北京大学',
      schoolLatin: 'Peking University',
      degree: 'master',
      degreeLabel: '工程硕士',
      major: '软件工程',
      minor: '',
      startDate: '2017-09',
      endDate: '2020-06',
      ongoing: false,
      gpa: '3.9',
      gpaScale: '4.0',
      location: '北京',
      highlights: [],
    },
  ];

  p.workExperience = [
    {
      company: '字节跳动',
      companyLatin: 'ByteDance',
      title: '高级前端工程师',
      department: '增长技术',
      employmentType: 'fulltime',
      startDate: '2021-03',
      endDate: '',
      current: true,
      location: '北京',
      industry: '互联网',
      teamSize: '12',
      reportsTo: '前端负责人',
      salaryLabel: '',
      leaveReason: '寻求更大的技术挑战',
      description: '负责增长中台的前端架构与设计系统。',
      highlights: ['将首屏加载时间降低 40%'],
    },
    {
      company: '美团',
      companyLatin: 'Meituan',
      title: '前端工程师',
      department: '到店事业群',
      employmentType: 'fulltime',
      startDate: '2020-07',
      endDate: '2021-02',
      current: false,
      location: '北京',
      industry: '互联网',
      teamSize: '8',
      reportsTo: '技术经理',
      salaryLabel: '',
      leaveReason: '希望进入更大规模的平台团队',
      description: '负责商家端后台的前端开发与性能优化。',
      highlights: [],
    },
  ];

  p.internships = [
    {
      company: '腾讯',
      companyLatin: 'Tencent',
      title: '前端开发实习生',
      department: 'CDG 广告平台',
      startDate: '2019-07',
      endDate: '2019-12',
      ongoing: false,
      location: '深圳',
      industry: '互联网',
      commitment: '每周 5 天',
      description: '参与广告投放后台的组件重构。',
      highlights: [],
    },
    {
      company: '小米',
      companyLatin: 'Xiaomi',
      title: '前端实习生',
      department: '互联网服务部',
      startDate: '2018-07',
      endDate: '2018-09',
      ongoing: false,
      location: '北京',
      industry: '消费电子',
      commitment: '每周 4 天',
      description: '负责活动落地页开发。',
      highlights: [],
    },
  ];

  p.campusExperience = [
    {
      organization: '清华大学学生科协',
      role: '技术部部长',
      activity: '校园开发者社区运营',
      startDate: '2015-09',
      endDate: '2016-06',
      ongoing: false,
      awards: '校级优秀学生干部',
      description: '组织每月技术分享，累计参与 800 人次。',
      highlights: [],
    },
    {
      organization: 'ACM 校队',
      role: '队员',
      activity: '程序设计竞赛',
      startDate: '2014-03',
      endDate: '2015-06',
      ongoing: false,
      awards: 'ACM-ICPC 亚洲区银奖',
      description: '参加区域赛并获奖。',
      highlights: [],
    },
  ];

  p.projects = [
    {
      name: '设计系统 Atlas',
      role: '技术负责人',
      organization: '字节跳动',
      startDate: '2022-01',
      endDate: '2023-06',
      url: 'https://atlas.example.com',
      repoUrl: '',
      techStack: ['React', 'TypeScript'],
      description: '统一 12 条业务线的组件库。',
      highlights: [],
    },
  ];

  p.languages = [
    { language: '中文', proficiency: 'native', certification: '', score: '' },
    { language: 'English', proficiency: 'professional', certification: 'IELTS 7.5', score: '7.5' },
  ];

  p.skills.primary = ['TypeScript', 'React', 'Vue'];
  p.skills.secondary = ['Node.js'];
  p.skills.certifications = ['AWS SAA'];

  p.jobPreferences.targetTitles = ['前端工程师', 'Frontend Engineer'];
  p.jobPreferences.employmentType = 'fulltime';
  p.jobPreferences.workMode = 'hybrid';
  p.jobPreferences.preferredLocations = ['北京', '上海'];
  p.jobPreferences.willingToRelocate = true;
  p.jobPreferences.noticePeriod = '一个月';
  p.jobPreferences.availableFrom = '2026-10-01';
  p.jobPreferences.expectedSalary = '60';
  p.jobPreferences.expectedSalaryCurrency = 'CNY';
  p.jobPreferences.salaryPeriod = 'year';
  p.jobPreferences.requiresVisaSponsorship = false;
  p.jobPreferences.workAuthorization = '中国公民，无需签证支持';

  p.answerTemplates = [
    {
      key: 'selfIntroduction',
      label: '自我介绍',
      answer: '我是一名前端工程师，六年来专注于大型 Web 应用与设计系统。',
      locale: 'any',
      matchHints: [],
    },
    {
      key: 'whyThisCompany',
      label: '应聘理由',
      answer: '贵公司在工程文化上的投入与我的职业方向高度契合。',
      locale: 'any',
      matchHints: [],
    },
    {
      key: 'coverLetter',
      label: '求职信',
      answer: '尊敬的招聘经理，我希望申请这个前端工程师岗位……',
      locale: 'any',
      matchHints: [],
    },
  ];

  return p;
}
