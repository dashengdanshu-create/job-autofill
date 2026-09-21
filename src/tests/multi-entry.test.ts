/**
 * V0.2: filling every entry of a repeating section, not just the first.
 *
 * Two things have to hold together for this to work, and they are tested
 * separately here because they fail for different reasons:
 *
 *  1. **Section separation.** 实习经历 and 工作经历 print identical inner labels
 *     ("公司名称"). Only the heading distinguishes them.
 *  2. **Entry numbering.** Three 公司名称 inputs under one heading are three
 *     entries, not three rivals for one slot.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectFields } from '../content/field-detector.ts';
import { fillFields } from '../content/form-filler.ts';
import { matchField, matchFields } from '../core/field-matcher.ts';
import { resolveValue } from '../core/candidate-profile.ts';
import { genericAdapter } from '../adapters/generic.ts';
import type { DetectedField, FieldKey, FieldMatch, FillPlanEntry } from '../core/types.ts';
import { field, loadFixture, sampleProfile } from './helpers.ts';

/** The (key, entryIndex) pair a field resolved to, for compact assertions. */
function slot(match: FieldMatch): string {
  return `${match.fieldKey}#${match.entryIndex}`;
}

function slotOfName(fields: DetectedField[], matches: FieldMatch[], name: string): string {
  const index = fields.findIndex((f) => f.name === name);
  assert.notEqual(index, -1, `no detected field named ${name}`);
  return slot(matches[index]!);
}

describe('section bias: bare labels inside a qualified section', () => {
  it('routes 公司名称 to internship when the heading says 实习经历', () => {
    const match = matchField(
      field({ label: '公司名称', sectionKind: 'internship', sectionLabel: '实习经历' }),
    );
    assert.equal(match.fieldKey, 'internship.company');
  });

  it('routes the same label to work when the heading says 工作经历', () => {
    const match = matchField(
      field({ label: '公司名称', sectionKind: 'work', sectionLabel: '工作经历' }),
    );
    assert.equal(match.fieldKey, 'work.company');
  });

  it('falls back to work when there is no heading at all', () => {
    // Employment is the safer default: a lone 公司名称 on a form with no sections
    // is far more often the current employer than an internship.
    const match = matchField(field({ label: '公司名称' }));
    assert.equal(match.fieldKey, 'work.company');
  });

  it('still lets an explicitly-worded label win against its section', () => {
    // A stray 现单位 inside an 实习经历 block means what it says. remapToSection
    // adds the counterpart as a candidate rather than replacing the original,
    // so the stronger label evidence can still carry it.
    const match = matchField(
      field({ label: '现单位', sectionKind: 'internship', sectionLabel: '实习经历' }),
    );
    assert.equal(match.fieldKey, 'work.company');
  });

  it('records the section it used as evidence', () => {
    const match = matchField(
      field({ label: '公司名称', sectionKind: 'internship', sectionLabel: '实习经历' }),
    );
    const sectionEvidence = match.evidence.filter((e) => e.source === 'section');
    assert.ok(sectionEvidence.length > 0, 'expected section evidence');
    assert.ok(sectionEvidence.some((e) => e.value.includes('实习')));
  });

  it('routes date labels by section too', () => {
    const internStart = matchField(
      field({ label: '开始时间', sectionKind: 'internship', sectionLabel: '实习经历' }),
    );
    const workStart = matchField(
      field({ label: '开始时间', sectionKind: 'work', sectionLabel: '工作经历' }),
    );
    const eduStart = matchField(
      field({ label: '入学时间', sectionKind: 'education', sectionLabel: '教育经历' }),
    );
    assert.equal(internStart.fieldKey, 'internship.startDate');
    assert.equal(workStart.fieldKey, 'work.startDate');
    assert.equal(eduStart.fieldKey, 'education.startDate');
  });
});

