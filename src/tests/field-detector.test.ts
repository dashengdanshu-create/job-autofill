import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectFields, elementsFor } from '../content/field-detector.ts';
import { matchFields } from '../core/field-matcher.ts';
import { genericAdapter } from '../adapters/generic.ts';
import type { DetectedField } from '../core/types.ts';
import { loadFixture, loadHtml } from './helpers.ts';

function detect(fixture: string): DetectedField[] {
  const doc = loadFixture(fixture);
  return detectFields({ doc, adapter: genericAdapter });
}

/** Detect and keep the document, for tests that resolve ids back to elements. */
function detectWithDoc(fixture: string): { doc: Document; fields: DetectedField[] } {
  const doc = loadFixture(fixture);
  return { doc, fields: detectFields({ doc, adapter: genericAdapter }) };
}

/** Finds a detected field by any of its descriptive strings. */
function find(fields: DetectedField[], needle: string): DetectedField | undefined {
  return fields.find((f) =>
    [f.label, f.name, f.id, f.nearbyText, f.placeholder, f.ariaLabel, f.legend]
      .some((v) => v.includes(needle)),
  );
}

describe('field-detector: English fixture', () => {
  const fields = detect('en-generic.html');

  it('detects the visible controls', () => {
    assert.ok(fields.length >= 20, `expected 20+ fields, got ${fields.length}`);
  });

  it('reads label text from <label for>', () => {
    const email = find(fields, 'email');
    assert.equal(email?.label, 'Email Address *');
  });

  it('captures autocomplete and input type', () => {
    const phone = fields.find((f) => f.name === 'phone');
    assert.equal(phone?.autocomplete, 'tel');
    assert.equal(phone?.inputType, 'tel');
    assert.equal(phone?.required, true);
  });

  it('collects select options with their visible text', () => {
    const degree = fields.find((f) => f.name === 'degree');
    assert.equal(degree?.kind, 'select');
    const labels = degree?.options.map((o) => o.label) ?? [];
    assert.ok(labels.includes("Bachelor's Degree"));
    assert.ok(labels.includes('Doctorate'));
  });

  it('collapses a radio group into one field carrying its options', () => {
    const relocate = fields.filter((f) => f.name === 'relocate');
    assert.equal(relocate.length, 1, 'radio group must be one logical field');
    assert.equal(relocate[0]?.kind, 'radio');
    assert.deepEqual(relocate[0]?.options.map((o) => o.value), ['yes', 'no']);
  });

  it('picks up the fieldset legend as the group question', () => {
    const relocate = fields.find((f) => f.name === 'relocate');
    assert.match(relocate?.legend ?? '', /willing to relocate/i);
  });

  it('excludes password, file, hidden and submit controls', () => {
    for (const f of fields) {
      assert.ok(!['password', 'file', 'hidden', 'submit', 'button'].includes(f.inputType),
        `${f.name} should not be detected (type=${f.inputType})`);
    }
  });

  it('assigns unique stable ids that resolve back to elements', () => {
    const fresh = detectWithDoc('en-generic.html');
    const ids = fresh.fields.map((f) => f.fieldId);
    assert.equal(new Set(ids).size, ids.length, 'fieldIds must be unique');
    for (const id of ids) {
      assert.ok(
        elementsFor(id, fresh.doc).length > 0,
        `${id} did not resolve to an element`,
      );
    }
  });

  it('keeps registries separate per document', () => {
    const a = detectWithDoc('en-generic.html');
    const b = detectWithDoc('zh-generic.html');
    // Detecting in b must not invalidate a's ids.
    const firstA = a.fields[0]!.fieldId;
    assert.ok(elementsFor(firstA, a.doc).length > 0, 'first document lost its registry');
    assert.ok(elementsFor(b.fields[0]!.fieldId, b.doc).length > 0);
  });
});

