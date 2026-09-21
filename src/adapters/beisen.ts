import type { SiteAdapter } from './types.ts';
import { genericAdapter } from './generic.ts';
import { classifySection } from '../core/sections.ts';

/** Verified against the live gdjztech Phoenix form, without generated CSS names. */
export const beisenAdapter: SiteAdapter = {
  id: 'beisen-gdjztech',
  hosts: ['jobs.gdjztech.com'],
  ignoreSelectors: genericAdapter.ignoreSelectors,
  describe(element) {
    const item = element.closest('.form-item');
    const label = item?.querySelector('.form-item__title .form-item__text')?.textContent?.trim();
    const entry = element.closest('.ux-standard-form .form');
    const result: ReturnType<NonNullable<SiteAdapter['describe']>> = {};
    if (label) result.label = label;
    if (entry) {
      // A single experience comprises several .form-part fragments. Only the
      // containing .form denotes an entry. Do not use the duplicate DOM id as
      // an entry identifier: cloned entries can share it.
      const entries = Array.from((element.getRootNode() as Document | ShadowRoot).querySelectorAll('.ux-standard-form .form'));
      result.groupId = `beisen-entry-${entries.indexOf(entry)}`;
      let ancestor = entry.parentElement;
      while (ancestor) {
        const heading = Array.from(ancestor.children).find(child =>
          child !== entry && child.id === entry.id && child.id !== '' &&
          !child.querySelector('input,textarea,select,.form') &&
          (child.textContent?.trim().length ?? 0) > 0 &&
          (child.textContent?.trim().length ?? 0) <= 40);
        if (heading) {
          result.sectionLabel = heading.textContent!.trim();
          result.sectionKind = classifySection(result.sectionLabel);
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    if (element.closest('.phoenix-select')) {
      result.manualReason = '此项是北森选择器，请在网页中选择；输入搜索文字不等于选中结果';
    } else if (element.closest('.phoenix-checkbox')?.textContent?.trim() === '至今') {
      result.manualReason = '请按这段经历的实际情况，在网页中勾选“至今”';
      result.label = '至今';
    }
    return result;
  },
};
