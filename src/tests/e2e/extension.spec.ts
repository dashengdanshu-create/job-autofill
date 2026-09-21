/**
 * End-to-end: the real built extension loaded into Chromium.
 *
 * Chrome's native side panel cannot be driven by Playwright, so the panel page
 * is opened as an ordinary tab. It still runs in a genuine extension context
 * (chrome.runtime / chrome.storage / chrome.tabs are all live), which is why the
 * service worker resolves its target tab by skipping chrome-extension:// URLs —
 * the same code path serves both the real panel and this test.
 */

import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const distPath = resolve(root, 'dist');

/**
 * Fixtures come from the local http server started by playwright.config.ts.
 * Chrome refuses to inject content scripts into file:// URLs unless the user
 * enables "Allow access to file URLs", which no command-line flag can set.
 */
const FIXTURE_ORIGIN = 'http://localhost:5177';
const fixtureUrl = (name: string) => `${FIXTURE_ORIGIN}/${name}`;

/** The profile the panel will load from chrome.storage.local. */
const PROFILE = {
  schemaVersion: '0.1',
  updatedAt: new Date().toISOString(),
  basic: {
    fullName: '张伟', firstName: 'Wei', lastName: 'Zhang', middleName: '',
    preferredName: '', nameLatin: 'Zhang Wei', nameKana: 'チョウ イ', pronouns: '',
    gender: 'male', birthDate: '1995-04-12', nationality: 'China',
    headline: '前端工程师', summary: '专注 Web 前端。', photoUrl: '',
  },
  contact: {
    email: 'zhangwei@example.com', emailAlternate: '', phone: '13800138000',
    phoneCountryCode: '+86', phoneE164: '', wechat: 'zhangwei_dev', line: '',
    address: {
      line1: '朝阳区建国路 88 号', line2: '', city: '北京', state: '北京',
      postalCode: '100022', country: 'China',
    },
    links: {
      website: 'https://zhangwei.dev', linkedin: 'https://linkedin.com/in/zhangwei',
      github: 'https://github.com/zhangwei', portfolio: '', other: [],
    },
  },
  // Two entries per repeating section: the V0.2 multi-entry test needs a second
  // row to prove entry 2 draws from row 2 rather than repeating row 1.
  education: [{
    school: '清华大学', schoolLatin: 'Tsinghua University', degree: 'bachelor',
    degreeLabel: '工学学士', major: '计算机科学与技术', minor: '',
    startDate: '2013-09', endDate: '2017-06', ongoing: false, gpa: '3.8',
    gpaScale: '4.0', location: '北京', highlights: [],
  }, {
    school: '北京大学', schoolLatin: 'Peking University', degree: 'master',
    degreeLabel: '工程硕士', major: '软件工程', minor: '',
    startDate: '2017-09', endDate: '2020-06', ongoing: false, gpa: '3.9',
    gpaScale: '4.0', location: '北京', highlights: [],
  }],
  workExperience: [{
    company: '字节跳动', companyLatin: 'ByteDance', title: '高级前端工程师',
    department: '增长技术', employmentType: 'fulltime', startDate: '2021-03',
    endDate: '', current: true, location: '北京', industry: '互联网', teamSize: '12',
    reportsTo: '', salaryLabel: '', leaveReason: '寻求更大的技术挑战',
    description: '负责增长中台的前端架构。', highlights: [],
  }, {
    company: '美团', companyLatin: 'Meituan', title: '前端工程师',
    department: '到店事业群', employmentType: 'fulltime', startDate: '2020-07',
    endDate: '2021-02', current: false, location: '北京', industry: '互联网',
    teamSize: '8', reportsTo: '', salaryLabel: '',
    leaveReason: '希望进入更大规模的平台团队',
    description: '负责商家端后台的前端开发。', highlights: [],
  }],
  internships: [{
    company: '腾讯', companyLatin: 'Tencent', title: '前端开发实习生',
    department: 'CDG 广告平台', startDate: '2019-07', endDate: '2019-12',
    ongoing: false, location: '深圳', industry: '互联网', commitment: '每周 5 天',
    description: '参与广告投放后台的组件重构。', highlights: [],
  }, {
    company: '小米', companyLatin: 'Xiaomi', title: '前端实习生',
    department: '互联网服务部', startDate: '2018-07', endDate: '2018-09',
    ongoing: false, location: '北京', industry: '消费电子', commitment: '每周 4 天',
    description: '负责活动落地页开发。', highlights: [],
  }],
  campusExperience: [{
    organization: '清华大学学生科协', role: '技术部部长',
    activity: '校园开发者社区运营', startDate: '2015-09', endDate: '2016-06',
    ongoing: false, awards: '校级优秀学生干部',
    description: '组织每月技术分享。', highlights: [],
  }, {
    organization: 'ACM 校队', role: '队员', activity: '程序设计竞赛',
    startDate: '2014-03', endDate: '2015-06', ongoing: false,
    awards: 'ACM-ICPC 亚洲区银奖', description: '参加区域赛并获奖。', highlights: [],
  }],
  projects: [],
  languages: [{ language: '中文', proficiency: 'native', certification: '', score: '' }],
  skills: { primary: ['TypeScript', 'React'], secondary: [], tools: [], certifications: [] },
  jobPreferences: {
    targetTitles: ['前端工程师'], targetIndustries: [], employmentType: 'fulltime',
    workMode: 'hybrid', preferredLocations: ['北京'], willingToRelocate: true,
    noticePeriod: '一个月', availableFrom: '2026-10-01', expectedSalary: '60',
    expectedSalaryCurrency: 'CNY', salaryPeriod: 'year',
    requiresVisaSponsorship: false, workAuthorization: '中国公民',
  },
  answerTemplates: [
    { key: 'selfIntroduction', label: '自我介绍', answer: '我是一名前端工程师。', locale: 'any', matchHints: [] },
    { key: 'coverLetter', label: '求职信', answer: '尊敬的招聘经理，我希望申请这个岗位。', locale: 'any', matchHints: [] },
    { key: 'whyThisCompany', label: '应聘理由', answer: '贵公司的工程文化很吸引我。', locale: 'any', matchHints: [] },
  ],
  meta: { defaultLocale: 'zh', notes: '' },
};