describe('field-detector: Chinese fixture (table layout, no <label for>)', () => {
  const fields = detect('zh-generic.html');

  it('detects the controls', () => {
    assert.ok(fields.length >= 20, `expected 20+ fields, got ${fields.length}`);
  });

  it('recovers the label from the preceding table header cell', () => {
    const name = fields.find((f) => f.name === 'xingming');
    assert.ok(name, 'name field not detected');
    assert.match(name!.nearbyText, /姓名/);
  });

  it('recovers 毕业院校 from its table header', () => {
    const school = fields.find((f) => f.name === 'yuanxiao');
    assert.match(school?.nearbyText ?? '', /毕业院校/);
  });

  it('recovers a div-styled label for the textarea', () => {
    const intro = fields.find((f) => f.name === 'zwjs');
    assert.ok(intro, 'self-introduction textarea not detected');
    assert.match(`${intro!.nearbyText} ${intro!.label}`, /自我介绍/);
  });

  it('groups the 性别 radios into one field', () => {
    const gender = fields.filter((f) => f.name === 'xingbie');
    assert.equal(gender.length, 1);
    assert.deepEqual(gender[0]?.options.map((o) => o.value), ['男', '女']);
  });

  it('matches the table-layout fields end to end', () => {
    const matches = matchFields(fields, { adapter: genericAdapter });
    const byName = new Map(
      matches.map((m) => [fields.find((f) => f.fieldId === m.fieldId)?.name ?? '', m]),
    );
    assert.equal(byName.get('xingming')?.fieldKey, 'basic.fullName');
    assert.equal(byName.get('youxiang')?.fieldKey, 'contact.email');
    assert.equal(byName.get('shouji')?.fieldKey, 'contact.phone');
    assert.equal(byName.get('yuanxiao')?.fieldKey, 'education.school');
    assert.equal(byName.get('qiwang_xinzi')?.fieldKey, 'pref.expectedSalary');
  });
});

describe('field-detector: Japanese fixture (dl/dt/dd layout)', () => {
  const fields = detect('ja-generic.html');

  it('detects the controls', () => {
    assert.ok(fields.length >= 20, `expected 20+ fields, got ${fields.length}`);
  });

  it('reads labels wrapped in <dt><label>', () => {
    const kana = fields.find((f) => f.name === 'name_kana');
    assert.equal(kana?.label, 'フリガナ');
  });

  it('keeps 氏名 and フリガナ as separate fields', () => {
    const matches = matchFields(fields, { adapter: genericAdapter });
    const byName = new Map(
      matches.map((m) => [fields.find((f) => f.fieldId === m.fieldId)?.name ?? '', m]),
    );
    assert.equal(byName.get('name')?.fieldKey, 'basic.fullName');
    assert.equal(byName.get('name_kana')?.fieldKey, 'basic.nameKana');
  });

  it('groups the 転勤可否 radios', () => {
    const tenkin = fields.filter((f) => f.name === 'tenkin');
    assert.equal(tenkin.length, 1);
    assert.equal(tenkin[0]?.options.length, 2);
  });
});

describe('field-detector: sensitive fixture', () => {
  const fields = detect('hostile.html');
  const matches = matchFields(fields, { adapter: genericAdapter });
  const byId = new Map(fields.map((f) => [f.fieldId, f]));

  it('never surfaces password, file or hidden controls at all', () => {
    for (const f of fields) {
      assert.ok(!['password', 'file', 'hidden'].includes(f.inputType));
    }
  });

  it('blocks every sensitive field it does surface', () => {
    const notBlocked = matches
      .filter((m) => m.band !== 'blocked')
      .map((m) => byId.get(m.fieldId)?.name ?? m.fieldId);

    // Only the deliberate control field may pass the guard.
    assert.deepEqual(notBlocked, ['email'],
      `these fields escaped the guard: ${notBlocked.join(', ')}`);
  });

  it('still matches the one safe field, proving the guard is selective', () => {
    const email = matches.find((m) => byId.get(m.fieldId)?.name === 'email');
    assert.equal(email?.fieldKey, 'contact.email');
    assert.equal(email?.band, 'auto');
  });

  it('gives every blocked field a human-readable reason', () => {
    for (const m of matches.filter((x) => x.band === 'blocked')) {
      assert.ok(m.blockedReason && m.blockedReason.length > 0,
        `${byId.get(m.fieldId)?.name} blocked without a reason`);
    }
  });
});

