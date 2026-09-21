import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMA_VERSION,
  createEmptyProfile,
  enumLabelsFor,
  normalizeProfile,
  resolveValue,
} from '../core/candidate-profile.ts';
import { FORBIDDEN_KEY_PATTERN, exportJson, importJson } from '../storage/profile-store.ts';
import { ALL_FIELD_KEYS } from '../core/aliases.ts';
import { sampleProfile } from './helpers.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('profile: schema shape', () => {
  it('creates an empty profile with every top-level section', () => {
    const p = createEmptyProfile();
    for (const key of [
      'schemaVersion', 'basic', 'contact', 'education', 'workExperience',
      'projects', 'languages', 'skills', 'jobPreferences', 'answerTemplates',
    ]) {
      assert.ok(key in p, `missing section: ${key}`);
    }
    assert.equal(p.schemaVersion, SCHEMA_VERSION);
  });

  it('has no slot for sensitive identifiers anywhere in the schema', () => {
    const schema = readFileSync(
      resolve(here, '../schema/candidate-profile.schema.json'),
      'utf8',
    );
    const parsed = JSON.parse(schema) as unknown;
    const offenders: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (FORBIDDEN_KEY_PATTERN.test(key)) offenders.push(`${path}.${key}`);
          walk(value, `${path}.${key}`);
        }
      }
    };
    walk(parsed, '');
    assert.deepEqual(offenders, [], `schema must not define sensitive fields: ${offenders}`);
  });

  it('normalises partial and malformed input without throwing', () => {
    assert.equal(normalizeProfile(null).schemaVersion, SCHEMA_VERSION);
    assert.equal(normalizeProfile('nonsense').basic.fullName, '');
    assert.equal(normalizeProfile(42).education.length, 0);

    const partial = normalizeProfile({ basic: { fullName: '李雷' }, education: [{ school: '北大' }] });
    assert.equal(partial.basic.fullName, '李雷');
    assert.equal(partial.education[0]?.school, '北大');
    // Absent branches are filled with defaults rather than left undefined.
    assert.equal(partial.contact.address.city, '');
    assert.equal(partial.education[0]?.degree, '');
  });

  it('survives a round trip through export and import', () => {
    const original = sampleProfile();
    const { profile } = importJson(exportJson(original));
    assert.equal(profile.basic.fullName, original.basic.fullName);
    assert.equal(profile.contact.email, original.contact.email);
    assert.equal(profile.education[0]?.school, original.education[0]?.school);
    assert.equal(profile.answerTemplates.length, original.answerTemplates.length);
  });
});

describe('profile: import redaction', () => {
  it('strips sensitive keys and reports them', () => {
    const raw = JSON.stringify({
      basic: { fullName: '王芳', idCardNumber: '110101199001011234' },
      contact: { email: 'w@example.com', bankAccount: '6222020000000000' },
      extra: { passportNumber: 'E12345678', password: 'hunter2' },
    });
    const report = importJson(raw);
    assert.equal(report.profile.basic.fullName, '王芳');
    assert.equal(report.profile.contact.email, 'w@example.com');
    assert.ok(report.redacted.length >= 4, `expected redactions, got ${report.redacted}`);

    const serialized = JSON.stringify(report.profile);
    for (const secret of ['110101199001011234', '6222020000000000', 'E12345678', 'hunter2']) {
      assert.ok(!serialized.includes(secret), `secret leaked into profile: ${secret}`);
    }
  });

  it('strips CJK-named sensitive keys too', () => {
    const report = importJson(JSON.stringify({ basic: { 身份证: 'x', 银行卡号: 'y' } }));
    assert.ok(report.redacted.length >= 2);
    assert.ok(!JSON.stringify(report.profile).includes('"x"'));
  });

  it('throws only on unparseable JSON', () => {
    assert.throws(() => importJson('{ not json'));
  });
});

describe('profile: value resolution', () => {
  const p = sampleProfile();

  it('resolves a representative key from each section', () => {
    const expectations: Array<[Parameters<typeof resolveValue>[1], string]> = [
      ['basic.fullName', '张伟'],
      ['contact.email', 'zhangwei@example.com'],
      ['contact.phone', '13800138000'],
      ['education.school', '清华大学'],
      ['education.major', '计算机科学与技术'],
      ['work.company', '字节跳动'],
      ['work.title', '高级前端工程师'],
      ['work.leaveReason', '寻求更大的技术挑战'],
      ['project.name', '设计系统 Atlas'],
      ['language.language', '中文'],
      ['pref.targetTitle', '前端工程师'],
      ['pref.noticePeriod', '一个月'],
      ['answer.selfIntroduction', '我是一名前端工程师，六年来专注于大型 Web 应用与设计系统。'],
    ];
    for (const [key, expected] of expectations) {
      assert.equal(resolveValue(p, key)?.value, expected, `wrong value for ${key}`);
    }
  });

  it('returns a source path for every resolved value', () => {
    const resolved = resolveValue(p, 'work.company');
    assert.equal(resolved?.sourcePath, 'workExperience[0].company');
  });

  it('composes expected salary with its currency', () => {
    assert.equal(resolveValue(p, 'pref.expectedSalary')?.value, '60 CNY');
  });

  it('renders booleans as yes/no', () => {
    assert.equal(resolveValue(p, 'pref.willingToRelocate')?.value, 'yes');
    assert.equal(resolveValue(p, 'pref.requiresVisaSponsorship')?.value, 'no');
  });

  it('composes a full name from parts when fullName is blank', () => {
    const partial = createEmptyProfile();
    partial.basic.firstName = 'Mei';
    partial.basic.lastName = 'Chen';
    assert.equal(resolveValue(partial, 'basic.fullName')?.value, 'Mei Chen');
  });

  it('returns null rather than an empty string when nothing is stored', () => {
    const empty = createEmptyProfile();
    for (const key of ALL_FIELD_KEYS) {
      const resolved = resolveValue(empty, key);
      assert.ok(
        resolved === null || resolved.value !== '',
        `${key} resolved to an empty string; it should be null`,
      );
    }
  });

  it('handles every declared field key without throwing', () => {
    for (const key of ALL_FIELD_KEYS) {
      assert.doesNotThrow(() => resolveValue(p, key), `resolveValue threw for ${key}`);
    }
  });

  it('resolves an answer template only when the key exists', () => {
    assert.ok(resolveValue(p, 'answer.whyThisCompany'));
    assert.equal(resolveValue(p, 'answer.careerGoal'), null);
  });
});

describe('profile: enum label mapping', () => {
  it('offers localised labels for each enum value', () => {
    const male = enumLabelsFor('basic.gender', 'male');
    assert.ok(male.includes('男'));
    assert.ok(male.includes('male'));

    const bachelor = enumLabelsFor('education.degree', 'bachelor');
    assert.ok(bachelor.includes('本科'));
    assert.ok(bachelor.some((l) => l.includes('achelor')));

    const remote = enumLabelsFor('pref.workMode', 'remote');
    assert.ok(remote.includes('远程'));
    assert.ok(remote.includes('リモート'));
  });

  it('falls back to the raw value for unmapped keys', () => {
    assert.deepEqual(enumLabelsFor('basic.fullName', '张伟'), ['张伟']);
  });

  it('returns an empty list for an empty value', () => {
    assert.deepEqual(enumLabelsFor('basic.gender', ''), []);
  });
});
