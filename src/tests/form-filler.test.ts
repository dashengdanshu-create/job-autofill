import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectFields } from '../content/field-detector.ts';
import { fillFields } from '../content/form-filler.ts';
import { matchFields } from '../core/field-matcher.ts';
import { resolveValue, enumLabelsFor } from '../core/candidate-profile.ts';
import { genericAdapter } from '../adapters/generic.ts';
import type { DetectedField, FillPlanEntry } from '../core/types.ts';
import { loadFixture, sampleProfile } from './helpers.ts';

interface Harness {
  doc: Document;
  fields: DetectedField[];
  byName(name: string): DetectedField;
  control(name: string): HTMLInputElement;
}

function harness(fixture: string): Harness {
  const doc = loadFixture(fixture);
  const fields = detectFields({ doc, adapter: genericAdapter });
  return {
    doc,
    fields,
    byName(name) {
      const found = fields.find((f) => f.name === name);
      if (!found) throw new Error(`no detected field named ${name}`);
      return found;
    },
    control(name) {
      const el = doc.querySelector(`[name="${name}"]`);
      if (!el) throw new Error(`no element named ${name}`);
      return el as HTMLInputElement;
    },
  };
}

const entry = (f: DetectedField, value: string): FillPlanEntry => ({
  fieldId: f.fieldId,
  value,
  kind: f.kind,
});