describe('field-detector: SPA component-library fixture (label in a sibling column)', () => {
  const fields = detect('zh-spa-form.html');

  /** The fixture's names are opaque by design, so look controls up by name. */
  const byName = (name: string): DetectedField => {
    const found = fields.find((f) => f.name === name);
    assert.ok(found, `${name} was not detected`);
    return found!;
  };

  it('detects the controls', () => {
    assert.ok(fields.length >= 20, `expected 20+ fields, got ${fields.length}`);
  });

  it('leaves no field without readable text', () => {
    // The reported defect: fields were detected but every one of them arrived
    // with an empty label AND an empty nearbyText, so the cascade had nothing
    // to work with and everything scored 0.
    const mute = fields
      .filter((f) => !f.label && !f.nearbyText && !f.placeholder && !f.ariaLabel)
      .map((f) => f.name);
    assert.deepEqual(mute, [], `these fields carry no readable text: ${mute.join(', ')}`);
  });

  it('recovers the label from an ancestor sibling column', () => {
    // <label> has no `for`, the control has no `id`, and the two sit in
    // different columns — only the ancestor walk can connect them.
    assert.match(byName('f_7a2c91').label, /姓名/);
    assert.match(byName('f_3e8b04').label, /手机号码/);
  });

  it('keeps normalisation working on required stars and (选填)', () => {
    const matches = matchFields(fields, { adapter: genericAdapter });
    const keyOf = (name: string): string | null =>
      matches.find((m) => m.fieldId === byName(name).fieldId)?.fieldKey ?? null;
    assert.equal(keyOf('f_7a2c91'), 'basic.fullName');    // label ends in *
    assert.equal(keyOf('f_91ab6d'), 'basic.nameLatin'); // label ends in (选填)
  });

  it('matches every section of the form at auto confidence', () => {
    const matches = matchFields(fields, { adapter: genericAdapter });
    const found = new Map(
      matches
        .filter((m) => m.fieldKey && m.band === 'auto')
        .map((m) => [fields.find((f) => f.fieldId === m.fieldId)!.name, m.fieldKey]),
    );
    assert.equal(found.get('f_c05df7'), 'contact.email');
    assert.equal(found.get('f_edu_a1'), 'education.school');
    assert.equal(found.get('f_int_a1'), 'internship.company');
    assert.equal(found.get('f_wrk_a1'), 'work.company');
    assert.equal(found.get('f_cam_a1'), 'campus.organization');
    assert.equal(found.get('f_pref_1'), 'pref.targetTitle');
  });

  it('still blocks the consent checkbox in this structure', () => {
    const matches = matchFields(fields, { adapter: genericAdapter });
    const agree = matches.find((m) => m.fieldId === byName('f_agree').fieldId);
    assert.equal(agree?.band, 'blocked');
  });
  it('reads an adjacent label in a <p>, not the label of the field above it', () => {
    // siblingColumnLabel starting at the control's parent skips the control's own
    // preceding siblings, so a label right beside the input is missed and the walk
    // climbs to the previous row's label — the whole form off by one.
    const doc = loadHtml(`<!doctype html><html><body><form>
      <p><label>学历</label><select name="edu"><option>本科</option></select></p>
      <p><label>性别</label><select name="sex"><option>男</option></select></p>
    </form></body></html>`);
    const fields = detectFields({ doc, adapter: genericAdapter });
    const edu = fields.find((f) => f.name === 'edu');
    const sex = fields.find((f) => f.name === 'sex');
    assert.match(edu?.label ?? '', /学历/);
    assert.match(sex?.label ?? '', /性别/);
  });
});