describe('entry numbering: explicit ordinals', () => {
  it('numbers from 1-based underscore ordinals declared by the page', () => {
    const fields = [
      field({ fieldId: 'a', name: 'intern_1_company', label: '公司名称',
        sectionKind: 'internship', explicitIndex: 0 }),
      field({ fieldId: 'b', name: 'intern_2_company', label: '公司名称',
        sectionKind: 'internship', explicitIndex: 1 }),
    ];
    const matches = matchFields(fields);
    assert.equal(slot(matches[0]!), 'internship.company#0');
    assert.equal(slot(matches[1]!), 'internship.company#1');
  });

  it('numbers from 0-based bracket ordinals declared by the page', () => {
    const fields = [
      field({ fieldId: 'a', name: 'work[0].company', label: '公司名称',
        sectionKind: 'work', explicitIndex: 0 }),
      field({ fieldId: 'b', name: 'work[1].company', label: '公司名称',
        sectionKind: 'work', explicitIndex: 1 }),
    ];
    const matches = matchFields(fields);
    assert.equal(slot(matches[0]!), 'work.company#0');
    assert.equal(slot(matches[1]!), 'work.company#1');
  });

  it('keeps both entries at full confidence rather than demoting either', () => {
    // The V0.1 dedupe would have called these rivals for one slot and pushed the
    // second into review. Multi-entry is exactly what makes that wrong.
    const fields = [
      field({ fieldId: 'a', name: 'work[0].company', label: '公司名称',
        sectionKind: 'work', explicitIndex: 0 }),
      field({ fieldId: 'b', name: 'work[1].company', label: '公司名称',
        sectionKind: 'work', explicitIndex: 1 }),
    ];
    const matches = matchFields(fields);
    assert.equal(matches[0]!.band, 'auto');
    assert.equal(matches[1]!.band, 'auto');
  });
});

describe('entry numbering: inferred from structure', () => {
  it('groups fields of one entry by their shared repeated container', () => {
    const fields = [
      field({ fieldId: 'a', label: '公司名称', sectionKind: 'work', groupId: 'DIV.row#1' }),
      field({ fieldId: 'b', label: '职位', sectionKind: 'work', groupId: 'DIV.row#1' }),
      field({ fieldId: 'c', label: '公司名称', sectionKind: 'work', groupId: 'DIV.row#2' }),
      field({ fieldId: 'd', label: '职位', sectionKind: 'work', groupId: 'DIV.row#2' }),
    ];
    const matches = matchFields(fields);
    assert.equal(slot(matches[0]!), 'work.company#0');
    assert.equal(slot(matches[1]!), 'work.title#0');
    assert.equal(slot(matches[2]!), 'work.company#1');
    assert.equal(slot(matches[3]!), 'work.title#1');
  });

  it('counts repeats by document order when there is no container either', () => {
    const fields = [
      field({ fieldId: 'a', label: '公司名称', sectionKind: 'work' }),
      field({ fieldId: 'b', label: '公司名称', sectionKind: 'work' }),
      field({ fieldId: 'c', label: '公司名称', sectionKind: 'work' }),
    ];
    const matches = matchFields(fields);
    assert.deepEqual(matches.map(slot), [
      'work.company#0', 'work.company#1', 'work.company#2',
    ]);
  });

  it('numbers each section independently', () => {
    const fields = [
      field({ fieldId: 'a', label: '公司名称', sectionKind: 'internship' }),
      field({ fieldId: 'b', label: '公司名称', sectionKind: 'internship' }),
      field({ fieldId: 'c', label: '公司名称', sectionKind: 'work' }),
    ];
    const matches = matchFields(fields);
    assert.deepEqual(matches.map(slot), [
      'internship.company#0', 'internship.company#1', 'work.company#0',
    ]);
  });

  it('leaves non-repeating keys at entry 0 however often they appear', () => {
    const fields = [
      field({ fieldId: 'a', label: '姓名' }),
      field({ fieldId: 'b', label: '姓名' }),
    ];
    const matches = matchFields(fields);
    assert.equal(matches[0]!.entryIndex, 0);
    assert.equal(matches[1]!.entryIndex, 0);
  });

  it('explains which signal set the entry index', () => {
    const matches = matchFields([
      field({ fieldId: 'a', name: 'work_2_company', label: '公司名称',
        sectionKind: 'work', explicitIndex: 1 }),
    ]);
    const ordinal = matches[0]!.evidence.find((e) => e.source === 'ordinal');
    assert.ok(ordinal, 'expected ordinal evidence');
    assert.ok(ordinal.value.includes('第 2 条'));
  });
});

