import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { guardField, isSubmitText } from '../core/guards.ts';
import { matchField } from '../core/field-matcher.ts';
import { field } from './helpers.ts';

const blocked = (partial: Parameters<typeof field>[0]) => guardField(field(partial));

describe('guards: identity and financial', () => {
  const cases: Array<[string, Parameters<typeof field>[0]]> = [
    ['ID card (en)', { label: 'ID Card Number', name: 'id_card_number' }],
    ['ID card (zh)', { nearbyText: '身份证号', name: 'shenfenzheng' }],
    ['passport (en)', { label: 'Passport Number', name: 'passport_number' }],
    ['passport (ja)', { label: 'パスポート番号', name: 'passport_no' }],
    ['my number (ja)', { label: 'マイナンバー', name: 'my_number' }],
    ['SSN', { label: 'Social Security Number', name: 'ssn' }],
    ['bank account (en)', { label: 'Bank Account Number', name: 'bank_account' }],
    ['bank account (zh)', { nearbyText: '银行卡号', name: 'yinhangka' }],
    ['bank account (ja)', { label: '銀行口座番号', name: 'bank_account' }],
    ['card number', { label: 'Credit Card Number', name: 'card_number' }],
    ['CVV', { label: 'CVV', name: 'cvv' }],
    ['tax id', { label: 'Tax ID', name: 'tax_id' }],
  ];

  for (const [name, partial] of cases) {
    it(`blocks ${name}`, () => {
      const verdict = blocked(partial);
      assert.equal(verdict.blocked, true, `${name} must be blocked`);
      assert.ok(verdict.category === 'identity' || verdict.category === 'financial');
      assert.ok(verdict.reason && verdict.reason.length > 0);
    });
  }
});

describe('guards: challenges', () => {
  const cases: Array<[string, Parameters<typeof field>[0]]> = [
    ['CAPTCHA', { label: 'Enter the CAPTCHA text', name: 'captcha' }],
    ['SMS code (en)', { label: 'SMS Verification Code', name: 'sms_code' }],
    ['SMS code (zh)', { nearbyText: '短信验证码', name: 'yanzhengma' }],
    ['auth code (ja)', { label: '認証コード', name: 'auth_code' }],
    ['OTP', { label: 'One Time Password', name: 'otp' }],
    ['verification code', { label: 'Verification Code', name: 'verification_code' }],
  ];

  for (const [name, partial] of cases) {
    it(`blocks ${name}`, () => {
      const verdict = blocked(partial);
      assert.equal(verdict.blocked, true);
      assert.equal(verdict.category, 'challenge');
    });
  }
});

describe('guards: consent declarations', () => {
  const cases: Array<[string, Parameters<typeof field>[0]]> = [
    ['terms checkbox (en)', {
      kind: 'checkbox', inputType: 'checkbox', name: 'agree',
      label: 'I agree to the Terms and Conditions',
    }],
    ['background check', {
      kind: 'checkbox', inputType: 'checkbox', name: 'bgcheck',
      label: 'I consent to a background check',
    }],
    ['perjury declaration', {
      kind: 'checkbox', inputType: 'checkbox', name: 'declare',
      label: 'I declare under penalty of perjury that the above is true',
    }],
    ['truthfulness (en)', {
      kind: 'checkbox', inputType: 'checkbox', name: 'agree_terms',
      label: 'I certify that the information provided is truthful and complete.',
    }],
    ['commitment (zh)', {
      kind: 'checkbox', inputType: 'checkbox', name: 'chengnuo',
      label: '我承诺以上信息真实有效，如有虚假愿承担相应责任。',
    }],
    ['privacy (zh)', {
      kind: 'checkbox', inputType: 'checkbox', name: 'yinsi',
      label: '我已阅读并同意《隐私政策》和《用户协议》。',
    }],
    ['privacy (ja)', {
      kind: 'checkbox', inputType: 'checkbox', name: 'doui',
      label: '個人情報の取扱いについて同意します。',
    }],
    ['signature field', { label: 'Electronic Signature', name: 'signature' }],
  ];

  for (const [name, partial] of cases) {
    it(`blocks ${name}`, () => {
      const verdict = blocked(partial);
      assert.equal(verdict.blocked, true, `${name} must be blocked`);
      assert.equal(verdict.category, 'consent');
    });
  }
});

describe('guards: input types', () => {
  it('blocks password inputs by type alone', () => {
    const verdict = blocked({ inputType: 'password', label: 'Anything' });
    assert.equal(verdict.blocked, true);
    assert.equal(verdict.category, 'credential');
  });

  it('blocks file uploads', () => {
    const verdict = blocked({ inputType: 'file', label: 'Upload Resume' });
    assert.equal(verdict.blocked, true);
  });

  it('blocks hidden inputs', () => {
    const verdict = blocked({ inputType: 'hidden', name: 'csrf_token' });
    assert.equal(verdict.blocked, true);
  });
});

describe('guards: selectivity', () => {
  it('allows an ordinary email field', () => {
    assert.equal(blocked({ label: 'Email Address', name: 'email', inputType: 'email' }).blocked, false);
  });

  it('allows ordinary profile fields in all three languages', () => {
    assert.equal(blocked({ label: '姓名', name: 'xingming' }).blocked, false);
    assert.equal(blocked({ label: '氏名', name: 'name' }).blocked, false);
    assert.equal(blocked({ label: 'Expected Salary', name: 'salary' }).blocked, false);
    assert.equal(blocked({ label: '希望年収', name: 'desired_salary' }).blocked, false);
  });

  it('allows a non-legal checkbox', () => {
    const verdict = blocked({
      kind: 'checkbox', inputType: 'checkbox', name: 'remote',
      label: 'Open to remote work',
    });
    assert.equal(verdict.blocked, false);
  });
});

describe('guards: integration with the matcher', () => {
  it('bands a guarded field as blocked with zero confidence', () => {
    const match = matchField(field({ label: 'Passport Number', name: 'passport' }));
    assert.equal(match.band, 'blocked');
    assert.equal(match.confidence, 0);
    assert.equal(match.fieldKey, null);
    assert.ok(match.blockedReason);
    assert.equal(match.evidence[0]?.source, 'guard');
  });

  it('blocks a consent checkbox even though its text resembles a profile field', () => {
    const match = matchField(field({
      kind: 'checkbox',
      inputType: 'checkbox',
      name: 'confirm_name',
      label: 'I certify that my name and email are accurate',
    }));
    assert.equal(match.band, 'blocked');
  });
});

describe('guards: submit detection', () => {
  it('recognises submit text in three languages', () => {
    assert.equal(isSubmitText('Submit Application'), true);
    assert.equal(isSubmitText('提交申请'), true);
    assert.equal(isSubmitText('応募する'), true);
    assert.equal(isSubmitText('立即投递'), true);
  });

  it('does not flag ordinary labels as submit controls', () => {
    assert.equal(isSubmitText('Email Address'), false);
    assert.equal(isSubmitText('期望薪资'), false);
  });
});
