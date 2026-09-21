import assert from 'node:assert/strict';
import { it } from 'node:test';
import { loadHtml } from './helpers.ts';
import { detectFields } from '../content/field-detector.ts';
import { fillFields, fillFieldsSettled } from '../content/form-filler.ts';

function queuedForm() {
  const doc = loadHtml('<label>姓名<input name="name"></label><label>邮箱<input name="email"></label>');
  let model: Record<string, string> = { name: '', email: '' };
  const controls = Array.from(doc.querySelectorAll('input'));
  for (const el of controls) el.addEventListener('input', () => {
    const next = { ...model, [el.name]: el.value };
    setTimeout(() => {
      model = next;
      for (const c of controls) c.value = model[c.name]!;
    }, 10);
  });
  const fields = detectFields({ doc });
  const plan = fields.map((f, i) => ({ fieldId: f.fieldId, kind: f.kind, value: ['测试姓名', 'test@example.com'][i]! }));
  return { doc, fields, plan, model: () => model };
}

it('reproduces false success with synchronous multi-field writes', async () => {
  const h = queuedForm();
  assert.ok(fillFields(h.plan, h.fields, h.doc).every((r) => r.status === 'filled'));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(h.model().name, '');
});

it('retains both values in a form model with queued state updates', async () => {
  const h = queuedForm();
  const results = await fillFieldsSettled(h.plan, h.fields, h.doc);
  assert.ok(results.every((r) => r.status === 'filled'));
  // Simulate a save that serializes the model, rather than scraping the DOM.
  const saved = JSON.parse(JSON.stringify(h.model()));
  assert.deepEqual(saved, { name: '测试姓名', email: 'test@example.com' });
});

it('reports asynchronous rollback as failure instead of retaining a false success', async () => {
  const h = queuedForm();
  const first = h.doc.querySelector('input')!;
  first.addEventListener('input', () => setTimeout(() => { first.value = ''; }, 220));
  const results = await fillFieldsSettled(h.plan.slice(0, 1), h.fields, h.doc);
  assert.equal(results[0]!.status, 'failed');
  assert.equal(results[0]!.writtenValue, undefined);
});

it('reports replaced elements without writing into unreviewed replacement controls', async () => {
  const h = queuedForm();
  const first = h.doc.querySelector('input')!;
  first.addEventListener('input', () => setTimeout(() => first.remove(), 20));
  const results = await fillFieldsSettled(h.plan.slice(0, 1), h.fields, h.doc);
  assert.equal(results[0]!.status, 'failed');
});

it('respects a page that cancels beforeinput', async () => {
  const doc = loadHtml('<label>姓名<input></label>');
  const input = doc.querySelector('input')!;
  input.addEventListener('beforeinput', (event) => event.preventDefault());
  const fields = detectFields({doc});
  const result = await fillFieldsSettled([{fieldId:fields[0]!.fieldId,kind:'text',value:'测试'}],fields,doc);
  assert.equal(result[0]!.status, 'failed');
  assert.ok(!input.value);
});