describe('field-detector: horizontal table (labels in column headers)', () => {
  const doc = loadFixture('zh-table-columns.html');
  const fields = detectFields({ doc, adapter: genericAdapter });
  const matches = matchFields(fields, { adapter: genericAdapter });

  const of = (name: string): { field: DetectedField; match: typeof matches[number] } => {
    const index = fields.findIndex((f) => f.name === name);
    assert.notEqual(index, -1, `${name} was not detected`);
    return { field: fields[index]!, match: matches[index]! };
  };

  it('gives each cell its own column header, not the whole header row', () => {
    // The defect: asking for "the <th> in my row" handed every input in the row
    // the entire header line, so all columns matched the same key.
    assert.equal(of('w_a1').field.label, '公司名称');
    assert.equal(of('w_a2').field.label, '职位名称');
    assert.equal(of('w_a5').field.label, '离职原因');
  });

  it('matches each column to its own key at auto confidence', () => {
    for (const [name, key] of [
      ['e_a1', 'education.school'], ['e_a2', 'education.major'],
      ['e_a4', 'education.startDate'], ['e_a5', 'education.endDate'],
      ['w_a1', 'work.company'], ['w_a2', 'work.title'],
      ['w_a3', 'work.department'], ['w_a5', 'work.leaveReason'],
    ] as const) {
      const { match } = of(name);
      assert.equal(match.fieldKey, key, name);
      assert.equal(match.band, 'auto', `${name} should be auto, got ${match.confidence}`);
    }
  });

  it('separates the two rows of each table into two entries', () => {
    assert.equal(of('w_a1').match.entryIndex, 0);
    assert.equal(of('w_b1').match.entryIndex, 1);
    assert.equal(of('e_a1').match.entryIndex, 0);
    assert.equal(of('e_b1').match.entryIndex, 1);
  });

  it('still reads a row header in the vertical tables on the same page', () => {
    assert.equal(of('b_name').match.fieldKey, 'basic.fullName');
    assert.equal(of('p_salary').match.fieldKey, 'pref.expectedSalary');
  });

  it('lines a merged header up with the column it spans', () => {
    assert.match(of('t_a1').field.label, /培训机构/);
  });

  it('leaves labels the profile has no slot for unmatched', () => {
    // A referee is a third party. Forcing 证明人姓名 onto basic.fullName would
    // put the candidate's own name in it.
    for (const name of ['w_a6', 'w_a7', 'w_b6', 'w_b7', 't_a1']) {
      assert.equal(of(name).match.fieldKey, null, `${name} should stay unmatched`);
    }
  });

  it('separates the salary at a past job from the salary being asked for', () => {
    assert.equal(of('w_a4').match.fieldKey, 'work.salaryLabel');
    assert.equal(of('p_salary').match.fieldKey, 'pref.expectedSalary');
  });
});

describe('field-detector: an unclassifiable heading ends the section above it', () => {
  const doc = loadFixture('zh-table-columns.html');
  const fields = detectFields({ doc, adapter: genericAdapter });
  const matches = matchFields(fields, { adapter: genericAdapter });

  it('does not let 培训经历 inherit the preceding 工作经历', () => {
    // Inheriting it would make this table's 开始时间 a job start date.
    const training = fields.find((f) => f.name === 't_a2');
    assert.equal(training?.sectionKind, 'unknown');
  });

  it('holds a section-agnostic label below auto when no section anchors it', () => {
    const index = fields.findIndex((f) => f.name === 't_a2');
    const match = matches[index]!;
    assert.equal(match.band, 'review',
      '开始时间 with no section must be reviewed, not filled automatically');
  });

  it('keeps the same label at auto when a real heading does anchor it', () => {
    const index = fields.findIndex((f) => f.name === 'e_a4');
    assert.equal(matches[index]!.fieldKey, 'education.startDate');
    assert.equal(matches[index]!.band, 'auto');
  });
});