let context: BrowserContext;
let extensionId: string;
let userDataDir: string;

test.beforeAll(async () => {
  userDataDir = mkdtempSync(resolve(tmpdir(), 'jaf-e2e-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${distPath}`,
      `--load-extension=${distPath}`,
      '--no-first-run',
    ],
  });

  // The extension id comes from the service worker's URL.
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  extensionId = new URL(worker.url()).host;
  expect(extensionId, 'failed to resolve the extension id').toBeTruthy();
});

test.afterAll(async () => {
  await context?.close();
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

/** Opens the panel page and seeds the profile into chrome.storage.local. */
async function openPanel(): Promise<Page> {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`);
  await panel.evaluate(
    (profile) =>
      new Promise<void>((done) => {
        chrome.storage.local.set({ candidateProfile: profile }, () => done());
      }),
    PROFILE,
  );
  await panel.reload();
  await expect(panel.getByRole('heading', { name: 'Job Autofill' })).toBeVisible();
  return panel;
}

/**
 * Opens a fixture in its own tab and installs sentinels that record any attempt
 * to submit. The fixture tab must be the active one when the panel messages the
 * background, so the panel is re-focused explicitly by the caller.
 */
async function openFixture(name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(fixtureUrl(name));
  await page.evaluate(() => {
    const w = window as unknown as { __submitted: string[] };
    w.__submitted = [];
    const proto = HTMLFormElement.prototype;
    const realSubmit = proto.submit;
    proto.submit = function patched(this: HTMLFormElement) {
      w.__submitted.push('submit()');
      // Deliberately do not call through: a navigation would end the test.
      void realSubmit;
    };
    if (proto.requestSubmit) {
      proto.requestSubmit = function patched() { w.__submitted.push('requestSubmit()'); };
    }
    document.addEventListener('submit', (e) => {
      w.__submitted.push('submit-event');
      e.preventDefault();
    }, true);
  });
  return page;
}

/**
 * Runs Detect then Fill from the panel against the currently-open fixture tab.
 * Bringing the fixture to the front first makes the background's
 * resolveTargetTab() pick it, exactly as with a real side panel.
 */
async function detectAndFill(panel: Page, fixture: Page) {
  await fixture.bringToFront();
  await panel.bringToFront();

  await panel.getByRole('button', { name: '检测表单' }).click();
  await expect(panel.getByRole('heading', { name: /检测到的字段/ })).toBeVisible();

  const fillButton = panel.getByRole('button', { name: /填充 \d+ 个字段/ });
  await expect(fillButton).toBeEnabled();
  const label = await fillButton.textContent();
  await fillButton.click();
  await expect(panel.getByText(/已填 \d+ \/ \d+/)).toBeVisible();
  return label ?? '';
}

test('loads the extension with a live service worker', async () => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  const panel = await openPanel();
  await expect(panel.getByRole('button', { name: '检测表单' })).toBeVisible();
  await panel.close();
});

test('detects and fills the English form, and never submits', async () => {
  const panel = await openPanel();
  const fixture = await openFixture('en-generic.html');

  await detectAndFill(panel, fixture);

  await expect(fixture.locator('#em')).toHaveValue('zhangwei@example.com');
  await expect(fixture.locator('#ph')).toHaveValue('13800138000');
  await expect(fixture.locator('#fn')).toHaveValue('Wei');
  await expect(fixture.locator('#ln')).toHaveValue('Zhang');
  await expect(fixture.locator('#sch')).toHaveValue('清华大学');
  await expect(fixture.locator('#maj')).toHaveValue('计算机科学与技术');

  // Sensitive fields stay empty; consent boxes stay unchecked.
  await expect(fixture.locator('#ssn')).toHaveValue('');
  await expect(fixture.locator('#vcode')).toHaveValue('');
  await expect(fixture.locator('#agree')).not.toBeChecked();
  await expect(fixture.locator('#pp')).not.toBeChecked();

  const submitted = await fixture.evaluate(
    () => (window as unknown as { __submitted: string[] }).__submitted,
  );
  expect(submitted, 'the extension must never submit').toEqual([]);

  await fixture.close();
  await panel.close();
});

test('fills the Chinese table-layout form', async () => {
  const panel = await openPanel();
  const fixture = await openFixture('zh-generic.html');

  await detectAndFill(panel, fixture);

  await expect(fixture.locator('[name="xingming"]')).toHaveValue('张伟');
  await expect(fixture.locator('[name="youxiang"]')).toHaveValue('zhangwei@example.com');
  await expect(fixture.locator('[name="shouji"]')).toHaveValue('13800138000');
  await expect(fixture.locator('[name="yuanxiao"]')).toHaveValue('清华大学');
  await expect(fixture.locator('[name="gongsi"]')).toHaveValue('字节跳动');

  // Blocked fields, in Chinese this time.
  await expect(fixture.locator('[name="shenfenzheng"]')).toHaveValue('');
  await expect(fixture.locator('[name="yinhangka"]')).toHaveValue('');
  await expect(fixture.locator('[name="yanzhengma"]')).toHaveValue('');
  await expect(fixture.locator('[name="chengnuo"]')).not.toBeChecked();
  await expect(fixture.locator('[name="yinsi"]')).not.toBeChecked();

  const submitted = await fixture.evaluate(
    () => (window as unknown as { __submitted: string[] }).__submitted,
  );
  expect(submitted).toEqual([]);

  await fixture.close();
  await panel.close();
});

test('fills every entry of every section on a campus recruitment form', async () => {
  const panel = await openPanel();
  const fixture = await openFixture('zh-campus.html');

  await detectAndFill(panel, fixture);

  // 教育经历: two unnumbered <tbody> entries, distinguished only by structure.
  await expect(fixture.locator('[name="school"]').nth(0)).toHaveValue('清华大学');
  await expect(fixture.locator('[name="school"]').nth(1)).toHaveValue('北京大学');
  await expect(fixture.locator('[name="major"]').nth(0)).toHaveValue('计算机科学与技术');
  await expect(fixture.locator('[name="major"]').nth(1)).toHaveValue('软件工程');
  await expect(fixture.locator('[name="degree"]').nth(0)).toHaveValue('bachelor');
  await expect(fixture.locator('[name="degree"]').nth(1)).toHaveValue('master');

  // 实习经历 vs 工作经历: identical 公司名称 labels, told apart by their heading.
  await expect(fixture.locator('[name="intern_1_company"]')).toHaveValue('腾讯');
  await expect(fixture.locator('[name="intern_2_company"]')).toHaveValue('小米');
  await expect(fixture.locator('[name="work[0].company"]')).toHaveValue('字节跳动');
  await expect(fixture.locator('[name="work[1].company"]')).toHaveValue('美团');

  // The internship table must never receive employment data, or vice versa.
  await expect(fixture.locator('[name="intern_1_title"]')).toHaveValue('前端开发实习生');
  await expect(fixture.locator('[name="work[0].title"]')).toHaveValue('高级前端工程师');
  await expect(fixture.locator('[name="work[0].leaveReason"]')).toHaveValue('寻求更大的技术挑战');

  // 校园经历, numbered by bare trailing digits.
  await expect(fixture.locator('[name="org1"]')).toHaveValue('清华大学学生科协');
  await expect(fixture.locator('[name="org2"]')).toHaveValue('ACM 校队');
  await expect(fixture.locator('[name="orgRole1"]')).toHaveValue('技术部部长');
  await expect(fixture.locator('[name="orgAward2"]')).toHaveValue('ACM-ICPC 亚洲区银奖');

  const submitted = await fixture.evaluate(
    () => (window as unknown as { __submitted: string[] }).__submitted,
  );
  expect(submitted).toEqual([]);

  await fixture.close();
  await panel.close();
});

test('fills a component-library form whose labels sit in a sibling column', async () => {
  // The reported failure mode: fields detected, none matched. Every control here
  // lacks an id, its name is an opaque token, and its <label> has no `for`, so
  // the only route to a label is walking up and looking at earlier siblings.
  const panel = await openPanel();
  const fixture = await openFixture('zh-spa-form.html');

  await detectAndFill(panel, fixture);

  await expect(fixture.locator('[name="f_7a2c91"]')).toHaveValue('张伟');
  await expect(fixture.locator('[name="f_3e8b04"]')).toHaveValue('13800138000');
  await expect(fixture.locator('[name="f_c05df7"]')).toHaveValue('zhangwei@example.com');

  // Both cards of each repeating section, drawing from different profile rows.
  await expect(fixture.locator('[name="f_edu_a1"]')).toHaveValue('清华大学');
  await expect(fixture.locator('[name="f_edu_b1"]')).toHaveValue('北京大学');
  await expect(fixture.locator('[name="f_int_a1"]')).toHaveValue('腾讯');
  await expect(fixture.locator('[name="f_int_b1"]')).toHaveValue('小米');
  await expect(fixture.locator('[name="f_wrk_a1"]')).toHaveValue('字节跳动');
  await expect(fixture.locator('[name="f_wrk_b1"]')).toHaveValue('美团');

  // 实习 and 工作 print the same labels; neither may receive the other's data.
  await expect(fixture.locator('[name="f_int_a2"]')).toHaveValue('前端开发实习生');
  await expect(fixture.locator('[name="f_wrk_a2"]')).toHaveValue('高级前端工程师');
  await expect(fixture.locator('[name="f_cam_a1"]')).toHaveValue('清华大学学生科协');

  await expect(fixture.locator('[name="f_agree"]')).not.toBeChecked();

  const submitted = await fixture.evaluate(
    () => (window as unknown as { __submitted: string[] }).__submitted,
  );
  expect(submitted).toEqual([]);

  await fixture.close();
  await panel.close();
});

test('fills a horizontal table whose labels are column headers', async () => {
  // Each cell must take *its own* column's header. Taking the row header instead
  // gives every input in the row the same text, collapsing the table onto one key.
  const panel = await openPanel();
  const fixture = await openFixture('zh-table-columns.html');

  await detectAndFill(panel, fixture);

  await expect(fixture.locator('[name="e_a1"]')).toHaveValue('清华大学');
  await expect(fixture.locator('[name="e_a2"]')).toHaveValue('计算机科学与技术');
  await expect(fixture.locator('[name="e_b1"]')).toHaveValue('北京大学');
  await expect(fixture.locator('[name="w_a1"]')).toHaveValue('字节跳动');
  await expect(fixture.locator('[name="w_a2"]')).toHaveValue('高级前端工程师');
  await expect(fixture.locator('[name="w_a5"]')).toHaveValue('寻求更大的技术挑战');
  await expect(fixture.locator('[name="w_b1"]')).toHaveValue('美团');

  // No profile slot: a referee is a third party, so these stay empty rather than
  // receiving the candidate's own name and phone number.
  await expect(fixture.locator('[name="w_a6"]')).toHaveValue('');
  await expect(fixture.locator('[name="w_a7"]')).toHaveValue('');

  // 培训经历 is a heading we cannot classify, so its 开始时间 must not be filled
  // automatically with a job start date.
  await expect(fixture.locator('[name="t_a3"]')).toHaveValue('');

  await expect(fixture.locator('[name="agree"]')).not.toBeChecked();

  const submitted = await fixture.evaluate(
    () => (window as unknown as { __submitted: string[] }).__submitted,
  );
  expect(submitted).toEqual([]);

  await fixture.close();
  await panel.close();
});

test('fills the Japanese form and keeps 氏名 apart from フリガナ', async () => {
  const panel = await openPanel();
  const fixture = await openFixture('ja-generic.html');

  await detectAndFill(panel, fixture);

  await expect(fixture.locator('#nm')).toHaveValue('张伟');
  await expect(fixture.locator('#kn')).toHaveValue('チョウ イ');
  await expect(fixture.locator('#ml')).toHaveValue('zhangwei@example.com');
  await expect(fixture.locator('#tel')).toHaveValue('13800138000');
  await expect(fixture.locator('#zip')).toHaveValue('100022');
  await expect(fixture.locator('#co')).toHaveValue('字节跳动');

  await expect(fixture.locator('#mn')).toHaveValue('');
  await expect(fixture.locator('#pp')).toHaveValue('');
  await expect(fixture.locator('#ginko')).toHaveValue('');
  await expect(fixture.locator('[name="doui"]')).not.toBeChecked();

  const submitted = await fixture.evaluate(
    () => (window as unknown as { __submitted: string[] }).__submitted,
  );
  expect(submitted).toEqual([]);

  await fixture.close();
  await panel.close();
});

test('commits values into React-style controlled inputs', async () => {
  const panel = await openPanel();
  const fixture = await openFixture('react-like.html');

  await detectAndFill(panel, fixture);

  // The mirror only updates when a non-deduped input event reaches the listener,
  // which is the behaviour clearReactTracker() exists to produce.
  const committed = await fixture.evaluate(() =>
    JSON.parse(document.getElementById('mirror')!.textContent || '{}'),
  );
  expect(committed.email).toBe('zhangwei@example.com');
  expect(committed.fullName).toBe('张伟');
  expect(committed.phone).toBe('13800138000');

  await fixture.close();
  await panel.close();
});

test('blocks every sensitive field and fills only the safe one', async () => {
  const panel = await openPanel();
  const fixture = await openFixture('hostile.html');

  await fixture.bringToFront();
  await panel.bringToFront();
  await panel.getByRole('button', { name: '检测表单' }).click();

  // The blocked section must appear and list the sensitive controls.
  await expect(panel.getByRole('heading', { name: /已拦截/ })).toBeVisible();

  const fillButton = panel.getByRole('button', { name: /填充 \d+ 个字段/ });
  await expect(fillButton).toBeEnabled();
  await fillButton.click();
  await expect(panel.getByText(/已填 \d+ \/ \d+/)).toBeVisible();

  await expect(fixture.locator('#ok-email')).toHaveValue('zhangwei@example.com');

  for (const id of ['#idcard', '#pass', '#bank', '#card', '#cvv', '#sms',
    '#cap', '#otp', '#taxid', '#sig', '#pw']) {
    await expect(fixture.locator(id), `${id} must stay empty`).toHaveValue('');
  }
  for (const id of ['#ag', '#bg', '#dec']) {
    await expect(fixture.locator(id), `${id} must stay unchecked`).not.toBeChecked();
  }

  const submitted = await fixture.evaluate(
    () => (window as unknown as { __submitted: string[] }).__submitted,
  );
  expect(submitted).toEqual([]);

  await fixture.close();
  await panel.close();
});

test('persists the profile through chrome.storage.local', async () => {
  const panel = await openPanel();
  await panel.getByRole('button', { name: '档案设置' }).click();

  const nameInput = panel.locator('.field', { hasText: '姓名' }).locator('input').first();
  await expect(nameInput).toHaveValue('张伟');

  await nameInput.fill('李雷');
  await panel.getByRole('button', { name: '保存档案' }).click();
  await expect(panel.getByRole('button', { name: '已保存' })).toBeVisible();

  // Reload proves it came back from storage, not component state.
  await panel.reload();
  await panel.getByRole('button', { name: '档案设置' }).click();
  const reloaded = panel.locator('.field', { hasText: '姓名' }).locator('input').first();
  await expect(reloaded).toHaveValue('李雷');

  await panel.close();
});


test('routes top-level and cross-origin iframe fields without id collisions', async () => {
  const panel = await openPanel();
  const fixture = await openFixture('embedded.html');
  await detectAndFill(panel, fixture);
  await expect(fixture.locator('#top')).toHaveValue('张伟');
  for (const id of ['same', 'cross']) {
    await expect(fixture.frameLocator(`#${id}`).locator('#em')).toHaveValue('zhangwei@example.com');
    await expect(fixture.frameLocator(`#${id}`).locator('#fn')).toHaveValue('Wei');
    await expect(fixture.frameLocator(`#${id}`).locator('#agree')).not.toBeChecked();
  }
  await fixture.close();
  await panel.close();
});

