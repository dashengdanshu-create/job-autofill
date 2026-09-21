/**
 * Writes values into real controls in a way React, Vue, and plain listeners all
 * observe.
 *
 * Use the native prototype setter so React can observe a value different from
 * its last rendered value. DOM readback alone does not prove the website has
 * committed its application state, much less saved data on the server.
 *
 * Guards are re-checked here even though the matcher already banded the field —
 * a plan built moments ago could target a control the page has since swapped.
 */

import type { ControlKind, DetectedField, FillPlanEntry, FillResult } from '../core/types.ts';
import { guardField } from '../core/guards.ts';
import { normalizeLabel } from '../core/normalize.ts';
import { elementsFor, type FormControl } from './field-detector.ts';

interface ReactTrackedNode {
  _valueTracker?: { setValue(value: string): void; getValue(): string };
}

/** Resets React's cached value so the next `input` event is not deduped. */
function clearReactTracker(el: Element, previous: string): void {
  const tracked = el as unknown as ReactTrackedNode;
  const tracker = tracked._valueTracker;
  if (tracker && typeof tracker.setValue === 'function') {
    // Any value different from what we are about to set works; the previous
    // value is the natural choice.
    tracker.setValue(previous);
  }
}

/**
 * Assigns through the prototype's own setter. Frameworks that define an
 * instance-level `value` property (or wrap the descriptor) would otherwise
 * intercept the write and drop it.
 */
function setNativeValue(el: FormControl, value: string): void {
  // Walk the prototype chain: the setter lives on HTMLInputElement.prototype
  // (or HTMLSelectElement/HTMLTextAreaElement), which may be several links up.
  let proto: object | null = Object.getPrototypeOf(el) as object | null;
  while (proto) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) {
      descriptor.set.call(el, value);
      return;
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }

  const own = Object.getOwnPropertyDescriptor(el, 'value');
  if (own?.set) {
    own.set.call(el, value);
    return;
  }

  // No setter anywhere. Assigning would throw in strict mode, and the caller
  // verifies the result anyway, so fail quietly and let it report 'failed'.
  try {
    (el as { value: string }).value = value;
  } catch {
    /* reported by the caller's value check */
  }
}

function setNativeChecked(el: HTMLInputElement, checked: boolean): void {
  let proto: object | null = Object.getPrototypeOf(el) as object | null;
  while (proto) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'checked');
    if (descriptor?.set) {
      descriptor.set.call(el, checked);
      return;
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  try {
    el.checked = checked;
  } catch {
    /* reported by the caller's check */
  }
}

function makeEvent(type: string, win: Window & typeof globalThis): Event {
  // InputEvent where the platform has it — some listeners check `instanceof`.
  if (type === 'input' || type === 'beforeinput') {
    const Ctor = (win as unknown as { InputEvent?: typeof InputEvent }).InputEvent;
    if (typeof Ctor === 'function') {
      return new Ctor(type, { bubbles: true, composed: true, cancelable: type === 'beforeinput' });
    }
  }
  return new win.Event(type, { bubbles: true, composed: true, cancelable: false });
}

function dispatchInputSequence(el: Element, win: Window & typeof globalThis): void {
  el.dispatchEvent(makeEvent('input', win));
  el.dispatchEvent(makeEvent('change', win));
}

function windowOf(el: Element): Window & typeof globalThis {
  const win = el.ownerDocument?.defaultView;
  return (win ?? (globalThis as unknown as Window & typeof globalThis)) as Window &
    typeof globalThis;
}

function fillTextLike(el: FormControl, value: string): FillResult['status'] {
  const win = windowOf(el);
  const previous = (el as HTMLInputElement).value ?? '';

  // Focus first: some sites only wire validation on focused fields.
  (el as HTMLElement).focus?.();

  // Let editors cancel the proposed insertion before changing their contents.
  const before = makeEvent('beforeinput', win);
  if (!el.dispatchEvent(before)) return 'failed';
  clearReactTracker(el, previous);
  setNativeValue(el, value);
  dispatchInputSequence(el, win);
  (el as HTMLElement).blur?.();

  return (el as HTMLInputElement).value === value ? 'filled' : 'failed';
}

/** Picks the option whose value, then exact text, then normalised text matches. */
function findOption(select: HTMLSelectElement, wanted: string): HTMLOptionElement | null {
  const options = Array.from(select.options);
  const target = normalizeLabel(wanted);

  const byValue = options.find((o) => o.value === wanted);
  if (byValue) return byValue;

  const byExactText = options.find((o) => (o.textContent ?? '').trim() === wanted.trim());
  if (byExactText) return byExactText;

  const byNormValue = options.find((o) => normalizeLabel(o.value) === target);
  if (byNormValue) return byNormValue;

  const byNormText = options.find((o) => normalizeLabel(o.textContent ?? '') === target);
  if (byNormText) return byNormText;

  // Last resort: a substring hit, but only when unambiguous.
  const partial = options.filter((o) => {
    const text = normalizeLabel(o.textContent ?? '');
    return text.length > 0 && (text.includes(target) || target.includes(text));
  });
  return partial.length === 1 ? partial[0]! : null;
}

