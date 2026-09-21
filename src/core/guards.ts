/**
 * Hard safety boundary. This module is the reason the extension can claim it is
 * not an application bot: the filler consults `guardField` before every write
 * and refuses anything flagged here, regardless of confidence.
 *
 * Categories:
 *  - identity   government ID / passport — never stored, never typed
 *  - financial  bank / card / tax numbers
 *  - challenge  CAPTCHA and SMS/OTP codes — must be a human
 *  - consent    legal declarations and agreement checkboxes
 *  - credential passwords and login secrets
 *  - submit     controls that would send the application
 */

import type { DetectedField } from './types.ts';
import { normalizeLabel } from './normalize.ts';

export type GuardCategory =
  | 'identity'
  | 'financial'
  | 'challenge'
  | 'consent'
  | 'credential'
  | 'submit';

export interface GuardVerdict {
  blocked: boolean;
  category?: GuardCategory;
  /** Human-readable, shown verbatim in the side panel. */
  reason?: string;
  /** The matched pattern, for the evidence trail. */
  matched?: string;
}

const PATTERNS: Array<{ category: GuardCategory; reason: string; needles: string[] }> = [
  {
    category: 'identity',
    reason: '身份证明类字段，扩展不存储也不填写',
    needles: [
      'id card', 'id number', 'identity card', 'identification number', 'national id',
      'passport', 'passport number', 'passport no', 'social security', 'ssn',
      'social insurance', 'sin number', 'national insurance', 'nino', 'aadhaar',
      'driver license', 'driving licence', 'residence permit',
      '身份证', '身份證', '身份证号', '证件号', '证件号码', '护照', '護照', '护照号',
      '社会保障号', '居住证', '驾驶证', '军官证', '台胞证', '港澳通行证',
      'マイナンバー', '個人番号', 'パスポート', '免許証番号', '在留カード',
    ],
  },
  {
    category: 'financial',
    reason: '金融账户类字段，扩展不存储也不填写',
    needles: [
      'bank account', 'account number', 'routing number', 'iban', 'swift', 'bic code',
      'card number', 'credit card', 'debit card', 'cvv', 'cvc', 'security code',
      'sort code', 'tax id', 'tin number', 'vat number', 'paypal',
      '银行账号', '银行卡', '银行卡号', '开户行', '账户号码', '税号', '纳税人识别号',
      '支付宝账号', '公积金账号', '社保号',
      '銀行口座', '口座番号', '振込先', 'カード番号',
    ],
  },
  {
    category: 'challenge',
    reason: '验证码 / 短信码必须由你本人输入',
    needles: [
      'captcha', 'recaptcha', 'hcaptcha', 'verification code', 'verify code',
      'confirmation code', 'security question', 'one time password', 'one-time code',
      'otp', 'sms code', 'text code', 'auth code', 'authentication code', '2fa',
      'two factor', 'mfa code', 'enter the code', 'code sent to',
      '验证码', '短信验证码', '图形验证码', '手机验证码', '邮箱验证码', '动态码',
      '安全问题', '滑动验证',
      '認証コード', '確認コード', 'ワンタイム', '認証番号', 'sms認証',
    ],
  },
  {
    category: 'consent',
    reason: '法律声明 / 同意条款需要你本人确认',
    needles: [
      'i agree', 'i accept', 'i consent', 'i acknowledge', 'i certify', 'i confirm that',
      'i declare', 'terms and conditions', 'terms of service', 'privacy policy',
      'privacy notice', 'data processing consent', 'background check consent',
      'i have read', 'agree to the terms', 'accept the terms', 'gdpr',
      'authorize', 'authorise', 'e-signature', 'electronic signature', 'signature',
      'affirm', 'under penalty of perjury', 'truthful and complete',
      '我已阅读', '我同意', '我确认', '我承诺', '我声明', '同意条款', '隐私政策',
      '用户协议', '服务条款', '授权', '背景调查', '真实有效', '如实填写', '电子签名', '签名',
      '同意します', '承諾', '規約に同意', 'プライバシーポリシー', '個人情報の取扱い',
      '署名', '誓約',
    ],
  },
  {
    category: 'credential',
    reason: '登录凭据类字段，扩展不填写',
    needles: [
      'password', 'passcode', 'pin code', 'current password', 'new password',
      'confirm password', 'secret', 'api key', 'token',
      '密码', '密碼', '确认密码', '登录密码', '支付密码',
      'パスワード', '暗証番号',
    ],
  },
];

/** Text/values that indicate a control would submit or advance the application. */
const SUBMIT_NEEDLES = [
  'submit', 'submit application', 'apply now', 'send application', 'finish and submit',
  'confirm and submit', 'complete application',
  '提交', '提交申请', '立即申请', '投递', '立即投递', '发送申请', '确认提交', '完成申请',
  '応募する', '送信', '提出', 'エントリーする', '申し込む',
];

function findNeedle(haystack: string, needles: string[]): string | null {
  if (!haystack) return null;
  for (const needle of needles) {
    const norm = normalizeLabel(needle);
    if (norm.length >= 2 && haystack.includes(norm)) return needle;
  }
  return null;
}

/** All the text that describes a field, joined and normalised once. */
export function guardHaystack(field: DetectedField): string {
  return normalizeLabel(
    [
      field.label,
      field.ariaLabel,
      field.placeholder,
      field.name,
      field.id,
      field.title,
      field.legend,
      field.nearbyText,
      field.autocomplete,
      ...field.options.map((o) => o.label),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Decides whether a field may be written to at all.
 * Called by the matcher (to band it as `blocked`) and again by the filler
 * (defence in depth — a stale plan cannot slip past).
 */
export function guardField(field: DetectedField): GuardVerdict {
  if (field.inputType === 'password') {
    return {
      blocked: true,
      category: 'credential',
      reason: '登录凭据类字段，扩展不填写',
      matched: 'type=password',
    };
  }
  if (field.inputType === 'file') {
    return {
      blocked: true,
      category: 'identity',
      reason: '文件上传需要你本人操作',
      matched: 'type=file',
    };
  }
  if (field.inputType === 'hidden') {
    return { blocked: true, category: 'submit', reason: '隐藏字段不填写', matched: 'type=hidden' };
  }

  const haystack = guardHaystack(field);

  for (const group of PATTERNS) {
    const matched = findNeedle(haystack, group.needles);
    if (matched) {
      return { blocked: true, category: group.category, reason: group.reason, matched };
    }
  }

  // A checkbox whose label reads like a declaration is a consent control even
  // when it dodges the phrase list — treat single unlabelled-value checkboxes
  // near legal words conservatively.
  if (field.kind === 'checkbox') {
    const legalish = findNeedle(haystack, [
      'policy', 'consent', 'agreement', 'declaration', 'legal', 'gdpr', 'terms',
      '条款', '协议', '声明', '同意', '授权',
      '規約', '同意', '承諾', '誓約',
    ]);
    if (legalish) {
      return {
        blocked: true,
        category: 'consent',
        reason: '疑似法律声明，需要你本人确认',
        matched: legalish,
      };
    }
  }

  return { blocked: false };
}

/** True when the given text looks like a submit control. */
export function isSubmitText(text: string): boolean {
  return findNeedle(normalizeLabel(text), SUBMIT_NEEDLES) !== null;
}

export const GUARD_CATEGORY_LABELS: Record<GuardCategory, string> = {
  identity: '身份证明',
  financial: '金融信息',
  challenge: '验证码',
  consent: '法律声明',
  credential: '登录凭据',
  submit: '提交控件',
};
