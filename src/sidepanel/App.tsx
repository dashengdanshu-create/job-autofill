/**
 * Side panel. Two views: the detect/fill workflow and the profile editor.
 *
 * The fill plan is assembled here, not in the content script, so that the set
 * of values written is exactly the set the user saw and approved.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  DetectResult,
  DetectedField,
  FieldMatch,
  FillPlanEntry,
  FillResult,
} from '../core/types.ts';
import { SECTION_OF_KEY, isRepeatingKey } from '../core/types.ts';
import { SECTION_LABELS } from '../core/sections.ts';
import {
  enumLabelsFor,
  resolveValue,
  type CandidateProfile,
} from '../core/candidate-profile.ts';
import { BANDS } from '../core/confidence.ts';
import { loadProfile, saveProfile } from '../storage/profile-store.ts';
import { getTargetTab, requestDetect, requestFill, requestHighlight } from './messaging.ts';
import { ProfileEditor } from './ProfileEditor.tsx';

type View = 'workflow' | 'profile';

interface Enriched {
  match: FieldMatch;
  field: DetectedField;
  /** The value that would be written, already mapped to an option where needed. */
  value: string | null;
  sourcePath: string | null;
}

const FIELD_KEY_LABELS: Record<string, string> = {
  'basic.fullName': '姓名', 'basic.firstName': '名', 'basic.lastName': '姓',
  'basic.middleName': '中间名', 'basic.preferredName': '常用名',
  'basic.nameLatin': '英文名/拼音', 'basic.nameKana': 'フリガナ',
  'basic.pronouns': '人称代词', 'basic.gender': '性别', 'basic.birthDate': '出生日期',
  'basic.nationality': '国籍', 'basic.headline': '个人标签', 'basic.summary': '自我评价',
  'contact.email': '邮箱', 'contact.emailAlternate': '备用邮箱', 'contact.phone': '手机号',
  'contact.phoneCountryCode': '国际区号', 'contact.wechat': '微信', 'contact.line': 'LINE',
  'contact.address.line1': '详细地址', 'contact.address.line2': '门牌/建物',
  'contact.address.city': '城市', 'contact.address.state': '省/州',
  'contact.address.postalCode': '邮编', 'contact.address.country': '国家',
  'contact.links.website': '个人网站', 'contact.links.linkedin': 'LinkedIn',
  'contact.links.github': 'GitHub', 'contact.links.portfolio': '作品集',
  'education.school': '学校', 'education.degree': '学历', 'education.major': '专业',
  'education.startDate': '入学时间', 'education.endDate': '毕业时间', 'education.gpa': 'GPA',
  'work.company': '公司', 'work.title': '职位', 'work.department': '部门',
  'work.startDate': '入职时间', 'work.endDate': '离职时间', 'work.location': '工作地点',
  'work.industry': '行业', 'work.leaveReason': '离职原因',
  'work.salaryLabel': '当时薪资', 'work.description': '工作内容',
  'internship.company': '实习公司', 'internship.title': '实习职位',
  'internship.department': '实习部门', 'internship.startDate': '实习开始时间',
  'internship.endDate': '实习结束时间', 'internship.location': '实习地点',
  'internship.description': '实习内容',
  'campus.organization': '社团/组织', 'campus.role': '担任职务',
  'campus.activity': '活动名称', 'campus.startDate': '活动开始时间',
  'campus.endDate': '活动结束时间', 'campus.description': '活动描述',
  'campus.awards': '获奖情况',
  'project.name': '项目名称', 'project.role': '项目角色', 'project.url': '项目链接',
  'project.description': '项目描述',
  'language.language': '语言', 'language.proficiency': '语言水平',
  'skills.primary': '技能', 'skills.certifications': '证书',
  'pref.targetTitle': '期望职位', 'pref.employmentType': '工作类型', 'pref.workMode': '办公方式',
  'pref.preferredLocation': '期望城市', 'pref.willingToRelocate': '愿意搬迁',
  'pref.noticePeriod': '通知期', 'pref.availableFrom': '到岗时间',
  'pref.expectedSalary': '期望薪资', 'pref.requiresVisaSponsorship': '需要签证支持',
  'pref.workAuthorization': '工作许可',
  'answer.coverLetter': '求职信', 'answer.selfIntroduction': '自我介绍',
  'answer.whyThisCompany': '应聘理由', 'answer.strengths': '个人优势',
  'answer.careerGoal': '职业规划',
};

const keyLabel = (key: string | null): string => (key ? FIELD_KEY_LABELS[key] ?? key : '未识别');

/**
 * The profile slot a match points at, including which entry of a repeating
 * section — "工作经历 第2条 · 公司". Showing the entry is the only way the user
 * can catch a multi-entry mis-numbering, which is otherwise invisible: every
 * field looks correctly matched, just wired to the wrong row.
 */