describe('field-detector: an adjacent <label> in the control\'s own siblings', () => {
  /**
   * `siblingColumnLabel` used to start the walk at the control's *parent*, which
   * skips the control's own preceding siblings. `<p><label>学历</label><select>`
   * is exactly that shape: the adjacent label was never seen, and the climb
   * reached the previous row's label instead — every field off by one.
   */
  const doc = loadHtml(`<!doctype html><html><body><form>
    <p><label>学历</label><select name="edu"><option>本科</option></select></p>
    <p><label>性别</label><select name="sex"><option>男</option></select></p>
  </form></body></html>`);
  const fields = detectFields({ doc, adapter: genericAdapter });
  const matches = matchFields(fields, { adapter: genericAdapter });

  it('reads each control\'s own preceding label, not the row above', () => {
    const edu = fields.find((f) => f.name === 'edu');
    const sex = fields.find((f) => f.name === 'sex');
    assert.equal(edu?.label, '学历');
    assert.equal(sex?.label, '性别');
  });

  it('matches both, instead of matching neither', () => {
    const byName = new Map(
      matches.map((m) => [fields.find((f) => f.fieldId === m.fieldId)?.name ?? '', m]),
    );
    assert.equal(byName.get('edu')?.fieldKey, 'education.degree');
    assert.equal(byName.get('sex')?.fieldKey, 'basic.gender');
  });
});

describe('field-detector: nearby-text ancestor climb', () => {
  /**
   * The climb used to be anchored on the control's *previous sibling*, so a
   * control that had none passed `null` in and the whole upward walk was
   * skipped — silently, with an empty result. Two variants of one DOM, differing
   * only in whether that sibling exists, must both find the label text.
   */
  const form = (before: string): string => `<!doctype html><html><body><form>
    <div class="row">
      <div class="col-label">用工形式</div>
      <div class="col-control"><div class="wrap">
        ${before}<input type="text" name="probe">
      </div></div>
    </div>
  </form></body></html>`;

  it('finds ancestor text when the control has no previous sibling', () => {
    const fields = detectFields({ doc: loadHtml(form('')), adapter: genericAdapter });
    const probe = fields.find((f) => f.name === 'probe');
    assert.match(`${probe?.label} ${probe?.nearbyText}`, /用工形式/);
  });

  it('reads a label sitting as the control’s own previous sibling', () => {
    // siblingColumnLabel once started at the control's *parent*, skipping the
    // level where `<p><label>学历</label><select></p>` puts the label. That
    // missed the adjacent label and climbed to the previous row instead, so
    // every field took the label of the field above it.
    const html = `<!doctype html><html><body><form>
      <p><label>学历</label><select name="edu"><option>本科</option></select></p>
      <p><label>性别</label><select name="sex"><option>男</option></select></p>
    </form></body></html>`;
    const fields = detectFields({ doc: loadHtml(html), adapter: genericAdapter });
    const labels = new Map(fields.map((f) => [f.name, f.label]));
    assert.equal(labels.get('edu'), '学历');
    assert.equal(labels.get('sex'), '性别');
  });

  it('prefers a nearer sibling over the ancestor, and stops there', () => {
    // The climb is deliberately shallowest-first: a sibling right next to the
    // control describes it more specifically than anything further out, so
    // finding one ends the walk. Asserted so the ordering stays intentional.
    const html = form('<span class="prefix">用工形式说明</span>');
    const fields = detectFields({ doc: loadHtml(html), adapter: genericAdapter });
    const probe = fields.find((f) => f.name === 'probe');
    assert.equal(probe?.nearbyText, '用工形式说明');
  });

  it('recovers a <label> in a sibling column even when a prefix intervenes', () => {
    // A unit prefix (¥, %) is a plausible nearest sibling that says nothing
    // about the field. nearbyText legitimately stops at it, so the label path
    // has to reach past it independently — that is what keeps this fillable.
    const html = `<!doctype html><html><body><form>
      <div class="row">
        <div class="col-label"><label>期望薪资</label></div>
        <div class="col-control"><div class="wrap">
          <span class="unit">¥</span><input type="text" name="probe">
        </div></div>
      </div>
    </form></body></html>`;
    const fields = detectFields({ doc: loadHtml(html), adapter: genericAdapter });
    const probe = fields.find((f) => f.name === 'probe');
    assert.match(probe?.label ?? '', /期望薪资/);
  });

  it('reads the label sitting in the control\'s own preceding siblings', () => {
    // siblingColumnLabel used to start the climb at the control's *parent*,
    // skipping the control's own siblings. `<p><label>学历</label><select>` then
    // missed the adjacent label entirely and climbed to the previous <p>, so
    // every field took the label of the field above it — the form off by one.
    const html = `<!doctype html><html><body><form>
      <p><label>学历</label><input type="text" name="a"></p>
      <p><label>性别</label><input type="text" name="b"></p>
      <p><label>出生日期</label><input type="text" name="c"></p>
    </form></body></html>`;
    const fields = detectFields({ doc: loadHtml(html), adapter: genericAdapter });
    const of = (name: string) => fields.find((f) => f.name === name);
    assert.match(of('a')?.label ?? '', /学历/);
    assert.match(of('b')?.label ?? '', /性别/);
    assert.match(of('c')?.label ?? '', /出生日期/);
  });
});