test('reads labels in nested open shadow roots and commits composed input events', async () => {
  const panel = await openPanel();
  const fixture = await openFixture('shadow.html');
  await detectAndFill(panel, fixture);
  await expect(fixture.locator('input[type=email]')).toHaveValue('zhangwei@example.com');
  await expect(fixture.locator('input[type=tel]')).toHaveValue('13800138000');
  expect(await fixture.evaluate(() => (window as any).committed)).toEqual({
    email: 'zhangwei@example.com', tel: '13800138000',
  });
  await fixture.close();
  await panel.close();
});

test('refuses an old plan after changing the target tab', async () => {
  const panel = await openPanel();
  const fixture = await openFixture('en-generic.html');
  await fixture.bringToFront();
  await panel.bringToFront();
  const detected = await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'RELAY', payload: { type: 'DETECT' } }));
  const fieldId = detected.result.matches.find((m: any) => m.fieldKey === 'contact.email').fieldId;
  const other = await openFixture('en-generic.html');
  await other.bringToFront();
  await panel.bringToFront();
  const response = await panel.evaluate((fieldId) => chrome.runtime.sendMessage({ type: 'RELAY', payload: {
    type: 'FILL', plan: [{fieldId, value: 'wrong@example.com', kind: 'text'}],
  } }), fieldId);
  expect(response.ok).toBe(false);
  await expect(other.locator('#em')).toHaveValue('');
  await other.close();
  await fixture.close();
  await panel.close();
});
