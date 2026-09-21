import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadHtml } from './helpers.ts';
import { detectFields } from '../content/field-detector.ts';
import { fillFieldsSettled } from '../content/form-filler.ts';
import { installPageWriter, settlePageText } from '../content/page-write.ts';

function setup(html = '<label>姓名<input name="name" type="text"></label><label>内容<textarea name="description"></textarea></label>') {
  const doc = loadHtml(html);
  const win = doc.defaultView!;
  (win as any).FocusEvent = win.Event;
  (win as any).InputEvent = win.Event;
  (globalThis as any).chrome = { runtime: { id: 'test-extension' } };
  const fields = detectFields({ doc });
  const plan = fields.map((f, i) => ({ fieldId: f.fieldId, kind: f.kind, value: `合成测试 ${i}` }));
  return { doc, win, fields, plan };
}

it('enables the same main-world commit script on every supported HTTP(S) page and child frame', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const writer = manifest.content_scripts.find((s: any) => s.world === 'MAIN');
  assert.deepEqual(writer.matches, ['http://*/*', 'https://*/*']);
  assert.equal(writer.all_frames, true);
  assert.equal(writer.match_about_blank, true);
});

it('production text writes commit delayed state on blur without any hostname check or duplicate blur', async () => {
  const h = setup();
  try {
    installPageWriter(h.doc);
    installPageWriter(h.doc);
    const controls = [...h.doc.querySelectorAll('input,textarea')] as Array<HTMLInputElement | HTMLTextAreaElement>;
    const saved: Record<string, string> = {};
    let inputs = 0; let blurs = 0;
    for (const el of controls) {
      let local = '';
      let tracked = el.value;
      (el as any)._valueTracker = { setValue: (v: string) => { tracked = v; } };
      el.addEventListener('input', () => {
        inputs++;
        if (tracked !== el.value) setTimeout(() => { local = el.value; }, 20);
      });
      el.blur = () => {
        el.dispatchEvent(new h.win.Event('blur'));
        el.dispatchEvent(new h.win.Event('focusout', { bubbles: true }));
      };
      el.addEventListener('blur', () => { blurs++; });
      el.addEventListener('focusout', () => { saved[el.name] = local; });
    }
    const result = await fillFieldsSettled(h.plan, h.fields, h.doc);
    assert.ok(result.every(r => r.status === 'filled'));
    assert.deepEqual(saved, { name: h.plan[0]!.value, description: h.plan[1]!.value });
    assert.equal(inputs, 2); assert.equal(blurs, 2);
    assert.ok(controls.every(el => !el.hasAttribute('data-jaf-write') && !el.hasAttribute('data-jaf-write-result')));
  } finally { delete (globalThis as any).chrome; }
});

it('global commit respects canceled beforeinput without sending change or blur', async () => {
  const h = setup();
  try {
    installPageWriter(h.doc);
    const el = h.doc.querySelector('input')!;
    let events = 0;
    el.addEventListener('beforeinput', e => e.preventDefault());
    for (const type of ['input', 'change', 'focusout']) el.addEventListener(type, () => { events++; });
    const result = await fillFieldsSettled(h.plan.slice(0, 1), h.fields, h.doc);
    assert.equal(result[0]!.status, 'failed');
    assert.equal(el.value, ''); assert.equal(events, 0);
  } finally { delete (globalThis as any).chrome; }
});

it('fails when the page rolls a write back before blur', async () => {
  const h = setup();
  try {
    installPageWriter(h.doc);
    h.doc.querySelector('input')!.addEventListener('input', () => {
      setTimeout(() => { h.doc.querySelector('input')!.value = ''; }, 10);
    });
    const result = await fillFieldsSettled(h.plan.slice(0, 1), h.fields, h.doc);
    assert.equal(result[0]!.status, 'failed');
  } finally { delete (globalThis as any).chrome; }
});

it('does not accept a stale acknowledgement or claim success when the page writer is missing', async () => {
  const h = setup();
  try {
    const el = h.doc.querySelector('input')!;
    el.setAttribute('data-jaf-write-result', 'old-token:ok');
    const result = await fillFieldsSettled(h.plan.slice(0, 1), h.fields, h.doc);
    assert.equal(result[0]!.status, 'failed');
    assert.ok(!el.hasAttribute('data-jaf-write-result'));
  } finally { delete (globalThis as any).chrome; }
});

it('rechecks detached controls and restores no stale state on delayed blur', async () => {
  const h = setup();
  try {
    const el = h.doc.querySelector('input')!;
    const pending = settlePageText(el);
    el.remove();
    assert.equal(await pending, false);
  } finally { delete (globalThis as any).chrome; }
});