function slotLabel(match: FieldMatch): string {
  const label = keyLabel(match.fieldKey);
  if (!match.fieldKey || !isRepeatingKey(match.fieldKey)) return label;
  const section = SECTION_OF_KEY[match.fieldKey];
  const sectionName = section ? SECTION_LABELS[section] : '';
  return `${sectionName} 第${match.entryIndex + 1}条 · ${label}`;
}

/** Whether the page gave this field any human-readable text at all. */
function hasReadableText(field: DetectedField): boolean {
  return Boolean(
    field.label || field.ariaLabel || field.placeholder || field.legend || field.nearbyText,
  );
}

/**
 * The best display name for a page field.
 *
 * When the page offers no readable text, `name` and `id` are often generated
 * tokens (`f_7a2c91`). Showing one bare looks like a bug; saying it is unnamed
 * and keeping the token as the identifier tells the user what actually happened.
 */
function fieldTitle(field: DetectedField): string {
  if (hasReadableText(field)) {
    return (
      field.label || field.ariaLabel || field.placeholder || field.legend || field.nearbyText
    ).slice(0, 60);
  }
  const token = field.name || field.id;
  return token ? `未命名字段（${token.slice(0, 40)}）` : `未命名字段 ${field.fieldId}`;
}

/**
 * Resolves the concrete string to write. Selects and radio groups need the
 * profile's enum value translated into whichever option label the page uses.
 */
function resolveForField(
  profile: CandidateProfile,
  match: FieldMatch,
  field: DetectedField,
): { value: string | null; sourcePath: string | null } {
  if (!match.fieldKey) return { value: null, sourcePath: null };
  const resolved = resolveValue(profile, match.fieldKey, match.entryIndex);
  if (!resolved) return { value: null, sourcePath: null };

  if (field.options.length > 0) {
    const candidates = enumLabelsFor(match.fieldKey, resolved.value);
    const norm = (s: string) => s.toLowerCase().trim();
    for (const candidate of [resolved.value, ...candidates]) {
      const hit = field.options.find(
        (o) => norm(o.value) === norm(candidate) || norm(o.label) === norm(candidate),
      );
      if (hit) return { value: hit.value || hit.label, sourcePath: resolved.sourcePath };
    }
    const loose = field.options.find((o) =>
      candidates.some((c) => norm(o.label).includes(norm(c)) && norm(c).length > 1),
    );
    if (loose) return { value: loose.value || loose.label, sourcePath: resolved.sourcePath };
    return { value: null, sourcePath: resolved.sourcePath };
  }

  return { value: resolved.value, sourcePath: resolved.sourcePath };
}