describe('entry numbering: ordinals that number fields, not entries', () => {
  /**
   * A trailing digit is ambiguous from one name alone. `f_edu_a1/a2/a3` numbers
   * three *fields* of one card; `company1/company2` numbers two *entries*. The
   * repeat container settles it: fields of one entry share a container, so
   * ordinals that disagree inside a single container cannot be entry numbers.
   */
  it('ignores the digits when one container holds fields that disagree', () => {
    const fields = [
      field({ fieldId: 'a', name: 'f_edu_a1', label: '学校名称',
        sectionKind: 'education', groupId: 'DIV.card#1', explicitIndex: 0 }),
      field({ fieldId: 'b', name: 'f_edu_a2', label: '专业',
        sectionKind: 'education', groupId: 'DIV.card#1', explicitIndex: 1 }),
      field({ fieldId: 'c', name: 'f_edu_b1', label: '学校名称',
        sectionKind: 'education', groupId: 'DIV.card#2', explicitIndex: 0 }),
      field({ fieldId: 'd', name: 'f_edu_b2', label: '专业',
        sectionKind: 'education', groupId: 'DIV.card#2', explicitIndex: 1 }),
    ];
    const matches = matchFields(fields);
    // Taken literally the ordinals would put 学校名称 and 专业 in different
    // entries, and collapse the two cards onto the same pair of indices.
    assert.deepEqual(matches.map(slot), [
      'education.school#0', 'education.major#0',
      'education.school#1', 'education.major#1',
    ]);
  });

  it('still honours the digits when every container agrees with them', () => {
    const fields = [
      field({ fieldId: 'a', name: 'intern_1_company', label: '公司名称',
        sectionKind: 'internship', groupId: 'TBODY.card#1', explicitIndex: 0 }),
      field({ fieldId: 'b', name: 'intern_1_title', label: '职位',
        sectionKind: 'internship', groupId: 'TBODY.card#1', explicitIndex: 0 }),
      field({ fieldId: 'c', name: 'intern_2_company', label: '公司名称',
        sectionKind: 'internship', groupId: 'TBODY.card#2', explicitIndex: 1 }),
      field({ fieldId: 'd', name: 'intern_2_title', label: '职位',
        sectionKind: 'internship', groupId: 'TBODY.card#2', explicitIndex: 1 }),
    ];
    const matches = matchFields(fields);
    assert.deepEqual(matches.map(slot), [
      'internship.company#0', 'internship.title#0',
      'internship.company#1', 'internship.title#1',
    ]);
  });
});

