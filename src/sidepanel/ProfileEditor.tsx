/**
 * Structured editor over CandidateProfile. Flat sections use plain inputs;
 * the repeating sections (education / work / projects / languages / answers) get
 * add-remove list editors so nested arrays never have to be hand-edited as JSON.
 */

import { useState } from 'react';
import {
  EMPTY_ANSWER,
  EMPTY_CAMPUS,
  EMPTY_EDUCATION,
  EMPTY_INTERNSHIP,
  EMPTY_LANGUAGE,
  EMPTY_PROJECT,
  EMPTY_WORK,
  type AnswerTemplate,
  type CampusEntry,
  type CandidateProfile,
  type EducationEntry,
  type InternshipEntry,
  type LanguageEntry,
  type ProjectEntry,
  type WorkEntry,
} from '../core/candidate-profile.ts';
import { exportJson, importJson } from '../storage/profile-store.ts';

interface Props {
  profile: CandidateProfile;
  onChange(next: CandidateProfile): void;
  onSave(): void;
  saving: boolean;
  dirty: boolean;
}

type Section =
  | 'basic' | 'contact' | 'education' | 'work' | 'internship' | 'campus'
  | 'projects' | 'other' | 'io';

const SECTION_LABELS: Record<Section, string> = {
  basic: '基本信息',
  contact: '联系方式',
  education: '教育经历',
  work: '工作经历',
  internship: '实习经历',
  campus: '校园经历',
  projects: '项目经历',
  other: '语言 / 技能 / 求职意向',
  io: '导入导出',
};

/** Comma-separated string ⇄ string[] for list-valued fields. */
const toList = (value: string): string[] =>
  value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
const fromList = (list: string[]): string => list.join(', ');