export function App() {
  const [view, setView] = useState<View>('workflow');
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<{ url: string; title: string } | null>(null);
  const [detect, setDetect] = useState<DetectResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState('');
  const [fillResults, setFillResults] = useState<Record<string, FillResult>>({});
  const [approved, setApproved] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      setProfile(await loadProfile());
      setTab(await getTargetTab());
    })();
  }, []);

  const enriched = useMemo<Enriched[]>(() => {
    if (!detect || !profile) return [];
    const byId = new Map(detect.fields.map((f) => [f.fieldId, f]));
    return detect.matches.flatMap((match) => {
      const field = byId.get(match.fieldId);
      if (!field) return [];
      const { value, sourcePath } = resolveForField(profile, match, field);
      return [{ match, field, value, sourcePath }];
    });
  }, [detect, profile]);

  const groups = useMemo(() => {
    const auto: Enriched[] = [];
    const review: Enriched[] = [];
    const unmatched: Enriched[] = [];
    const blocked: Enriched[] = [];
    const noValue: Enriched[] = [];
    const manual: Enriched[] = [];

    for (const item of enriched) {
      if (item.match.band === 'blocked') blocked.push(item);
      else if (item.field.manualReason) manual.push(item);
      else if (!item.match.fieldKey || item.match.band === 'skip') unmatched.push(item);
      else if (item.value === null) noValue.push(item);
      else if (item.match.band === 'auto') auto.push(item);
      else review.push(item);
    }
    return { auto, review, unmatched, blocked, noValue, manual };
  }, [enriched]);

  const plan = useMemo<FillPlanEntry[]>(() => {
    const entries: FillPlanEntry[] = [];
    for (const item of groups.auto) {
      if (item.value !== null) {
        entries.push({ fieldId: item.field.fieldId, value: item.value, kind: item.field.kind });
      }
    }
    for (const item of groups.review) {
      if (item.value !== null && approved.has(item.field.fieldId)) {
        entries.push({ fieldId: item.field.fieldId, value: item.value, kind: item.field.kind });
      }
    }
    return entries;
  }, [groups, approved]);

  const onDetect = useCallback(async () => {
    setDetecting(true);
    setError('');
    setFillResults({});
    setApproved(new Set());
    const { result, error: err } = await requestDetect();
    if (err) setError(err);
    else if (result) {
      setDetect(result);
      setTab({ url: result.url, title: result.title });
    }
    setDetecting(false);
  }, []);

  const onFill = useCallback(async () => {
    if (plan.length === 0) return;
    setFilling(true);
    setError('');
    const { results, error: err } = await requestFill(plan);
    if (err) setError(err);
    else if (results) {
      setFillResults(Object.fromEntries(results.map((r) => [r.fieldId, r])));
    }
    setFilling(false);
  }, [plan]);

  const onSaveProfile = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    const stored = await saveProfile(profile);
    setProfile(stored);
    setDirty(false);
    setSaving(false);
  }, [profile]);

  const toggleApproved = (fieldId: string) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  };

  if (!profile) {
    return <div className="app"><p className="hint">正在读取本地档案…</p></div>;
  }

  const filledCount = Object.values(fillResults).filter((r) => r.status === 'filled').length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Job Autofill</h1>
        <nav className="view-switch">
          <button
            type="button"
            className={view === 'workflow' ? 'chip chip-active' : 'chip'}
            onClick={() => setView('workflow')}
          >
            填写
          </button>
          <button
            type="button"
            className={view === 'profile' ? 'chip chip-active' : 'chip'}
            onClick={() => setView('profile')}
          >
            档案设置
          </button>
        </nav>
      </header>

      {view === 'profile' ? (
        <ProfileEditor
          profile={profile}
          onChange={(next) => { setProfile(next); setDirty(true); }}
          onSave={onSaveProfile}
          saving={saving}
          dirty={dirty}
        />
      ) : (
        <div className="workflow">
          <section className="block">
            <h2>当前页面</h2>
            {tab ? (
              <>
                <p className="page-title">{tab.title || '(无标题)'}</p>
                <p className="page-url" title={tab.url}>{tab.url}</p>
                {detect && <p className="hint">适配器：{detect.adapterId}</p>}
              </>
            ) : (
              <p className="hint">还没有获取到页面信息</p>
            )}
            <button type="button" className="btn btn-primary" onClick={onDetect} disabled={detecting || filling}>
              {detecting ? '检测中…' : '检测表单'}
            </button>
            {error && <p className="error" role="alert">{error}</p>}
          </section>

          {detect && (
            <>
              <section className="block">
                <h2>检测到的字段</h2>
                <p className="stat">
                  共 {detect.fields.length} 个字段 ·
                  自动 {groups.auto.length} ·
                  待确认 {groups.review.length} ·
                  未匹配 {groups.unmatched.length} ·
                  需网页选择 {groups.manual.length} ·
                  已拦截 {groups.blocked.length}
                </p>
              </section>

              <section className="block">
                <h2>已匹配字段（≥ {BANDS.AUTO.toFixed(2)}，将自动填写）</h2>
                {groups.auto.length === 0 ? (
                  <p className="hint">没有达到自动填写门槛的字段</p>
                ) : (
                  <ul className="matches">
                    {groups.auto.map((item) => (
                      <MatchRow key={item.field.fieldId} item={item} result={fillResults[item.field.fieldId]} />
                    ))}
                  </ul>
                )}
              </section>

              <section className="block">
                <h2>需人工确认（{BANDS.REVIEW.toFixed(2)} – {(BANDS.AUTO - 0.01).toFixed(2)}）</h2>
                {groups.review.length === 0 ? (
                  <p className="hint">没有需要确认的字段</p>
                ) : (
                  <ul className="matches">
                    {groups.review.map((item) => (
                      <MatchRow
                        key={item.field.fieldId}
                        item={item}
                        result={fillResults[item.field.fieldId]}
                        checkbox={{
                          checked: approved.has(item.field.fieldId),
                          onToggle: () => toggleApproved(item.field.fieldId),
                        }}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {groups.manual.length > 0 && (
                <section className="block">
                  <h2>需在网页中选择（{groups.manual.length}）</h2>
                  <ul className="matches">
                    {groups.manual.map((item) => (
                      <li key={item.field.fieldId} className="match match-muted">
                        <button type="button" className="match-label link"
                          onClick={() => void requestHighlight(item.field.fieldId)}>
                          {fieldTitle(item.field)}
                        </button>
                        <p className="hint">{item.field.manualReason}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {groups.noValue.length > 0 && (
                <section className="block">
                  <h2>档案缺内容（{groups.noValue.length}）</h2>
                  <ul className="matches">
                    {groups.noValue.map((item) => (
                      <li key={item.field.fieldId} className="match match-muted">
                        <div className="match-head">
                          <span className="match-label">{fieldTitle(item.field)}</span>
                          <span className="badge">{slotLabel(item.match)}</span>
                        </div>
                        <p className="hint">
                          {item.field.options.length > 0
                            ? '页面选项里找不到档案中的取值'
                            : '档案中这一项还没填'}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="block">
                <h2>未匹配字段（{groups.unmatched.length}）</h2>
                {groups.unmatched.length === 0 ? (
                  <p className="hint">全部字段都有匹配</p>
                ) : (
                  <ul className="matches">
                    {groups.unmatched.map((item) => (
                      <li key={item.field.fieldId} className="match match-muted">
                        <div className="match-head">
                          <button
                            type="button"
                            className="match-label link"
                            onClick={() => void requestHighlight(item.field.fieldId)}
                          >
                            {fieldTitle(item.field)}
                          </button>
                          <span className="conf conf-low">{item.match.confidence.toFixed(2)}</span>
                        </div>
                        {item.match.fieldKey && (
                          <p className="hint">最接近：{keyLabel(item.match.fieldKey)}（低于门槛，不填写）</p>
                        )}
                        {!hasReadableText(item.field) && (
                          <p className="hint">
                            这个字段在页面上没有可读标签，只有代号，所以无法判断它要填什么。
                            点上面的名字可以高亮定位，然后手动填写。
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {groups.blocked.length > 0 && (
                <section className="block">
                  <h2>已拦截（{groups.blocked.length}）</h2>
                  <p className="hint">这些字段按设计永不自动填写，请你本人处理。</p>
                  <ul className="matches">
                    {groups.blocked.map((item) => (
                      <li key={item.field.fieldId} className="match match-blocked">
                        <div className="match-head">
                          <span className="match-label">{fieldTitle(item.field)}</span>
                          <span className="badge badge-blocked">已拦截</span>
                        </div>
                        <p className="hint">{item.match.blockedReason}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="block block-sticky">
                <button
                  type="button"
                  className="btn btn-fill"
                  onClick={onFill}
                  disabled={detecting || filling || plan.length === 0}
                >
                  {filling ? '逐项填写并检查…' : `填充 ${plan.length} 个字段`}
                </button>
                {Object.keys(fillResults).length > 0 && (
                  <p className="stat">
                    已填 {filledCount} / {Object.keys(fillResults).length}
                  </p>
                )}
                <p className="disclaimer">
                  填写完成仅表示页面暂时保留了内容，不代表网站已保存。请等待本轮检查结束，再自行暂存并核对。
                </p>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MatchRow({
  item, result, checkbox,
}: {
  item: Enriched;
  result?: FillResult;
  checkbox?: { checked: boolean; onToggle(): void };
}) {
  const [open, setOpen] = useState(false);
  const conf = item.match.confidence;
  const confClass = conf >= BANDS.AUTO ? 'conf-high' : conf >= BANDS.REVIEW ? 'conf-mid' : 'conf-low';

  return (
    <li className="match">
      <div className="match-head">
        {checkbox && (
          <input
            type="checkbox"
            checked={checkbox.checked}
            onChange={checkbox.onToggle}
            aria-label={`确认填写 ${fieldTitle(item.field)}`}
          />
        )}
        <button
          type="button"
          className="match-label link"
          onClick={() => void requestHighlight(item.field.fieldId)}
          title="在页面中高亮这个字段"
        >
          {fieldTitle(item.field)}
        </button>
        <span className={`conf ${confClass}`}>{conf.toFixed(2)}</span>
      </div>

      <div className="match-body">
        <span className="badge">{slotLabel(item.match)}</span>
        {item.value !== null && <code className="value">{item.value.slice(0, 60)}</code>}
      </div>

      {result && (
        <p className={result.status === 'filled' ? 'ok' : 'warn'}>
          {result.status === 'filled' ? '已写入并检查（未确认网站保存）' : result.reason ?? result.status}
        </p>
      )}

      <button type="button" className="why" onClick={() => setOpen(!open)}>
        {open ? '收起依据' : '为什么这样匹配？'}
      </button>
      {open && (
        <ul className="evidence">
          {item.match.evidence.map((e, i) => (
            <li key={i}>
              <span className="src">{e.source}</span>
              <span className="ev-value">{e.value.slice(0, 50)}</span>
              {e.note && <span className="note">{e.note}</span>}
            </li>
          ))}
          {item.sourcePath && <li><span className="src">档案来源</span><code>{item.sourcePath}</code></li>}
        </ul>
      )}
    </li>
  );
}