describe('field-detector: a label as the control\'s own preceding sibling', () => {
  it('reads the adjacent label rather than the previous row\'s', () => {
    // Regression: siblingColumnLabel started at the control's parent, skipping
    // the control's own siblings, so every field took the label of the field
    // above it. The whole form read one row off.
    const doc = loadHtml(`<!doctype html><html><body><form>
      <p><label>学历</label><select name="edu"><option>本科</option></select></p>
      <p><label>性别</label><select name="sex"><option>男</option></select></p>
      <p><label>工作性质</label><select name="et"><option>全职</option></select></p>
    </form></body></html>`);
    const byName = new Map(
      detectFields({ doc, adapter: genericAdapter }).map((f) => [f.name, f]),
    );
    assert.equal(byName.get('edu')?.label, '学历');
    assert.equal(byName.get('sex')?.label, '性别');
    assert.equal(byName.get('et')?.label, '工作性质');
  });
});

describe('field-detector: adapter exclusions', () => {
  it('honours ignoreSelectors', () => {
    const doc = loadFixture('en-generic.html');
    const withEmail = detectFields({ doc, adapter: genericAdapter });
    assert.ok(withEmail.some((f) => f.name === 'email'));

    const filtered = detectFields({
      doc,
      adapter: { id: 'test', hosts: [], ignoreSelectors: ['input[name="email"]'] },
    });
    assert.ok(!filtered.some((f) => f.name === 'email'), 'ignoreSelectors was not applied');
  });

  it('tolerates an invalid selector without throwing', () => {
    const doc = loadFixture('en-generic.html');
    assert.doesNotThrow(() =>
      detectFields({ doc, adapter: { id: 'bad', hosts: [], ignoreSelectors: ['input[[['] } }),
    );
  });
});


describe('open shadow components', () => {
  it('keeps duplicate label IDs local, traverses nested roots, and resolves live controls', () => {
    const doc = loadHtml('<div id="a"></div><div id="b"></div>');
    const a = doc.getElementById('a')!.attachShadow({ mode: 'open' });
    a.innerHTML = '<label for="value">电子邮箱</label><input id="value" type="email">';
    const b = doc.getElementById('b')!.attachShadow({ mode: 'open' });
    b.innerHTML = '<div></div>';
    const nested = b.querySelector('div')!.attachShadow({ mode: 'open' });
    nested.innerHTML = '<label for="value">手机号</label><input id="value" type="tel">';
    const fields = detectFields({ doc });
    assert.deepEqual(fields.map((f) => f.label), ['电子邮箱', '手机号']);
    assert.equal(elementsFor(fields[1]!.fieldId, doc)[0], nested.querySelector('input'));
    assert.deepEqual(matchFields(fields).map((m) => m.fieldKey), ['contact.email', 'contact.phone']);
  });

  it('does not merge same-name radio groups in separate component trees', () => {
    const doc = loadHtml('<div id="a"></div><div id="b"></div>');
    for (const id of ['a', 'b']) {
      doc.getElementById(id)!.attachShadow({ mode: 'open' }).innerHTML =
        '<fieldset><legend>性别</legend><label><input type="radio" name="gender" value="male">男</label><label><input type="radio" name="gender" value="female">女</label></fieldset>';
    }
    const fields = detectFields({ doc });
    assert.equal(fields.length, 2);
    assert.ok(fields.every((f) => f.options.length === 2));
  });
});
