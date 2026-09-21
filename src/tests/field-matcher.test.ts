import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchField, matchFields } from '../core/field-matcher.ts';
import { BANDS } from '../core/confidence.ts';
import { field } from './helpers.ts';

/** Convenience: match one synthetic field and return key + band. */
function m(partial: Parameters<typeof field>[0]) {
  return matchField(field(partial));
}

describe('field-matcher: English forms', () => {
  it('matches email from type + label and fills automatically', () => {
    const result = m({ label: 'Email Address', name: 'email', inputType: 'email' });
    assert.equal(result.fieldKey, 'contact.email');
    assert.equal(result.band, 'auto');
    assert.ok(result.confidence >= BANDS.AUTO);
  });

  it('trusts autocomplete over ambiguous text', () => {
    const result = m({ label: 'Contact', name: 'q_4471', autocomplete: 'tel' });
    assert.equal(result.fieldKey, 'contact.phone');
    assert.equal(result.band, 'auto');
  });

  it('distinguishes first name from last name', () => {
    assert.equal(m({ label: 'First Name *', name: 'first_name' }).fieldKey, 'basic.firstName');
    assert.equal(m({ label: 'Last Name *', name: 'last_name' }).fieldKey, 'basic.lastName');
  });

  it('reads Workday-style label with required marker', () => {
    const result = m({ label: 'Phone Number *', name: 'phone', inputType: 'tel' });
    assert.equal(result.fieldKey, 'contact.phone');
    assert.equal(result.band, 'auto');
  });

  it('maps degree select via its label', () => {
    const result = m({
      label: 'Highest Level of Education',
      name: 'degree',
      kind: 'select',
      options: [
        { value: '', label: 'Select…' },
        { value: 'bachelors', label: "Bachelor's Degree" },
        { value: 'masters', label: "Master's Degree" },
      ],
    });
    assert.equal(result.fieldKey, 'education.degree');
    assert.ok(result.confidence >= BANDS.REVIEW);
  });

  it('routes a legend question to the relocation preference', () => {
    const result = m({
      kind: 'radio',
      inputType: 'radio',
      name: 'relocate',
      legend: 'Are you willing to relocate?',
      label: 'Are you willing to relocate?',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    });
    assert.equal(result.fieldKey, 'pref.willingToRelocate');
  });

  it('separates cover letter from why-this-company', () => {
    assert.equal(
      m({ label: 'Cover Letter', name: 'cover_letter', kind: 'textarea' }).fieldKey,
      'answer.coverLetter',
    );
    assert.equal(
      m({ label: 'Why do you want to work here?', name: 'why_company', kind: 'textarea' }).fieldKey,
      'answer.whyThisCompany',
    );
  });
});

