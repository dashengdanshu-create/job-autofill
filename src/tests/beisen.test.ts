import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadHtml } from './helpers.ts';
import { detectFields } from '../content/field-detector.ts';
import { fillFields } from '../content/form-filler.ts';
import { matchFields } from '../core/field-matcher.ts';
import { resolveAdapter } from '../adapters/index.ts';

const adapter = resolveAdapter('https://jobs.gdjztech.com/form');
const row = (label: string, control = '<div class="phoenix-input"><input type="text" placeholder="请输入"></div>') =>
  `<div class="fields-col"><div class="form-item form-item--phoenix"><div class="form-item__title"><label class="form-item__text">${label}</label></div><div class="form-item__control">${control}</div></div></div>`;
const picker = '<div class="phoenix-select"><span>请选择</span><ul class="phoenix-select__content"><li><input class="phoenix-select__input"></li></ul></div>';
const entry = (id: string) => `<div><div class="ux-standard-form"><div class="form twoLineFormStyleLong" id="${id}">
  <div class="form-part"><div class="form-part-body">
    <div class="fields-row">${row('单位名称')}${row('职位名称')}</div>
    <div class="fields-row">${row('开始时间', picker)}${row('结束时间', picker)}</div>
  </div></div>
  <div class="form-part"><div class="form-part-body">${row('实习地点', picker)}${row('实习内容', '<div class="phoenix-textarea"><textarea></textarea></div>')}</div></div>
</div></div></div>`;
const section = (title: string, id: string, count = 1) => `<div class="section"><div id="${id}">${title}</div><div class="body">${entry(id).repeat(count)}<div>添加${title}</div></div></div>`;

describe('verified Beisen Phoenix structure', () => {
  it('uses the scoped div heading, not the previous section or sidebar text', () => {
    const doc = loadHtml(section('工作经历', 'work') + section('实习经历', 'intern') + '<aside><div>工作经历</div></aside>');
    const fields = detectFields({ doc, adapter });
    const matches = matchFields(fields, { adapter });
    const intern = fields.filter((f) => f.sectionKind === 'internship');
    assert.equal(intern.length, 6);
    const expected = ['internship.company', 'internship.title', 'internship.startDate', 'internship.endDate', 'internship.location', 'internship.description'];
    assert.deepEqual(intern.map((f) => matches.find((m) => m.fieldId === f.fieldId)!.fieldKey), expected);
    assert.ok(intern.every((f) => matches.find((m) => m.fieldId === f.fieldId)!.entryIndex === 0));
    assert.ok(intern.filter((f) => !f.manualReason).every((f) => matches.find((m) => m.fieldId === f.fieldId)!.band === 'auto'));
  });

  it('keeps split fragments in one entry and separates repeated entries with duplicate DOM IDs', () => {
    const doc = loadHtml(section('实习经历', 'duplicated-id', 2));
    const fields = detectFields({ doc, adapter });
    const matches = matchFields(fields, { adapter });
    assert.deepEqual(matches.map((m) => m.entryIndex), [0,0,0,0,0,0,1,1,1,1,1,1]);
    const plan = matches.filter((m) => m.fieldKey === 'internship.company' || m.fieldKey === 'internship.description').map((m) => ({
      fieldId: m.fieldId, kind: fields.find((f) => f.fieldId === m.fieldId)!.kind,
      value: m.fieldKey === 'internship.company' ? ['公司甲', '公司乙'][m.entryIndex]! : ['内容甲', '内容乙'][m.entryIndex]!,
    }));
    assert.ok(fillFields(plan, fields, doc).every((r) => r.status === 'filled'));
    assert.deepEqual(Array.from(doc.querySelectorAll('textarea')).map((e) => e.value), ['内容甲','内容乙']);
  });

  it('identifies custom pickers but never reports their search text as a selected value', () => {
    const doc = loadHtml(section('实习经历', 'intern'));
    const fields = detectFields({ doc, adapter });
    const manual = fields.filter((f) => f.manualReason);
    assert.deepEqual(manual.map((f) => f.label), ['开始时间', '结束时间', '实习地点']);
    const results = fillFields(manual.map((f) => ({fieldId:f.fieldId,kind:f.kind,value:'2025-06'})),fields,doc);
    assert.ok(results.every((r) => r.status === 'skipped'));
    assert.ok(Array.from(doc.querySelectorAll('.phoenix-select input')).every((e) => !(e as HTMLInputElement).value));
  });

  it('ends section inference at an unknown scoped heading and stays site-specific', () => {
    assert.equal(resolveAdapter('https://example.com/form').id, 'generic');
    const fields = detectFields({doc: loadHtml('<h2>工作经历</h2>' + section('培训经历', 'training')),adapter});
    assert.ok(fields.every((f) => f.sectionKind === 'unknown'));
  });
});