describe('form-filler: text controls', () => {
  it('writes a value and reports filled', () => {
    const h = harness('en-generic.html');
    const results = fillFields([entry(h.byName('email'), 'a@b.com')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'filled');
    assert.equal(h.control('email').value, 'a@b.com');
  });

  it('dispatches input and change events that bubble', () => {
    const h = harness('en-generic.html');
    const el = h.control('email');
    const seen: string[] = [];
    for (const type of ['input', 'change']) {
      el.addEventListener(type, (e) => {
        seen.push(type);
        assert.equal(e.bubbles, true, `${type} must bubble`);
      });
    }
    fillFields([entry(h.byName('email'), 'x@y.com')], h.fields, h.doc);
    assert.deepEqual(seen, ['input', 'change']);
  });

  it('fills a textarea', () => {
    const h = harness('en-generic.html');
    const results = fillFields([entry(h.byName('cover_letter'), '你好，我想申请')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'filled');
    assert.equal(h.control('cover_letter').value, '你好，我想申请');
  });

  it('skips an entry with no value', () => {
    const h = harness('en-generic.html');
    const results = fillFields([entry(h.byName('email'), '')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'skipped');
    assert.match(results[0]?.reason ?? '', /档案/);
  });

  it('reports failure for an unknown fieldId', () => {
    const h = harness('en-generic.html');
    const results = fillFields(
      [{ fieldId: 'jaf-does-not-exist', value: 'x', kind: 'text' }],
      h.fields,
      h.doc,
    );
    assert.equal(results[0]?.status, 'failed');
  });
});

describe('form-filler: selects', () => {
  it('matches an option by its value', () => {
    const h = harness('en-generic.html');
    const results = fillFields([entry(h.byName('country'), 'CN')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'filled');
    assert.equal((h.control('country') as unknown as HTMLSelectElement).value, 'CN');
  });

  it('matches an option by its visible text', () => {
    const h = harness('en-generic.html');
    const results = fillFields([entry(h.byName('country'), 'Japan')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'filled');
    assert.equal((h.control('country') as unknown as HTMLSelectElement).value, 'JP');
  });

  it('matches a CJK option by text', () => {
    const h = harness('zh-generic.html');
    const results = fillFields([entry(h.byName('xueli'), '本科')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'filled');
    assert.equal((h.control('xueli') as unknown as HTMLSelectElement).value, '本科');
  });

  it('fails cleanly when no option matches', () => {
    const h = harness('en-generic.html');
    const results = fillFields([entry(h.byName('country'), 'Atlantis')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'failed');
    assert.match(results[0]?.reason ?? '', /选项/);
  });
});

describe('form-filler: radios and checkboxes', () => {
  it('selects the matching radio by value', () => {
    const h = harness('en-generic.html');
    const results = fillFields([entry(h.byName('relocate'), 'yes')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'filled');
    const chosen = Array.from(h.doc.querySelectorAll('[name="relocate"]'))
      .find((el) => (el as HTMLInputElement).checked) as HTMLInputElement | undefined;
    assert.equal(chosen?.value, 'yes');
  });

  it('selects a CJK radio option', () => {
    const h = harness('zh-generic.html');
    const results = fillFields([entry(h.byName('xingbie'), '男')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'filled');
    const chosen = Array.from(h.doc.querySelectorAll('[name="xingbie"]'))
      .find((el) => (el as HTMLInputElement).checked) as HTMLInputElement | undefined;
    assert.equal(chosen?.value, '男');
  });

  it('leaves other members of the group unchecked', () => {
    const h = harness('en-generic.html');
    fillFields([entry(h.byName('relocate'), 'yes')], h.fields, h.doc);
    const checked = Array.from(h.doc.querySelectorAll('[name="relocate"]'))
      .filter((el) => (el as HTMLInputElement).checked);
    assert.equal(checked.length, 1);
  });

  it('fails when the requested option is absent', () => {
    const h = harness('en-generic.html');
    const results = fillFields([entry(h.byName('relocate'), 'maybe')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'failed');
  });
});

describe('form-filler: guard enforcement', () => {
  it('refuses a guarded field even when the plan names it', () => {
    const h = harness('hostile.html');
    const idCard = h.byName('id_card_number');
    const results = fillFields([entry(idCard, '110101199001011234')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'skipped');
    assert.match(results[0]?.reason ?? '', /已拦截/);
    assert.equal(h.control('id_card_number').value ?? '', '');
  });

  it('refuses a consent checkbox', () => {
    const h = harness('hostile.html');
    const results = fillFields([entry(h.byName('agree'), 'yes')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'skipped');
    assert.ok(!h.control('agree').checked, 'consent box must stay unchecked');
  });

  it('refuses every sensitive field in the hostile fixture', () => {
    const h = harness('hostile.html');
    const sensitive = h.fields.filter((f) => f.name !== 'email');
    const results = fillFields(sensitive.map((f) => entry(f, 'x')), h.fields, h.doc);
    for (const [i, result] of results.entries()) {
      assert.equal(result.status, 'skipped',
        `${sensitive[i]?.name} should have been skipped, got ${result.status}`);
    }
  });

  it('still fills the one safe field in that fixture', () => {
    const h = harness('hostile.html');
    const results = fillFields([entry(h.byName('email'), 'ok@example.com')], h.fields, h.doc);
    assert.equal(results[0]?.status, 'filled');
  });
});

describe('form-filler: never submits', () => {
  it('does not call form.submit or click a submit button', () => {
    const h = harness('en-generic.html');
    const form = h.doc.querySelector('form') as unknown as {
      submit: () => void;
      requestSubmit?: () => void;
    };
    let submitted = false;
    form.submit = () => { submitted = true; };
    form.requestSubmit = () => { submitted = true; };

    let submitEvents = 0;
    h.doc.querySelector('form')?.addEventListener('submit', () => { submitEvents += 1; });

    const plan = h.fields
      .filter((f) => ['email', 'phone', 'first_name', 'relocate', 'country'].includes(f.name))
      .map((f) => entry(f, f.name === 'relocate' ? 'yes' : f.name === 'country' ? 'CN' : 'v'));
    fillFields(plan, h.fields, h.doc);

    assert.equal(submitted, false, 'the filler must never submit a form');
    assert.equal(submitEvents, 0, 'no submit event may be dispatched');
  });
});

describe('form-filler: end-to-end against fixtures', () => {
  /** Detect → match → resolve → fill, the way the side panel does it. */
  function autofill(fixture: string) {
    const h = harness(fixture);
    const profile = sampleProfile();
    const matches = matchFields(h.fields, { adapter: genericAdapter });
    const byId = new Map(h.fields.map((f) => [f.fieldId, f]));

    const plan: FillPlanEntry[] = [];
    for (const match of matches) {
      if (match.band !== 'auto' && match.band !== 'review') continue;
      if (!match.fieldKey) continue;
      const field = byId.get(match.fieldId);
      if (!field) continue;
      const resolved = resolveValue(profile, match.fieldKey);
      if (!resolved) continue;

      let value = resolved.value;
      if (field.options.length > 0) {
        const candidates = [resolved.value, ...enumLabelsFor(match.fieldKey, resolved.value)];
        const norm = (s: string) => s.toLowerCase().trim();
        const hit = field.options.find((o) =>
          candidates.some((c) => norm(o.value) === norm(c) || norm(o.label) === norm(c)),
        );
        if (!hit) continue;
        value = hit.value || hit.label;
      }
      plan.push({ fieldId: field.fieldId, value, kind: field.kind });
    }

    const results = fillFields(plan, h.fields, h.doc);
    return { h, plan, results, matches };
  }

  it('fills the English form with profile data', () => {
    const { h, results } = autofill('en-generic.html');
    assert.ok(results.filter((r) => r.status === 'filled').length >= 8,
      `expected 8+ fills, got ${results.filter((r) => r.status === 'filled').length}`);
    assert.equal(h.control('email').value, 'zhangwei@example.com');
    assert.equal(h.control('phone').value, '13800138000');
    assert.equal(h.control('first_name').value, 'Wei');
    assert.equal(h.control('last_name').value, 'Zhang');
    assert.equal(h.control('school').value, '清华大学');
  });

  it('fills the Chinese form despite the table layout', () => {
    const { h, results } = autofill('zh-generic.html');
    assert.ok(results.filter((r) => r.status === 'filled').length >= 8,
      `expected 8+ fills, got ${results.filter((r) => r.status === 'filled').length}`);
    assert.equal(h.control('xingming').value, '张伟');
    assert.equal(h.control('youxiang').value, 'zhangwei@example.com');
    assert.equal(h.control('yuanxiao').value, '清华大学');
  });

  it('fills the Japanese form', () => {
    const { h, results } = autofill('ja-generic.html');
    assert.ok(results.filter((r) => r.status === 'filled').length >= 8,
      `expected 8+ fills, got ${results.filter((r) => r.status === 'filled').length}`);
    assert.equal(h.control('mail').value, 'zhangwei@example.com');
    assert.equal(h.control('name_kana').value, 'チョウ イ');
    assert.equal(h.control('company').value, '字节跳动');
  });

  it('leaves every sensitive field untouched across all fixtures', () => {
    for (const fixture of ['en-generic.html', 'zh-generic.html', 'ja-generic.html', 'hostile.html']) {
      const { h } = autofill(fixture);
      const sensitiveNames = [
        'ssn', 'verification_code', 'shenfenzheng', 'yinhangka', 'yanzhengma',
        'my_number', 'passport_no', 'auth_code', 'bank_account', 'id_card_number',
        'card_number', 'cvv', 'sms_code', 'captcha', 'otp', 'tax_id', 'signature',
      ];
      for (const name of sensitiveNames) {
        const el = h.doc.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
        if (!el) continue;
        assert.ok(!el.value, `${fixture}: ${name} was filled with "${el.value}"`);
      }
      const consentNames = ['agree_terms', 'privacy', 'chengnuo', 'yinsi', 'doui', 'agree', 'bgcheck', 'declare'];
      for (const name of consentNames) {
        const el = h.doc.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
        if (!el) continue;
        assert.ok(!el.checked, `${fixture}: ${name} was checked`);
      }
    }
  });
});