function fillSelect(select: HTMLSelectElement, value: string): FillResult['status'] {
  const option = findOption(select, value);
  if (!option) return 'failed';

  const win = windowOf(select);
  const previous = select.value;
  (select as HTMLElement).focus?.();
  clearReactTracker(select, previous);
  setNativeValue(select, option.value);

  // Selecting the option directly also covers engines where `select.value` has
  // no setter, and keeps selectedIndex consistent for listeners that read it.
  option.selected = true;
  if (select.selectedIndex !== option.index && option.index >= 0) {
    select.selectedIndex = option.index;
  }

  dispatchInputSequence(select, win);
  (select as HTMLElement).blur?.();

  return select.value === option.value || option.selected ? 'filled' : 'failed';
}

/** Yes/no answers that a single checkbox encodes. */
const AFFIRMATIVE = new Set(['yes', 'true', '1', 'on', 'y', '是', '需要', 'はい']);
const NEGATIVE = new Set(['no', 'false', '0', 'off', 'n', '否', '不需要', 'いいえ']);

function fillChoiceGroup(
  members: HTMLInputElement[],
  value: string,
  kind: ControlKind,
): FillResult['status'] {
  const win = windowOf(members[0]!);
  const target = normalizeLabel(value);

  // Single checkbox acting as a boolean.
  if (kind === 'checkbox' && members.length === 1) {
    const box = members[0]!;
    const wantChecked = AFFIRMATIVE.has(target)
      ? true
      : NEGATIVE.has(target)
        ? false
        : null;
    if (wantChecked === null) return 'failed';
    if (box.checked === wantChecked) return 'filled';
    box.focus?.();
    try {
      box.click();
    } catch {
      setNativeChecked(box, wantChecked);
      dispatchInputSequence(box, win);
    }
    if (box.checked !== wantChecked) {
      setNativeChecked(box, wantChecked);
      dispatchInputSequence(box, win);
    }
    return box.checked === wantChecked ? 'filled' : 'failed';
  }

  const match = members.find((m) => {
    if (normalizeLabel(m.value) === target) return true;
    const labelText = normalizeLabel(labelOf(m));
    return labelText === target || (labelText.length > 1 && labelText.includes(target));
  });
  if (!match) return 'failed';
  if (match.checked) return 'filled';

  match.focus?.();
  try {
    // click() runs the page's own handlers — the most faithful simulation.
    match.click();
  } catch {
    setNativeChecked(match, true);
    dispatchInputSequence(match, win);
  }
  if (!match.checked) {
    setNativeChecked(match, true);
    dispatchInputSequence(match, win);
  }
  return match.checked ? 'filled' : 'failed';
}

function labelOf(el: HTMLInputElement): string {
  const ancestor = el.closest('label');
  if (ancestor?.textContent) return ancestor.textContent;
  const doc = el.ownerDocument;
  if (el.id && doc) {
    const label = (el.getRootNode() as Document | ShadowRoot).querySelector(`label[for="${el.id.replace(/"/g, '\\"')}"]`);
    if (label?.textContent) return label.textContent;
  }
  return el.value;
}

/**
 * Applies a plan. Detection must have run in this document first — the plan's
 * fieldIds resolve through the detector's registry.
 *
 * `snapshot` is the DetectedField list from that detect pass; the filler
 * re-checks each entry's guard verdict against it rather than re-detecting,
 * which would renumber fieldIds mid-batch and invalidate the plan.
 */
export function fillFields(
  plan: FillPlanEntry[],
  snapshot: DetectedField[] = [],
  doc?: Document,
): FillResult[] {
  const byId = new Map(snapshot.map((f) => [f.fieldId, f]));
  return plan.map((entry) => applyOne(entry, byId.get(entry.fieldId), doc));
}

/**
 * Production path: yield between fields so queued framework state updates can
 * finish before another field's handler reads the form state. Then recheck all
 * writes after the last field, catching later rerenders that revert earlier
 * values. This checks DOM retention only; it never claims server persistence.
 */