describe('field-matcher: Chinese forms', () => {
  it('matches 姓名 without any label association', () => {
    const result = m({ nearbyText: '姓名', name: 'xingming' });
    assert.equal(result.fieldKey, 'basic.fullName');
    assert.ok(result.confidence >= BANDS.REVIEW);
  });

  it('does not confuse 公司名称 with 姓名', () => {
    const result = m({ nearbyText: '公司名称', name: 'gongsi' });
    assert.notEqual(result.fieldKey, 'basic.fullName');
  });

  it('does not treat 紧急联系人姓名 as the candidate name', () => {
    const result = m({ label: '紧急联系人姓名', name: 'emergency_contact' });
    assert.notEqual(result.fieldKey, 'basic.fullName');
  });

  it('matches 手机号码 and 电子邮箱', () => {
    assert.equal(m({ nearbyText: '手机号码', name: 'shouji', inputType: 'tel' }).fieldKey, 'contact.phone');
    assert.equal(m({ nearbyText: '电子邮箱', name: 'youxiang', inputType: 'email' }).fieldKey, 'contact.email');
  });

  it('matches 最高学历 / 毕业院校 / 所学专业', () => {
    assert.equal(m({ nearbyText: '最高学历', name: 'xueli', kind: 'select' }).fieldKey, 'education.degree');
    assert.equal(m({ nearbyText: '毕业院校', name: 'yuanxiao' }).fieldKey, 'education.school');
    assert.equal(m({ nearbyText: '所学专业', name: 'zhuanye' }).fieldKey, 'education.major');
  });

  it('distinguishes 应聘职位 (desired) from 职位名称 (current)', () => {
    assert.equal(m({ nearbyText: '应聘职位', name: 'yingpin_zhiwei' }).fieldKey, 'pref.targetTitle');
    assert.equal(m({ nearbyText: '职位名称', name: 'zhiwei' }).fieldKey, 'work.title');
  });

  it('matches 期望薪资 but not 当前薪资', () => {
    assert.equal(m({ nearbyText: '期望薪资', name: 'qiwang_xinzi' }).fieldKey, 'pref.expectedSalary');
    assert.notEqual(m({ nearbyText: '当前薪资', name: 'dangqian_xinzi' }).fieldKey, 'pref.expectedSalary');
  });

  it('matches 离职原因 and 工作内容', () => {
    assert.equal(m({ nearbyText: '离职原因', name: 'lizhi_yuanyin' }).fieldKey, 'work.leaveReason');
    assert.equal(
      m({ nearbyText: '工作内容', name: 'gongzuo_neirong', kind: 'textarea' }).fieldKey,
      'work.description',
    );
  });

  it('handles traditional Chinese via folding', () => {
    const result = m({ nearbyText: '最高學歷', name: 'xueli' });
    assert.equal(result.fieldKey, 'education.degree');
  });

  it('matches 自我介绍 in a div-as-label layout', () => {
    const result = m({ nearbyText: '自我介绍', name: 'zwjs', kind: 'textarea' });
    assert.equal(result.fieldKey, 'answer.selfIntroduction');
  });
});

describe('field-matcher: Japanese forms', () => {
  it('matches 氏名 to full name', () => {
    const result = m({ label: '氏名', name: 'name' });
    assert.equal(result.fieldKey, 'basic.fullName');
  });

  it('keeps 会社名 out of 氏名', () => {
    const result = m({ label: '会社名', name: 'company' });
    assert.equal(result.fieldKey, 'work.company');
  });

  it('matches フリガナ separately from 氏名', () => {
    const result = m({ label: 'フリガナ', name: 'name_kana' });
    assert.equal(result.fieldKey, 'basic.nameKana');
  });

  it('folds katakana to hiragana (ふりがな === フリガナ)', () => {
    assert.equal(m({ label: 'ふりがな', name: 'kana' }).fieldKey, 'basic.nameKana');
  });

  it('matches メールアドレス and 電話番号', () => {
    assert.equal(m({ label: 'メールアドレス', name: 'mail', inputType: 'email' }).fieldKey, 'contact.email');
    assert.equal(m({ label: '電話番号', name: 'tel', inputType: 'tel' }).fieldKey, 'contact.phone');
  });

  it('matches 郵便番号 via autocomplete', () => {
    const result = m({ label: '郵便番号', name: 'zip', autocomplete: 'postal-code' });
    assert.equal(result.fieldKey, 'contact.address.postalCode');
    assert.equal(result.band, 'auto');
  });

  it('matches 最終学歴 / 専攻 / 学校名', () => {
    assert.equal(m({ label: '最終学歴', name: 'education', kind: 'select' }).fieldKey, 'education.degree');
    assert.equal(m({ label: '専攻', name: 'major' }).fieldKey, 'education.major');
    assert.equal(m({ label: '学校名', name: 'school_name' }).fieldKey, 'education.school');
  });

  it('distinguishes 希望職種 from 職種', () => {
    assert.equal(m({ label: '希望職種', name: 'desired_position' }).fieldKey, 'pref.targetTitle');
    assert.equal(m({ label: '職種', name: 'job_type' }).fieldKey, 'work.title');
  });

  it('matches 希望年収 and 入社可能日', () => {
    assert.equal(m({ label: '希望年収', name: 'desired_salary' }).fieldKey, 'pref.expectedSalary');
    assert.equal(m({ label: '入社可能日', name: 'available_date' }).fieldKey, 'pref.availableFrom');
  });

  it('matches 自己PR and 志望動機 to distinct templates', () => {
    assert.equal(
      m({ label: '自己PR', name: 'self_pr', kind: 'textarea' }).fieldKey,
      'answer.selfIntroduction',
    );
    assert.equal(
      m({ label: '志望動機', name: 'motivation', kind: 'textarea' }).fieldKey,
      'answer.whyThisCompany',
    );
  });
});