export function ProfileEditor({ profile, onChange, onSave, saving, dirty }: Props) {
  const [section, setSection] = useState<Section>('basic');
  const [ioMessage, setIoMessage] = useState('');

  const setBasic = <K extends keyof CandidateProfile['basic']>(
    key: K,
    value: CandidateProfile['basic'][K],
  ) => onChange({ ...profile, basic: { ...profile.basic, [key]: value } });

  const setContact = <K extends keyof CandidateProfile['contact']>(
    key: K,
    value: CandidateProfile['contact'][K],
  ) => onChange({ ...profile, contact: { ...profile.contact, [key]: value } });

  const setAddress = <K extends keyof CandidateProfile['contact']['address']>(
    key: K,
    value: string,
  ) =>
    onChange({
      ...profile,
      contact: { ...profile.contact, address: { ...profile.contact.address, [key]: value } },
    });

  const setLinks = <K extends keyof CandidateProfile['contact']['links']>(
    key: K,
    value: CandidateProfile['contact']['links'][K],
  ) =>
    onChange({
      ...profile,
      contact: { ...profile.contact, links: { ...profile.contact.links, [key]: value } },
    });

  const setPref = <K extends keyof CandidateProfile['jobPreferences']>(
    key: K,
    value: CandidateProfile['jobPreferences'][K],
  ) => onChange({ ...profile, jobPreferences: { ...profile.jobPreferences, [key]: value } });

  const setSkills = <K extends keyof CandidateProfile['skills']>(key: K, value: string[]) =>
    onChange({ ...profile, skills: { ...profile.skills, [key]: value } });

  /** Generic list mutators for the repeating sections. */
  function listOps<T>(
    field:
      | 'education' | 'workExperience' | 'internships' | 'campusExperience'
      | 'projects' | 'languages' | 'answerTemplates',
    empty: T,
  ) {
    const items = profile[field] as unknown as T[];
    return {
      items,
      update(index: number, patch: Partial<T>) {
        const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
        onChange({ ...profile, [field]: next } as CandidateProfile);
      },
      add() {
        onChange({ ...profile, [field]: [...items, { ...empty }] } as CandidateProfile);
      },
      remove(index: number) {
        onChange({ ...profile, [field]: items.filter((_, i) => i !== index) } as CandidateProfile);
      },
    };
  }

  const edu = listOps<EducationEntry>('education', EMPTY_EDUCATION);
  const work = listOps<WorkEntry>('workExperience', EMPTY_WORK);
  const internships = listOps<InternshipEntry>('internships', EMPTY_INTERNSHIP);
  const campus = listOps<CampusEntry>('campusExperience', EMPTY_CAMPUS);
  const projects = listOps<ProjectEntry>('projects', EMPTY_PROJECT);
  const languages = listOps<LanguageEntry>('languages', EMPTY_LANGUAGE);
  const answers = listOps<AnswerTemplate>('answerTemplates', EMPTY_ANSWER);

  function handleImport(raw: string) {
    try {
      const report = importJson(raw);
      onChange(report.profile);
      setIoMessage(
        report.redacted.length > 0
          ? `已导入，并移除 ${report.redacted.length} 个敏感字段：${report.redacted.join('、')}`
          : '已导入，记得点击保存',
      );
    } catch (error) {
      setIoMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <div className="editor">
      <nav className="tabs" role="tablist" aria-label="档案分区">
        {(Object.keys(SECTION_LABELS) as Section[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={section === key}
            className={section === key ? 'tab tab-active' : 'tab'}
            onClick={() => setSection(key)}
          >
            {SECTION_LABELS[key]}
          </button>
        ))}
      </nav>

      <div className="editor-body">
        {section === 'basic' && (
          <>
            <Field label="姓名" value={profile.basic.fullName} onChange={(v) => setBasic('fullName', v)} />
            <Row>
              <Field label="名 (First)" value={profile.basic.firstName} onChange={(v) => setBasic('firstName', v)} />
              <Field label="姓 (Last)" value={profile.basic.lastName} onChange={(v) => setBasic('lastName', v)} />
            </Row>
            <Row>
              <Field label="英文名 / 拼音" value={profile.basic.nameLatin} onChange={(v) => setBasic('nameLatin', v)} />
              <Field label="フリガナ" value={profile.basic.nameKana} onChange={(v) => setBasic('nameKana', v)} />
            </Row>
            <Row>
              <Select
                label="性别"
                value={profile.basic.gender}
                onChange={(v) => setBasic('gender', v as CandidateProfile['basic']['gender'])}
                options={[
                  ['', '未填写'], ['male', '男'], ['female', '女'],
                  ['nonbinary', '非二元'], ['undisclosed', '不愿透露'],
                ]}
              />
              <Field label="出生日期" value={profile.basic.birthDate} onChange={(v) => setBasic('birthDate', v)} placeholder="YYYY-MM-DD" />
            </Row>
            <Field label="国籍" value={profile.basic.nationality} onChange={(v) => setBasic('nationality', v)} />
            <Field label="一句话标签" value={profile.basic.headline} onChange={(v) => setBasic('headline', v)} />
            <Field label="自我评价" value={profile.basic.summary} onChange={(v) => setBasic('summary', v)} multiline />
          </>
        )}

        {section === 'contact' && (
          <>
            <Field label="邮箱" value={profile.contact.email} onChange={(v) => setContact('email', v)} type="email" />
            <Row>
              <Field label="国际区号" value={profile.contact.phoneCountryCode} onChange={(v) => setContact('phoneCountryCode', v)} placeholder="+86" />
              <Field label="手机号" value={profile.contact.phone} onChange={(v) => setContact('phone', v)} />
            </Row>
            <Row>
              <Field label="微信" value={profile.contact.wechat} onChange={(v) => setContact('wechat', v)} />
              <Field label="LINE ID" value={profile.contact.line} onChange={(v) => setContact('line', v)} />
            </Row>
            <Field label="详细地址" value={profile.contact.address.line1} onChange={(v) => setAddress('line1', v)} />
            <Row>
              <Field label="城市" value={profile.contact.address.city} onChange={(v) => setAddress('city', v)} />
              <Field label="省 / 州" value={profile.contact.address.state} onChange={(v) => setAddress('state', v)} />
            </Row>
            <Row>
              <Field label="邮编" value={profile.contact.address.postalCode} onChange={(v) => setAddress('postalCode', v)} />
              <Field label="国家" value={profile.contact.address.country} onChange={(v) => setAddress('country', v)} />
            </Row>
            <Field label="个人网站" value={profile.contact.links.website} onChange={(v) => setLinks('website', v)} />
            <Row>
              <Field label="LinkedIn" value={profile.contact.links.linkedin} onChange={(v) => setLinks('linkedin', v)} />
              <Field label="GitHub" value={profile.contact.links.github} onChange={(v) => setLinks('github', v)} />
            </Row>
            <Field label="作品集" value={profile.contact.links.portfolio} onChange={(v) => setLinks('portfolio', v)} />
          </>
        )}

        {section === 'education' && (
          <ListSection title="教育经历" onAdd={edu.add} count={edu.items.length}>
            {edu.items.map((item, i) => (
              <Card key={i} title={item.school || `第 ${i + 1} 条`} onRemove={() => edu.remove(i)}>
                <Field label="学校" value={item.school} onChange={(v) => edu.update(i, { school: v })} />
                <Row>
                  <Select
                    label="学历"
                    value={item.degree}
                    onChange={(v) => edu.update(i, { degree: v as EducationEntry['degree'] })}
                    options={[
                      ['', '未填写'], ['highschool', '高中'], ['associate', '专科'],
                      ['bachelor', '本科'], ['master', '硕士'], ['doctorate', '博士'], ['other', '其他'],
                    ]}
                  />
                  <Field label="专业" value={item.major} onChange={(v) => edu.update(i, { major: v })} />
                </Row>
                <Row>
                  <Field label="入学时间" value={item.startDate} onChange={(v) => edu.update(i, { startDate: v })} placeholder="2018-09" />
                  <Field label="毕业时间" value={item.endDate} onChange={(v) => edu.update(i, { endDate: v })} placeholder="2022-06" />
                </Row>
                <Field label="GPA" value={item.gpa} onChange={(v) => edu.update(i, { gpa: v })} />
              </Card>
            ))}
          </ListSection>
        )}

        {section === 'work' && (
          <ListSection title="工作经历" onAdd={work.add} count={work.items.length}>
            {work.items.map((item, i) => (
              <Card key={i} title={item.company || `第 ${i + 1} 条`} onRemove={() => work.remove(i)}>
                <Field label="公司" value={item.company} onChange={(v) => work.update(i, { company: v })} />
                <Row>
                  <Field label="职位" value={item.title} onChange={(v) => work.update(i, { title: v })} />
                  <Field label="部门" value={item.department} onChange={(v) => work.update(i, { department: v })} />
                </Row>
                <Row>
                  <Select
                    label="工作类型"
                    value={item.employmentType}
                    onChange={(v) => work.update(i, { employmentType: v as WorkEntry['employmentType'] })}
                    options={[
                      ['', '未填写'], ['fulltime', '全职'], ['parttime', '兼职'],
                      ['contract', '合同'], ['internship', '实习'], ['freelance', '自由职业'],
                    ]}
                  />
                  <Field label="团队规模" value={item.teamSize} onChange={(v) => work.update(i, { teamSize: v })} placeholder="12" />
                </Row>
                <Row>
                  <Field label="入职时间" value={item.startDate} onChange={(v) => work.update(i, { startDate: v })} placeholder="2022-07" />
                  <Field label="离职时间" value={item.endDate} onChange={(v) => work.update(i, { endDate: v })} placeholder="留空表示在职" />
                </Row>
                <Row>
                  <Field label="工作地点" value={item.location} onChange={(v) => work.update(i, { location: v })} />
                  <Field label="行业" value={item.industry} onChange={(v) => work.update(i, { industry: v })} />
                </Row>
                <Field label="离职原因" value={item.leaveReason} onChange={(v) => work.update(i, { leaveReason: v })} />
                <Field label="工作内容" value={item.description} onChange={(v) => work.update(i, { description: v })} multiline />
              </Card>
            ))}
          </ListSection>
        )}

        {section === 'internship' && (
          <ListSection title="实习经历" onAdd={internships.add} count={internships.items.length}>
            <p className="hint">
              和工作经历分开填写。很多校招表单会把两者列成独立区块，标签却完全一样
              （都叫「公司名称」），扩展靠所在区块区分。
            </p>
            {internships.items.map((item, i) => (
              <Card key={i} title={item.company || `第 ${i + 1} 条`} onRemove={() => internships.remove(i)}>
                <Field label="实习公司" value={item.company} onChange={(v) => internships.update(i, { company: v })} />
                <Row>
                  <Field label="实习职位" value={item.title} onChange={(v) => internships.update(i, { title: v })} />
                  <Field label="实习部门" value={item.department} onChange={(v) => internships.update(i, { department: v })} />
                </Row>
                <Row>
                  <Field label="开始时间" value={item.startDate} onChange={(v) => internships.update(i, { startDate: v })} placeholder="2019-07" />
                  <Field label="结束时间" value={item.endDate} onChange={(v) => internships.update(i, { endDate: v })} placeholder="留空表示在实习" />
                </Row>
                <Row>
                  <Field label="实习地点" value={item.location} onChange={(v) => internships.update(i, { location: v })} />
                  <Field label="行业" value={item.industry} onChange={(v) => internships.update(i, { industry: v })} />
                </Row>
                <Field label="实习强度" value={item.commitment} onChange={(v) => internships.update(i, { commitment: v })} placeholder="每周 5 天" />
                <Field label="实习内容" value={item.description} onChange={(v) => internships.update(i, { description: v })} multiline />
              </Card>
            ))}
          </ListSection>
        )}

        {section === 'campus' && (
          <ListSection title="校园经历" onAdd={campus.add} count={campus.items.length}>
            <p className="hint">社团、学生组织、竞赛、志愿服务、社会实践都填在这里。</p>
            {campus.items.map((item, i) => (
              <Card key={i} title={item.organization || item.activity || `第 ${i + 1} 条`} onRemove={() => campus.remove(i)}>
                <Field label="社团 / 组织名称" value={item.organization} onChange={(v) => campus.update(i, { organization: v })} />
                <Row>
                  <Field label="担任职务" value={item.role} onChange={(v) => campus.update(i, { role: v })} placeholder="部长 / 队长 / 志愿者" />
                  <Field label="活动名称" value={item.activity} onChange={(v) => campus.update(i, { activity: v })} />
                </Row>
                <Row>
                  <Field label="开始时间" value={item.startDate} onChange={(v) => campus.update(i, { startDate: v })} placeholder="2015-09" />
                  <Field label="结束时间" value={item.endDate} onChange={(v) => campus.update(i, { endDate: v })} placeholder="留空表示进行中" />
                </Row>
                <Field label="获奖情况" value={item.awards} onChange={(v) => campus.update(i, { awards: v })} />
                <Field label="活动描述" value={item.description} onChange={(v) => campus.update(i, { description: v })} multiline />
              </Card>
            ))}
          </ListSection>
        )}

        {section === 'projects' && (
          <ListSection title="项目经历" onAdd={projects.add} count={projects.items.length}>
            {projects.items.map((item, i) => (
              <Card key={i} title={item.name || `第 ${i + 1} 条`} onRemove={() => projects.remove(i)}>
                <Field label="项目名称" value={item.name} onChange={(v) => projects.update(i, { name: v })} />
                <Row>
                  <Field label="担任角色" value={item.role} onChange={(v) => projects.update(i, { role: v })} />
                  <Field label="项目链接" value={item.url} onChange={(v) => projects.update(i, { url: v })} />
                </Row>
                <Field label="项目描述" value={item.description} onChange={(v) => projects.update(i, { description: v })} multiline />
              </Card>
            ))}
          </ListSection>
        )}

        {section === 'other' && (
          <>
            <ListSection title="语言能力" onAdd={languages.add} count={languages.items.length}>
              {languages.items.map((item, i) => (
                <Card key={i} title={item.language || `第 ${i + 1} 条`} onRemove={() => languages.remove(i)}>
                  <Row>
                    <Field label="语言" value={item.language} onChange={(v) => languages.update(i, { language: v })} />
                    <Select
                      label="水平"
                      value={item.proficiency}
                      onChange={(v) => languages.update(i, { proficiency: v as LanguageEntry['proficiency'] })}
                      options={[
                        ['', '未填写'], ['native', '母语'], ['fluent', '流利'],
                        ['professional', '商务'], ['intermediate', '中级'], ['basic', '初级'],
                      ]}
                    />
                  </Row>
                  <Field label="证书 / 分数" value={item.certification} onChange={(v) => languages.update(i, { certification: v })} placeholder="JLPT N1 / IELTS 7.5" />
                </Card>
              ))}
            </ListSection>

            <Field label="核心技能（逗号分隔）" value={fromList(profile.skills.primary)} onChange={(v) => setSkills('primary', toList(v))} multiline />
            <Field label="证书（逗号分隔）" value={fromList(profile.skills.certifications)} onChange={(v) => setSkills('certifications', toList(v))} />

            <h3 className="subhead">求职意向</h3>
            <Field label="期望职位（逗号分隔）" value={fromList(profile.jobPreferences.targetTitles)} onChange={(v) => setPref('targetTitles', toList(v))} />
            <Row>
              <Select
                label="工作类型"
                value={profile.jobPreferences.employmentType}
                onChange={(v) => setPref('employmentType', v as CandidateProfile['jobPreferences']['employmentType'])}
                options={[
                  ['', '未填写'], ['fulltime', '全职'], ['parttime', '兼职'],
                  ['contract', '合同'], ['internship', '实习'], ['freelance', '自由职业'],
                ]}
              />
              <Select
                label="办公方式"
                value={profile.jobPreferences.workMode}
                onChange={(v) => setPref('workMode', v as CandidateProfile['jobPreferences']['workMode'])}
                options={[['', '未填写'], ['onsite', '现场'], ['hybrid', '混合'], ['remote', '远程']]}
              />
            </Row>
            <Field label="期望城市（逗号分隔）" value={fromList(profile.jobPreferences.preferredLocations)} onChange={(v) => setPref('preferredLocations', toList(v))} />
            <Row>
              <Field label="期望薪资" value={profile.jobPreferences.expectedSalary} onChange={(v) => setPref('expectedSalary', v)} />
              <Field label="货币" value={profile.jobPreferences.expectedSalaryCurrency} onChange={(v) => setPref('expectedSalaryCurrency', v)} placeholder="CNY / JPY / USD" />
            </Row>
            <Row>
              <Field label="到岗时间" value={profile.jobPreferences.availableFrom} onChange={(v) => setPref('availableFrom', v)} />
              <Field label="离职通知期" value={profile.jobPreferences.noticePeriod} onChange={(v) => setPref('noticePeriod', v)} placeholder="一个月" />
            </Row>
            <Check label="愿意异地 / 搬迁" checked={profile.jobPreferences.willingToRelocate} onChange={(v) => setPref('willingToRelocate', v)} />
            <Check label="需要签证支持" checked={profile.jobPreferences.requiresVisaSponsorship} onChange={(v) => setPref('requiresVisaSponsorship', v)} />
            <Field label="工作许可说明" value={profile.jobPreferences.workAuthorization} onChange={(v) => setPref('workAuthorization', v)} />

            <ListSection title="常用回答模板" onAdd={answers.add} count={answers.items.length}>
              {answers.items.map((item, i) => (
                <Card key={i} title={item.label || item.key || `第 ${i + 1} 条`} onRemove={() => answers.remove(i)}>
                  <Select
                    label="问题类型"
                    value={item.key}
                    onChange={(v) => answers.update(i, { key: v })}
                    options={[
                      ['', '请选择'],
                      ['selfIntroduction', '自我介绍'],
                      ['coverLetter', '求职信'],
                      ['whyThisCompany', '为什么选择我们'],
                      ['strengths', '个人优势'],
                      ['careerGoal', '职业规划'],
                    ]}
                  />
                  <Field label="回答内容" value={item.answer} onChange={(v) => answers.update(i, { answer: v })} multiline />
                </Card>
              ))}
            </ListSection>
          </>
        )}

        {section === 'io' && (
          <div className="io">
            <p className="hint">
              档案只保存在本机 <code>chrome.storage.local</code>，不会上传。导入时会自动剔除
              身份证、护照、银行卡等敏感字段。
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void navigator.clipboard?.writeText(exportJson(profile));
                setIoMessage('已复制 JSON 到剪贴板');
              }}
            >
              复制档案 JSON
            </button>
            <label className="field">
              <span>粘贴 JSON 导入</span>
              <textarea
                rows={8}
                placeholder='{"schemaVersion":"0.1", ...}'
                onBlur={(e) => {
                  if (e.target.value.trim()) handleImport(e.target.value);
                }}
              />
            </label>
            {ioMessage && <p className="io-msg">{ioMessage}</p>}
          </div>
        )}
      </div>

      <div className="editor-footer">
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving || !dirty}>
          {saving ? '保存中…' : dirty ? '保存档案' : '已保存'}
        </button>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="row">{children}</div>;
}

interface FieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
}

function Field({ label, value, onChange, placeholder, multiline, type = 'text' }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={4} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([val, text]) => (
          <option key={val} value={val}>{text}</option>
        ))}
      </select>
    </label>
  );
}

function Check({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ListSection({
  title, onAdd, count, children,
}: {
  title: string;
  onAdd(): void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="list-section">
      <header>
        <h3 className="subhead">{title}</h3>
        <button type="button" className="btn btn-small" onClick={onAdd}>+ 添加</button>
      </header>
      {count === 0 ? <p className="hint">还没有内容</p> : children}
    </section>
  );
}

function Card({
  title, onRemove, children,
}: {
  title: string;
  onRemove(): void;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <header>
        <strong>{title}</strong>
        <button type="button" className="btn btn-small btn-danger" onClick={onRemove}>删除</button>
      </header>
      {children}
    </div>
  );
}
