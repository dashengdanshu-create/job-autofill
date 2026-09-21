import type { SiteAdapter } from './types.ts';
import type { FieldKey, SectionKind } from '../core/types.ts';
import { genericAdapter } from './generic.ts';
import { classifySection, SECTION_LABELS } from '../core/sections.ts';
import { normalizeLabel } from '../core/normalize.ts';

const SECTIONS: Record<string, SectionKind> = {
  education: 'education', career: 'work', internship: 'internship', project: 'project',
};
const KEYS: Record<string, Record<string, FieldKey>> = {
  education: { school: 'education.school', degree: 'education.degree', fieldOfStudy: 'education.major' },
  career: { company: 'work.company', title: 'work.title', desc: 'work.description' },
  internship: { company: 'internship.company', title: 'internship.title', desc: 'internship.description' },
  project: { name: 'project.name', role: 'project.role', link: 'project.url', desc: 'project.description' },
};
function pathOf(id: string) {
  const match = /^(education|career|internship|project)\[(\d{1,2})\]\.([a-zA-Z]+)$/.exec(id);
  if (!match || Number(match[2]) >= 50) return null;
  return { section: match[1]!, index: Number(match[2]), name: match[3]! };
}
const LABEL_KEYS: Partial<Record<SectionKind, Record<string, FieldKey>>> = {
  work: { '公司名称': 'work.company', '职位名称': 'work.title', '描述': 'work.description', description: 'work.description' },
  internship: { '公司名称': 'internship.company', '职位名称': 'internship.title', '描述': 'internship.description', description: 'internship.description' },
  project: { '项目名称': 'project.name', '项目角色': 'project.role', '项目链接': 'project.url', '描述': 'project.description', description: 'project.description' },
};

/** Platform-wide, using semantic paths and stable form classes, never tenant IDs. */
export const feishuAdapter: SiteAdapter = {
  id: 'feishu-jobs', hosts: ['jobs.feishu.cn'],
  ignoreSelectors: [...(genericAdapter.ignoreSelectors ?? []),
    '.resumeEditForm-hiddenField input', '.atsx-date-picker-period-hidden-input',
    '.noExperience-container input[type=checkbox]'],
  describe(element) {
    const result: ReturnType<NonNullable<SiteAdapter['describe']>> = {};
    const item = element.closest('.atsx-form-item');
    const label = item?.querySelector('.atsx-form-item-label label')?.textContent?.trim();
    if (label) result.label = label;
    const path = pathOf(element.id || element.getAttribute('name') || '');
    const wrapper = element.closest('.resumeEditForm-item');
    const section = element.closest('.createFormSection-container');
    const heading = section?.querySelector('.createFormSection-left')?.textContent?.trim() ?? '';
    // Scoped heading also ends the previous section for unrecognized questions.
    if (section) {
      result.sectionKind = classifySection(heading);
      result.sectionLabel = heading;
    }
    if (path) {
      result.sectionKind = SECTIONS[path.section]!;
      result.sectionLabel = SECTION_LABELS[result.sectionKind];
      result.explicitIndex = path.index;
      result.groupId = `feishu-${path.section}-${path.index}`;
    } else if (wrapper && section) {
      const entries = Array.from(section.querySelectorAll('.resumeEditForm-item'));
      const index = entries.indexOf(wrapper);
      const roots = Array.from((element.getRootNode() as Document | ShadowRoot).querySelectorAll('.createFormSection-container'));
      result.explicitIndex = index >= 0 ? index : null;
      result.groupId = `feishu-section-${roots.indexOf(section)}-entry-${index}`;
    }
    if (element.closest('.atsx-select')) {
      result.manualReason = '此项是飞书下拉或联想选择器，请在网页中选中结果；搜索文字不代表已选中';
    }
    return result;
  },
  match(field) {
    const path = pathOf(field.id || field.name);
    const key = path ? KEYS[path.section]?.[path.name] : LABEL_KEYS[field.sectionKind]?.[normalizeLabel(field.label)];
    return key ? { fieldKey: key, score: 0.99,
      note: path ? '飞书招聘标准字段路径（包含区块和条目序号）' : '飞书招聘区块内的字段标签' } : null;
  },
};