describe('field-matcher: past salary vs expected salary', () => {
  // Two different questions that share most of their wording. Filling the
  // employment-history salary with the expected one misstates the candidate's
  // current position in a negotiation, so each vetoes the other's phrasing.
  it('reads a bare salary label as the salary at that job', () => {
    for (const label of ['月薪（税前）', '年薪', '税前月薪', '当前薪资', '現年収']) {
      assert.equal(m({ label }).fieldKey, 'work.salaryLabel', label);
    }
  });

  it('reads an expectation as the expected salary', () => {
    for (const label of ['期望薪资', '期望月薪', '薪资要求', '希望年収']) {
      assert.equal(m({ label }).fieldKey, 'pref.expectedSalary', label);
    }
  });
});

describe('field-matcher: evidence and policy', () => {
  it('always returns fieldKey, confidence and evidence', () => {
    const result = m({ label: 'Email', inputType: 'email', name: 'email' });
    assert.ok('fieldKey' in result && 'confidence' in result && 'evidence' in result);
    assert.ok(result.evidence.length > 0);
    for (const e of result.evidence) {
      assert.ok(typeof e.source === 'string' && e.source.length > 0);
      assert.ok(typeof e.value === 'string');
    }
  });

  it('reports corroboration when two stages agree', () => {
    const result = m({ label: 'Email Address', name: 'email', inputType: 'email' });
    const sources = new Set(result.evidence.map((e) => e.source));
    assert.ok(sources.size >= 2, `expected multiple evidence sources, got ${[...sources]}`);
  });

  it('scores an unrelated field below the fill floor', () => {
    const result = m({ label: 'How did you hear about this role?', name: 'source_channel' });
    assert.ok(
      result.confidence < BANDS.REVIEW || result.fieldKey === null,
      `unrelated field should not be fillable, got ${result.fieldKey} @ ${result.confidence}`,
    );
  });

  it('penalises a type mismatch', () => {
    const plain = m({ label: 'Full Name', name: 'full_name' });
    const numeric = m({ label: 'Full Name', name: 'full_name', inputType: 'number' });
    assert.ok(numeric.confidence < plain.confidence);
  });

  it('demotes the weaker of two fields claiming the same key', () => {
    const matches = matchFields([
      field({ fieldId: 'a', label: 'Email Address', name: 'email', inputType: 'email' }),
      field({ fieldId: 'b', label: 'Email', name: 'email_2' }),
    ]);
    const emailMatches = matches.filter((x) => x.fieldKey === 'contact.email');
    const autoCount = emailMatches.filter((x) => x.band === 'auto').length;
    assert.equal(autoCount, 1, 'only one field may auto-fill a given profile key');
  });

  it('never returns a band outside the documented set', () => {
    const matches = matchFields([
      field({ fieldId: 'a', label: 'Email', inputType: 'email' }),
      field({ fieldId: 'b', label: 'ID Card Number' }),
      field({ fieldId: 'c', label: 'Random unrelated question' }),
    ]);
    for (const match of matches) {
      assert.ok(['auto', 'review', 'skip', 'blocked'].includes(match.band));
    }
  });
});