describe('multi-entry end to end: SPA fixture with opaque names', () => {
  const doc = loadFixture('zh-spa-form.html');
  const fields = detectFields({ doc, adapter: genericAdapter });
  const matches = matchFields(fields, { adapter: genericAdapter });

  it('separates the two internship cards and the two work cards', () => {
    // Same inner labels across both sections, no usable ordinal in any name:
    // section inference and container counting carry this entirely.
    assert.equal(slotOfName(fields, matches, 'f_int_a1'), 'internship.company#0');
    assert.equal(slotOfName(fields, matches, 'f_int_b1'), 'internship.company#1');
    assert.equal(slotOfName(fields, matches, 'f_wrk_a1'), 'work.company#0');
    assert.equal(slotOfName(fields, matches, 'f_wrk_b1'), 'work.company#1');
  });

  it('keeps the three fields of one card on the same entry index', () => {
    for (const name of ['f_int_a1', 'f_int_a2', 'f_int_a3']) {
      assert.match(slotOfName(fields, matches, name), /#0$/, name);
    }
    for (const name of ['f_int_b1', 'f_int_b2', 'f_int_b3']) {
      assert.match(slotOfName(fields, matches, name), /#1$/, name);
    }
  });

  it('fills both cards of every section with distinct profile rows', () => {
    const profile = sampleProfile();
    const plan: FillPlanEntry[] = [];
    for (let i = 0; i < matches.length; i += 1) {
      const match = matches[i]!;
      if (!match.fieldKey || (match.band !== 'auto' && match.band !== 'review')) continue;
      const resolved = resolveValue(profile, match.fieldKey, match.entryIndex);
      if (!resolved) continue;
      plan.push({ fieldId: match.fieldId, value: resolved.value, kind: fields[i]!.kind });
    }

    const results = fillFields(plan, fields, doc);
    assert.equal(results.filter((r) => r.status === 'failed').length, 0);

    const valueOf = (name: string): string =>
      (doc.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value ?? '';
    assert.equal(valueOf('f_edu_a1'), '清华大学');
    assert.equal(valueOf('f_edu_b1'), '北京大学');
    assert.equal(valueOf('f_int_a1'), '腾讯');
    assert.equal(valueOf('f_int_b1'), '小米');
    assert.equal(valueOf('f_wrk_a1'), '字节跳动');
    assert.equal(valueOf('f_wrk_b1'), '美团');
  });

  it('leaves the consent checkbox unchecked', () => {
    const agree = matches.find(
      (m) => m.fieldId === fields.find((f) => f.name === 'f_agree')!.fieldId,
    );
    assert.equal(agree?.band, 'blocked');
    const box = doc.querySelector('[name="f_agree"]') as HTMLInputElement;
    assert.notEqual(box.getAttribute('checked'), '');
  });
});

describe('dedupe still protects a single slot', () => {
  it('demotes a genuine duplicate of the same key and entry', () => {
    // "Email" and "Confirm email" — one profile slot, two inputs. Still a rivalry.
    const fields = [
      field({ fieldId: 'a', label: 'Email', inputType: 'email' }),
      field({ fieldId: 'b', label: 'Confirm Email', inputType: 'email' }),
    ];
    const matches = matchFields(fields);
    const emails = matches.filter((m) => m.fieldKey === 'contact.email');
    assert.equal(emails.length, 2);
    assert.equal(emails.filter((m) => m.band === 'auto').length, 1,
      'exactly one of the two should fill automatically');
  });
});

describe('multi-entry end to end: zh-campus fixture', () => {
  const doc = loadFixture('zh-campus.html');
  const fields = detectFields({ doc, adapter: genericAdapter });
  const matches = matchFields(fields, { adapter: genericAdapter });

  it('detects every control on the form', () => {
    assert.equal(fields.length, 43);
  });

  it('assigns each field to the section its heading declares', () => {
    const sectionOf = (name: string): string =>
      fields.find((f) => f.name === name)?.sectionKind ?? 'missing';
    assert.equal(sectionOf('school'), 'education');
    assert.equal(sectionOf('intern_1_company'), 'internship');
    assert.equal(sectionOf('work[0].company'), 'work');
    assert.equal(sectionOf('org1'), 'campus');
  });

  it('separates the internship and work tables despite identical labels', () => {
    assert.equal(slotOfName(fields, matches, 'intern_1_company'), 'internship.company#0');
    assert.equal(slotOfName(fields, matches, 'intern_2_company'), 'internship.company#1');
    assert.equal(slotOfName(fields, matches, 'work[0].company'), 'work.company#0');
    assert.equal(slotOfName(fields, matches, 'work[1].company'), 'work.company#1');
  });

  it('numbers the two unnumbered education entries from their tbody wrappers', () => {
    const schools = fields
      .map((f, i) => ({ f, m: matches[i]! }))
      .filter(({ m }) => m.fieldKey === 'education.school');
    assert.equal(schools.length, 2);
    assert.deepEqual(schools.map(({ m }) => m.entryIndex), [0, 1]);
  });

  it('keeps the five fields of one education entry on the same index', () => {
    const first = fields
      .map((f, i) => ({ f, m: matches[i]! }))
      .filter(({ f }) => f.sectionKind === 'education' && f.groupId === fields
        .find((x) => x.name === 'school')!.groupId);
    assert.equal(first.length, 5);
    for (const { m } of first) assert.equal(m.entryIndex, 0);
  });

  it('reads the campus section from bare trailing digits', () => {
    assert.equal(slotOfName(fields, matches, 'org1'), 'campus.organization#0');
    assert.equal(slotOfName(fields, matches, 'org2'), 'campus.organization#1');
    assert.equal(slotOfName(fields, matches, 'orgAward2'), 'campus.awards#1');
  });

  it('treats an experience table 所在城市 as the job location, not the home city', () => {
    assert.equal(slotOfName(fields, matches, 'work[0].location'), 'work.location#0');
  });

  it('fills every entry of every section from the matching profile row', () => {
    const profile = sampleProfile();
    const plan: FillPlanEntry[] = [];
    for (let i = 0; i < matches.length; i += 1) {
      const match = matches[i]!;
      const detected = fields[i]!;
      if (!match.fieldKey || (match.band !== 'auto' && match.band !== 'review')) continue;
      const resolved = resolveValue(profile, match.fieldKey, match.entryIndex);
      if (!resolved) continue;
      plan.push({ fieldId: match.fieldId, value: resolved.value, kind: detected.kind });
    }

    const results = fillFields(plan, fields, doc);
    assert.equal(results.filter((r) => r.status === 'failed').length, 0);

    const valuesOf = (name: string): string[] =>
      Array.from(doc.querySelectorAll(`[name="${name}"]`))
        .map((el) => (el as HTMLInputElement).value ?? '');

    // Second entries carry the second profile row, not a copy of the first.
    assert.deepEqual(valuesOf('school'), ['清华大学', '北京大学']);
    assert.deepEqual(valuesOf('degree'), ['bachelor', 'master']);
    assert.deepEqual(valuesOf('intern_1_company'), ['腾讯']);
    assert.deepEqual(valuesOf('intern_2_company'), ['小米']);
    assert.deepEqual(valuesOf('work[0].company'), ['字节跳动']);
    assert.deepEqual(valuesOf('work[1].company'), ['美团']);
    assert.deepEqual(valuesOf('org1'), ['清华大学学生科协']);
    assert.deepEqual(valuesOf('org2'), ['ACM 校队']);
    assert.deepEqual(valuesOf('orgAward2'), ['ACM-ICPC 亚洲区银奖']);
  });

  it('leaves an entry blank rather than reusing another when the profile runs out', () => {
    // The form asks for two employers; a profile holding one must fill only one.
    const profile = sampleProfile();
    profile.workExperience = [profile.workExperience[0]!];
    const second = matches.find((m) => m.fieldKey === 'work.company' && m.entryIndex === 1);
    assert.ok(second);
    assert.equal(resolveValue(profile, 'work.company', 1), null);
  });

  it('never touches the submit button', () => {
    const planned = new Set(matches.map((m) => m.fieldId));
    const submit = fields.find((f) => f.id === 'submit-application');
    assert.equal(submit, undefined, 'submit button should not be detected as fillable');
    assert.ok(planned.size > 0);
  });
});

describe('profile resolution across entries', () => {
  const profile = sampleProfile();

  it('resolves each repeating section by index', () => {
    const cases: Array<[FieldKey, number, string]> = [
      ['education.school', 0, '清华大学'],
      ['education.school', 1, '北京大学'],
      ['work.company', 0, '字节跳动'],
      ['work.company', 1, '美团'],
      ['internship.company', 0, '腾讯'],
      ['internship.company', 1, '小米'],
      ['campus.organization', 0, '清华大学学生科协'],
      ['campus.organization', 1, 'ACM 校队'],
      ['language.language', 0, '中文'],
      ['language.language', 1, 'English'],
    ];
    for (const [key, index, expected] of cases) {
      assert.equal(resolveValue(profile, key, index)?.value, expected, `${key}#${index}`);
    }
  });

  it('reports the indexed path it read from', () => {
    assert.equal(resolveValue(profile, 'work.company', 1)?.sourcePath, 'workExperience[1].company');
    assert.equal(
      resolveValue(profile, 'internship.company', 0)?.sourcePath,
      'internships[0].company',
    );
  });

  it('returns null past the end of a section', () => {
    assert.equal(resolveValue(profile, 'work.company', 9), null);
    assert.equal(resolveValue(profile, 'internship.company', 2), null);
  });

  it('defaults to the first entry when no index is given', () => {
    assert.equal(resolveValue(profile, 'work.company')?.value, '字节跳动');
  });
});