export async function fillFieldsSettled(
  plan: FillPlanEntry[],
  snapshot: DetectedField[] = [],
  doc?: Document,
): Promise<FillResult[]> {
  const byId = new Map(snapshot.map((f) => [f.fieldId, f]));
  const results: FillResult[] = [];
  const expected = new Map<string, { elements: FormControl[]; states: string[] }>();
  const stateOf = (el: FormControl): string =>
    el.type === 'radio' || el.type === 'checkbox'
      ? String((el as HTMLInputElement).checked) : el.value;
  const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const verify = (result: FillResult): FillResult => {
    if (result.status !== 'filled') return result;
    const saved = expected.get(result.fieldId)!;
    if (saved.elements.some((el, index) => !el.isConnected || stateOf(el) !== saved.states[index])) {
      return {
        fieldId: result.fieldId, status: 'failed',
        reason: '页面更新后内容未保留，请重新检测或手动输入；尚未确认网站保存',
      };
    }
    return result;
  };
  for (const entry of plan) {
    const field = byId.get(entry.fieldId);
    const pageWrite = (entry.kind === 'text' || entry.kind === 'textarea') &&
      typeof chrome !== 'undefined' && !!chrome.runtime?.id;
    let result: FillResult;
    if (pageWrite) {
      // All existing guards run before the main-world request. No values are
      // published through window.postMessage or page-visible event payloads.
      result = applyOne(entry, field, doc, true);
      if (result.status === 'filled') {
        const el = elementsFor(entry.fieldId, doc)[0]!;
        const token = crypto.randomUUID();
        el.setAttribute('data-jaf-write', token);
        try {
          el.focus?.();
          if (!el.dispatchEvent(makeEvent('beforeinput', windowOf(el)))) {
            throw new Error('页面取消了输入');
          }
          setNativeValue(el, entry.value);
          el.dispatchEvent(new (windowOf(el).Event)('jaf-commit-text', { bubbles: true, composed: true }));
          for (let elapsed = 0; elapsed < 1000; elapsed += 20) {
            if (el.getAttribute('data-jaf-write-result')?.startsWith(`${token}:`)) break;
            await pause(20);
          }
          if (el.getAttribute('data-jaf-write-result') !== `${token}:ok` || !el.isConnected || el.value !== entry.value) {
            result = { fieldId: entry.fieldId, status: 'failed', reason: '网页未确认输入或内容已回滚，请重新检测；尚未确认网站保存' };
          }
        } catch {
          result = { fieldId: entry.fieldId, status: 'failed', reason: '网页输入处理失败，请重新加载扩展' };
        } finally {
          el.removeAttribute('data-jaf-write');
          el.removeAttribute('data-jaf-write-result');
        }
      }
    } else result = applyOne(entry, field, doc);
    if (result.status === 'filled') {
      const elements = elementsFor(entry.fieldId, doc);
      expected.set(entry.fieldId, { elements: [...elements], states: elements.map(stateOf) });
      await pause(150);
    }
    results.push(verify(result));
  }
  if (expected.size) await pause(350);
  return results.map(verify);
}

function applyOne(
  entry: FillPlanEntry,
  snapshot: DetectedField | undefined,
  doc?: Document,
  validateOnly = false,
): FillResult {
  const elements = elementsFor(entry.fieldId, doc);
  if (elements.length === 0) {
    return { fieldId: entry.fieldId, status: 'failed', reason: '页面元素已失效，请重新检测' };
  }
  if (snapshot?.manualReason) {
    return { fieldId: entry.fieldId, status: 'skipped', reason: snapshot.manualReason };
  }
  if (!entry.value) {
    return { fieldId: entry.fieldId, status: 'skipped', reason: '档案中没有对应内容' };
  }

  const first = elements[0]!;
  if (!first.isConnected) {
    return { fieldId: entry.fieldId, status: 'failed', reason: '页面元素已从文档移除' };
  }
  if (first.disabled || (first as HTMLInputElement).readOnly) {
    return { fieldId: entry.fieldId, status: 'skipped', reason: '字段不可编辑' };
  }

  // Defence in depth: the plan may have been built against an older DOM, so
  // re-run the guard rather than trusting the band the matcher assigned.
  if (snapshot) {
    const verdict = guardField(snapshot);
    if (verdict.blocked) {
      return { fieldId: entry.fieldId, status: 'skipped', reason: `已拦截：${verdict.reason}` };
    }
  }
  if (first.type === 'password' || first.type === 'file' || first.type === 'hidden') {
    return { fieldId: entry.fieldId, status: 'skipped', reason: '已拦截：敏感字段类型' };
  }

  if (validateOnly) return { fieldId: entry.fieldId, status: 'filled', writtenValue: entry.value };

  let status: FillResult['status'];
  switch (entry.kind) {
    case 'select':
      status = fillSelect(first as HTMLSelectElement, entry.value);
      break;
    case 'radio':
    case 'checkbox':
      status = fillChoiceGroup(elements as HTMLInputElement[], entry.value, entry.kind);
      break;
    default:
      status = fillTextLike(first, entry.value);
  }

  if (status === 'filled') {
    return { fieldId: entry.fieldId, status, writtenValue: entry.value };
  }
  return {
    fieldId: entry.fieldId,
    status,
    reason: entry.kind === 'select' || entry.kind === 'radio'
      ? '没有找到匹配的选项'
      : '写入后值未生效，可能被页面脚本覆盖',
  };
}

/** Exposed for tests that need the option-resolution rules in isolation. */
export const __testables = { findOption, AFFIRMATIVE, NEGATIVE };
