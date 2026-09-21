/**
 * Alias tables: the vocabulary that maps real-world form labels onto FieldKeys.
 *
 * `exact` entries are compared against normalised whole strings (label text or
 * the joined token form of name/id attributes) and are the strongest signal.
 * `contains` entries are substring probes used against longer label / nearby
 * text. `negative` entries veto a key when present — this is how we stop
 * "公司名称" (company name) from matching basic.fullName just because both
 * contain 名称, and how "紧急联系人姓名" avoids becoming the candidate's name.
 */

import type { FieldKey } from './types.ts';
import { normalizeLabel, tokenizeIdentifier } from './normalize.ts';

export interface AliasEntry {
  exact: string[];
  contains?: string[];
  negative?: string[];
}

export const ALIASES: Partial<Record<FieldKey, AliasEntry>> = {
  'basic.fullName': {
    exact: [
      'name', 'full name', 'your name', 'legal name', 'candidate name', 'applicant name',
      'fullname', 'name in full',
      '姓名', '名字', '真实姓名', '您的姓名', '本人姓名', '中文姓名', '申请人姓名',
      '氏名', 'お名前', '名前', '応募者氏名',
    ],
    contains: ['full name', '姓名', '氏名', 'お名前'],
    negative: [
      'company', 'employer', 'school', 'university', 'project', 'emergency', 'referrer',
      'reference', 'contact person', 'supervisor', 'account', 'bank', 'user name', 'username',
      'file', 'first', 'last', 'middle', 'kana', 'furigana', 'pinyin', 'romaji', 'english name',
      '公司', '单位', '学校', '院校', '项目', '紧急', '推荐人', '联系人', '证明人', '上级',
      '用户名', '英文名', '拼音', '文件',
      '会社', '学校名', '緊急', '推薦', 'フリガナ', 'ふりがな', 'ローマ字',
    ],
  },
  'basic.firstName': {
    exact: [
      'first name', 'firstname', 'given name', 'givenname', 'forename',
      '名', '名字（名）', '名 given name',
      '名 めい', '下の名前',
    ],
    contains: ['first name', 'given name'],
    negative: ['last', 'family', 'sur', 'middle', 'company', 'school'],
  },
  'basic.lastName': {
    exact: [
      'last name', 'lastname', 'family name', 'familyname', 'surname', 'sur name',
      '姓', '姓氏', '姓（姓）',
      '姓 せい', '名字（姓）',
    ],
    contains: ['last name', 'family name', 'surname'],
    negative: ['first', 'given', 'middle', 'company', 'school'],
  },
  'basic.middleName': {
    exact: ['middle name', 'middlename', 'middle initial', '中间名'],
    contains: ['middle name'],
  },
  'basic.preferredName': {
    exact: [
      'preferred name', 'nickname', 'display name', 'goes by', 'what should we call you',
      '昵称', '常用名', '希望被称呼', 'ニックネーム', '通称',
    ],
    contains: ['preferred name', 'nickname', '昵称'],
  },
  'basic.nameLatin': {
    exact: [
      'name in english', 'english name', 'name romanized', 'romanized name', 'name in latin',
      'pinyin', 'name pinyin', 'romaji',
      '英文名', '英文姓名', '姓名拼音', '拼音',
      'ローマ字', 'ローマ字氏名', '英字氏名',
    ],
    contains: ['english name', 'romanized', 'pinyin', '拼音', 'ローマ字'],
  },
  'basic.nameKana': {
    exact: ['furigana', 'kana', 'name kana', 'フリガナ', 'ふりがな', 'カナ氏名', '氏名カナ'],
    contains: ['furigana', 'フリガナ', 'ふりがな', 'カナ'],
  },
  'basic.pronouns': {
    exact: ['pronouns', 'preferred pronouns', '人称代词'],
    contains: ['pronoun'],
  },
  'basic.gender': {
    exact: ['gender', 'sex', '性别', '性別'],
    contains: ['gender', '性别', '性別'],
  },
  'basic.birthDate': {
    exact: [
      'date of birth', 'birth date', 'birthdate', 'birthday', 'dob',
      '出生日期', '生日', '出生年月',
      '生年月日', '誕生日',
    ],
    contains: ['date of birth', 'birth', '出生', '生年月日'],
    negative: ['place', 'city', '地', '場所'],
  },
  'basic.nationality': {
    exact: ['nationality', 'citizenship', 'country of citizenship', '国籍', '國籍'],
    contains: ['nationality', 'citizenship', '国籍'],
  },
  'basic.headline': {
    exact: [
      'headline', 'professional headline', 'title', 'one line bio', 'tagline',
      '个人标签', '一句话介绍', 'キャッチコピー',
    ],
    contains: ['headline'],
    negative: ['job title', 'position', '职位', '職種'],
  },
  'basic.summary': {
    exact: [
      'summary', 'professional summary', 'about you', 'about me', 'bio', 'profile summary',
      '个人简介', '自我评价', '个人总结', '简介',
      '自己紹介', 'プロフィール', '自己pr',
    ],
    contains: ['summary', 'about you', '简介', '自我评价', '自己pr'],
    negative: ['work summary', '工作内容'],
  },

  'contact.email': {
    exact: [
      'email', 'e mail', 'email address', 'e mail address', 'mail', 'contact email',
      '邮箱', '电子邮箱', '邮件', '电子邮件', '常用邮箱', '邮箱地址',
      'メール', 'メールアドレス', 'eメール', '電子メール',
    ],
    contains: ['email', 'e mail', '邮箱', '邮件', 'メールアドレス'],
    negative: ['confirm', 'verify', 'code', 'alternate', 'secondary', 'password',
      '确认', '验证', '备用', '密码', '確認', '認証'],
  },
  'contact.emailAlternate': {
    exact: ['alternate email', 'secondary email', 'backup email', '备用邮箱', '第二邮箱'],
    contains: ['alternate email', 'secondary email', '备用邮箱'],
  },
  'contact.phone': {
    exact: [
      'phone', 'phone number', 'telephone', 'tel', 'mobile', 'mobile number', 'cell',
      'cell phone', 'contact number', 'mobile phone',
      '手机', '手机号', '手机号码', '电话', '联系电话', '电话号码', '手机号（必填）',
      '電話番号', '携帯番号', '携帯電話', '連絡先電話番号', '電話',
    ],
    contains: ['phone', 'mobile', '手机', '电话', '電話', '携帯'],
    negative: [
      'country code', 'area code', 'extension', 'verification', 'code', 'emergency',
      '区号', '国家代码', '验证码', '紧急', '分机',
      '国番号', '認証', '緊急',
    ],
  },
  'contact.phoneCountryCode': {
    exact: ['country code', 'phone country code', 'dial code', '国家代码', '国际区号', '国番号'],
    contains: ['country code', 'dial code', '国际区号'],
  },
  'contact.wechat': {
    exact: ['wechat', 'wechat id', 'weixin', '微信', '微信号', '微信id'],
    contains: ['wechat', '微信'],
  },
  'contact.line': {
    exact: ['line id', 'line', 'lineid', 'line アカウント'],
    contains: ['line id'],
  },
  'contact.address.line1': {
    exact: [
      'address', 'street address', 'address line 1', 'address 1', 'street',
      'current address', 'residential address',
      '地址', '详细地址', '现居地址', '街道地址', '联系地址',
      '住所', '現住所', '住所1',
    ],
    contains: ['street address', 'address line 1', '详细地址', '现居地址', '住所'],
    negative: ['email', 'city', 'state', 'province', 'postal', 'zip', 'country', 'line 2',
      '邮箱', '城市', '省', '邮编', '国家', '都道府県', '市区'],
  },
  'contact.address.line2': {
    exact: ['address line 2', 'address 2', 'apt', 'apartment', 'suite', 'unit',
      '门牌号', '详细门牌', '建物名', '住所2'],
    contains: ['address line 2', 'apartment', 'building', '建物'],
  },
  'contact.address.city': {
    exact: ['city', 'town', 'city town', 'locality', '城市', '所在城市', '市区町村', '市'],
    contains: ['city', '城市', '市区町村'],
    negative: ['preferred', 'desired', 'work', '期望', '意向', '希望'],
  },
  'contact.address.state': {
    exact: [
      'state', 'province', 'region', 'state province', 'prefecture',
      '省', '省份', '州', '省/直辖市',
      '都道府県',
    ],
    contains: ['province', 'prefecture', '省份', '都道府県'],
  },
  'contact.address.postalCode': {
    exact: ['postal code', 'postcode', 'zip', 'zip code', 'post code',
      '邮编', '邮政编码', '郵便番号'],
    contains: ['postal code', 'zip code', '邮政编码', '郵便番号'],
  },
  'contact.address.country': {
    exact: ['country', 'country region', 'country of residence', '国家', '所在国家', '国'],
    contains: ['country', '国家'],
    negative: ['code', 'nationality', 'citizenship', '国籍'],
  },
  'contact.links.website': {
    exact: ['website', 'personal website', 'homepage', 'blog', 'url',
      '个人网站', '个人主页', '博客', 'ウェブサイト', 'ホームページ'],
    contains: ['personal website', 'homepage', '个人主页'],
    negative: ['company', 'linkedin', 'github', 'portfolio', '公司'],
  },
  'contact.links.linkedin': {
    exact: ['linkedin', 'linkedin url', 'linkedin profile', 'linked in', '领英'],
    contains: ['linkedin', '领英'],
  },
  'contact.links.github': {
    exact: ['github', 'github url', 'github profile', 'git hub', 'gitee'],
    contains: ['github'],
  },
  'contact.links.portfolio': {
    exact: ['portfolio', 'portfolio url', 'work samples', 'behance', 'dribbble',
      '作品集', '作品集链接', 'ポートフォリオ'],
    contains: ['portfolio', '作品集', 'ポートフォリオ'],
  },

  'education.school': {
    exact: [
      'school', 'school name', 'university', 'college', 'institution', 'university name',
      'educational institution', 'alma mater',
      '学校', '学校名称', '毕业院校', '院校', '大学', '毕业学校', '最高学历院校',
      '学校名', '出身校', '最終学歴 学校名',
    ],
    contains: ['school name', 'university', '毕业院校', '学校名'],
    negative: ['high school only', 'company', '公司'],
  },
  'education.degree': {
    exact: [
      'degree', 'degree level', 'education level', 'highest degree', 'qualification',
      'level of education', 'highest level of education',
      '学历', '最高学历', '学位', '文化程度', '教育程度',
      '学歴', '最終学歴', '学位',
    ],
    contains: ['degree', 'education level', '学历', '学位', '最終学歴'],
  },
  'education.major': {
    exact: [
      'major', 'field of study', 'course of study', 'discipline', 'major field', 'subject',
      '专业', '所学专业', '专业名称', '主修专业',
      '専攻', '学部学科', '学科',
    ],
    contains: ['major', 'field of study', '专业', '専攻'],
  },
  'education.startDate': {
    exact: ['education start date', 'enrollment date', 'start date school', '入学时间', '入学年月', '入学'],
    contains: ['enrollment', '入学时间', '入学年月'],
  },
  'education.endDate': {
    exact: [
      'graduation date', 'graduation year', 'expected graduation', 'completion date',
      '毕业时间', '毕业年月', '毕业日期', '预计毕业时间',
      '卒業年月', '卒業予定',
    ],
    contains: ['graduation', '毕业时间', '卒業年月'],
  },
  'education.gpa': {
    exact: ['gpa', 'grade point average', 'grades', '绩点', '平均分', '成绩', 'gpa 成績'],
    contains: ['gpa', '绩点'],
  },

  'work.company': {
    exact: [
      'company', 'company name', 'employer', 'employer name', 'current company',
      'most recent employer', 'organization', 'current employer',
      '公司', '公司名称', '单位名称', '现单位', '目前公司', '就职公司', '最近就职公司',
      '会社名', '勤務先', '現在の勤務先', '会社',
    ],
    contains: ['company name', 'employer', '公司名称', '会社名', '勤務先'],
    // "实习公司" belongs to the internship section, not to employment history.
    negative: [
      'school', 'university', 'project', 'intern', 'internship',
      '学校', '项目', '实习', 'インターン',
    ],
  },
  'work.title': {
    exact: [
      'job title', 'title', 'position', 'role', 'current title', 'current position',
      'most recent title', 'occupation', 'job role',
      '职位', '岗位', '职务', '当前职位', '现任职位', '职位名称',
      '職種', '役職', '職位', '現在の職種',
    ],
    contains: ['job title', 'current position', '职位名称', '職種', '役職'],
    negative: [
      'desired', 'preferred', 'applying', 'target', 'intern', 'internship',
      '期望', '意向', '应聘', '希望', '实习', 'インターン',
    ],
  },
  'work.department': {
    exact: ['department', 'team', 'division', '部门', '所属部门', '部署', '所属部署'],
    contains: ['department', '部门', '部署'],
  },
  'work.startDate': {
    exact: ['start date', 'employment start date', 'from', 'date started',
      '入职时间', '开始时间', '入职日期', '入社年月', '開始日'],
    contains: ['employment start', '入职时间', '入社年月'],
    negative: ['education', 'school', '学校', '入学'],
  },
  'work.endDate': {
    exact: ['end date', 'employment end date', 'to', 'date ended', 'last day',
      '离职时间', '结束时间', '离职日期', '退社年月', '終了日'],
    contains: ['employment end', '离职时间', '退社年月'],
  },
  'work.location': {
    exact: [
      'work location', 'job location', 'office location',
      // 所在城市 as a *column of an experience table* means where that job was.
      // The section bias is what keeps it away from the candidate's home city:
      // outside an experience section contact.address.city still wins on its own
      // stronger aliases (城市 / 所在城市 exact).
      '工作地点', '所在地', '工作城市', '所在城市', '勤務地',
    ],
    contains: ['work location', '工作地点', '工作城市', '勤務地'],
    negative: ['preferred', 'desired', '期望', '希望'],
  },
  'work.industry': {
    exact: ['industry', 'sector', 'company industry', '行业', '所属行业', '业界', '業界', '業種'],
    contains: ['industry', '行业', '業種'],
  },
  'work.leaveReason': {
    exact: ['reason for leaving', 'why did you leave', '离职原因', '离职理由', '退職理由'],
    contains: ['reason for leaving', '离职原因', '退職理由'],
  },
  // The salary *at that job* — a history field, distinct from the salary you are
  // asking for next. `pref.expectedSalary` owns the latter, and each vetoes the
  // other's wording, because filling one with the other misstates your position
  // in a negotiation.
  'work.salaryLabel': {
    exact: [
      'salary', 'current salary', 'compensation', 'monthly salary', 'annual salary',
      '月薪', '年薪', '薪资', '薪水', '税前月薪', '税前年薪', '月薪（税前）',
      '税前月薪（元）', '当前薪资', '现薪资', '目前薪资', '薪资待遇',
      '給与', '年収', '現年収', '月給',
    ],
    contains: ['月薪', '年薪', '薪资', '薪水', '年収', '月給', 'current salary'],
    negative: [
      'expected', 'desired', '期望薪资', '期望薪水', '期望月薪', '期望年薪',
      '薪资要求', '希望年収', '希望給与',
    ],
  },
  'work.description': {
    exact: [
      'job description', 'responsibilities', 'duties', 'what did you do',
      'description of duties', 'work description', 'key responsibilities',
      '工作内容', '工作描述', '工作职责', '主要职责', '岗位职责',
      '職務内容', '業務内容', '仕事内容',
    ],
    contains: ['responsibilities', 'job description', '工作内容', '職務内容', '業務内容'],
  },

  'internship.company': {
    exact: [
      'internship company', 'intern company', 'internship employer',
      'internship organization', 'company (internship)',
      '实习公司', '实习单位', '实习公司名称', '实习企业', '实习机构',
      'インターン先', 'インターンシップ先', '実習先',
    ],
    contains: ['internship company', 'intern company', '实习公司', '实习单位', 'インターン先'],
    // Labels that name a current or past *employer* outright: they mean what they
    // say even when they appear inside an 实习经历 block.
    negative: [
      'school', 'university', 'current employer', 'current company',
      '学校', '院校', '现单位', '目前公司', '现任公司', '就职公司',
    ],
  },
  'internship.title': {
    exact: [
      'internship position', 'internship title', 'intern role', 'intern position',
      'internship job title',
      '实习职位', '实习岗位', '实习职务', '实习岗位名称',
      'インターン職種', 'インターン内容',
    ],
    contains: ['internship position', 'internship title', '实习职位', '实习岗位'],
  },
  'internship.department': {
    exact: ['internship department', 'intern team', '实习部门', '实习所属部门'],
    contains: ['internship department', '实习部门'],
  },
  'internship.startDate': {
    exact: [
      'internship start date', 'intern start date',
      '实习开始时间', '实习起始时间', '实习开始日期', '实习入职时间',
      'インターン開始日',
    ],
    contains: ['internship start', '实习开始时间', '实习起始'],
  },
  'internship.endDate': {
    exact: [
      'internship end date', 'intern end date',
      '实习结束时间', '实习截止时间', '实习结束日期', '实习离职时间',
      'インターン終了日',
    ],
    contains: ['internship end', '实习结束时间', '实习截止'],
  },
  'internship.location': {
    exact: ['internship location', '实习地点', '实习城市', 'インターン勤務地'],
    contains: ['internship location', '实习地点'],
  },
  'internship.description': {
    exact: [
      'internship description', 'internship responsibilities', 'what did you do as an intern',
      'internship duties',
      '实习内容', '实习工作内容', '实习描述', '实习职责', '实习经历描述', '实习主要工作',
      'インターン業務内容', 'インターン内容',
    ],
    contains: ['internship description', 'internship responsibilities', '实习内容', '实习职责'],
  },

  'campus.organization': {
    exact: [
      'organization', 'club', 'society', 'student organization', 'student body',
      'campus organization', 'extracurricular organization', 'association',
      '社团', '社团名称', '组织名称', '学生组织', '协会', '社团/组织',
      // Slash-compound labels are common on CN forms; normalizeLabel turns the
      // slash into a space, so the alias has to be written in that folded form.
      '社团 组织名称', '组织 社团名称', '社团 组织',
      'サークル', 'サークル名', '団体名',
    ],
    contains: [
      'student organization', 'campus organization', 'club name',
      '社团名称', '学生组织', '组织名称', 'サークル名',
    ],
    negative: ['company', 'employer', '公司', '单位', '会社'],
  },
  'campus.role': {
    exact: [
      'position held', 'role in organization', 'club role', 'campus role',
      'position in club', 'title held',
      '担任职务', '社团职务', '担任角色', '组织内职务', '任职情况',
      '役職（サークル）', '担当役割',
    ],
    contains: ['position held', 'role in organization', '担任职务', '社团职务'],
  },
  'campus.activity': {
    exact: [
      'campus experience', 'extracurricular activity', 'extracurricular activities',
      'campus activity', 'student activity', 'activity name', 'activities',
      '校园经历', '校内经历', '课外活动', '社会实践', '在校经历', '校园活动',
      '学生活动', '第二课堂',
      '課外活動', '学生生活', 'サークル活動',
    ],
    contains: [
      'campus experience', 'extracurricular', 'campus activity', 'student activity',
      '校园经历', '课外活动', '社会实践', '在校经历', '課外活動',
    ],
  },
  'campus.startDate': {
    exact: ['activity start date', '校园经历开始时间', '活动开始时间', '任职开始时间'],
    contains: ['activity start', '活动开始时间'],
  },
  'campus.endDate': {
    exact: ['activity end date', '校园经历结束时间', '活动结束时间', '任职结束时间'],
    contains: ['activity end', '活动结束时间'],
  },
  'campus.awards': {
    exact: [
      'awards', 'honors', 'honours', 'awards and honors', 'prizes', 'scholarships',
      'achievements', 'recognition',
      '奖项', '获奖情况', '荣誉', '奖励', '获奖经历', '奖学金', '荣誉奖项',
      '受賞', '受賞歴', '表彰',
    ],
    contains: ['awards and honors', 'honors', '获奖情况', '获奖经历', '荣誉奖项', '受賞歴'],
  },
  'campus.description': {
    exact: [
      'activity description', 'describe your involvement', 'what did you do',
      '校园经历描述', '活动描述', '活动内容', '经历描述', '主要工作内容',
      '活動内容', '活動詳細',
    ],
    contains: ['activity description', '活动描述', '活动内容', '活動内容'],
  },

  'project.name': {
    exact: ['project name', 'project title', 'project', '项目名称', '项目', 'プロジェクト名'],
    contains: ['project name', '项目名称', 'プロジェクト名'],
  },
  'project.role': {
    exact: ['project role', 'your role', 'role in project', '项目角色', '担任角色', '项目职责'],
    contains: ['role in project', '项目角色'],
  },
  'project.url': {
    exact: ['project url', 'project link', 'demo url', 'live url', '项目链接', '项目地址'],
    contains: ['project url', 'project link', '项目链接'],
  },
  'project.description': {
    exact: ['project description', 'about the project', '项目描述', '项目介绍', 'プロジェクト内容'],
    contains: ['project description', '项目描述'],
  },

  'language.language': {
    exact: ['language', 'languages', 'language spoken', '语言', '语言能力', '外语', '言語', '語学'],
    contains: ['language', '语言', '言語'],
    negative: ['programming', 'preferred language', 'site language', '编程', '编程语言'],
  },
  'language.proficiency': {
    exact: ['proficiency', 'language level', 'language proficiency', 'fluency',
      '语言水平', '熟练程度', '语言等级', 'レベル', '語学レベル'],
    contains: ['proficiency', 'fluency', '语言水平', '語学レベル'],
  },
  'skills.primary': {
    exact: [
      'skills', 'key skills', 'core skills', 'technical skills', 'skill set', 'expertise',
      'competencies', 'tech stack',
      '技能', '专业技能', '技能标签', '掌握技能', '核心技能',
      'スキル', '保有スキル', '得意分野',
    ],
    contains: ['skills', '技能', 'スキル'],
    negative: ['soft skills only'],
  },
  'skills.certifications': {
    exact: [
      'certifications', 'certificates', 'licenses', 'credentials',
      '证书', '资格证书', '职业资格', '技能证书',
      '資格', '保有資格', '免許',
    ],
    contains: ['certification', 'license', '证书', '資格'],
  },

  'pref.targetTitle': {
    exact: [
      'desired position', 'desired job title', 'position applying for', 'role applying for',
      'target position', 'job applying for', 'preferred position', 'applying for',
      '期望职位', '意向职位', '应聘职位', '目标岗位', '求职意向', '应聘岗位',
      '希望職種', '希望のポジション', '応募職種',
    ],
    contains: ['desired position', 'applying for', '期望职位', '应聘职位', '希望職種'],
  },
  'pref.employmentType': {
    exact: [
      'employment type', 'job type', 'work type', 'contract type', 'employment status',
      '工作类型', '职位类型', '求职类型', '工作性质',
      '雇用形態', '希望雇用形態',
    ],
    contains: ['employment type', 'job type', '工作类型', '雇用形態'],
  },
  'pref.workMode': {
    exact: [
      'work mode', 'work arrangement', 'remote preference', 'work setting',
      'onsite remote hybrid', 'work style',
      '工作方式', '办公方式', '远程意愿',
      '勤務形態', 'リモート希望',
    ],
    contains: ['work arrangement', 'remote preference', '工作方式', '勤務形態'],
  },
  'pref.preferredLocation': {
    exact: [
      'preferred location', 'desired location', 'preferred work location',
      'location preference', 'desired city',
      '期望工作地点', '期望城市', '意向城市', '希望工作地',
      '希望勤務地', '勤務希望地',
    ],
    contains: ['preferred location', 'desired location', '期望工作地', '希望勤務地'],
  },
  'pref.willingToRelocate': {
    exact: [
      'willing to relocate', 'open to relocation', 'relocation', 'can you relocate',
      '是否愿意搬迁', '是否接受异地', '可否外派',
      '転勤可否', '引越し可能',
    ],
    contains: ['relocate', 'relocation', '愿意搬迁', '転勤'],
  },
  'pref.noticePeriod': {
    exact: [
      'notice period', 'how much notice', 'notice required',
      '离职通知期', '到岗时间', '需提前通知',
      '入社可能日まで', '退職までの期間',
    ],
    contains: ['notice period', '通知期'],
  },
  'pref.availableFrom': {
    exact: [
      'available from', 'availability', 'start availability', 'earliest start date',
      'when can you start', 'available start date',
      '可入职时间', '最快到岗时间', '可到岗日期',
      '入社可能日', '就業可能日',
    ],
    contains: ['available from', 'when can you start', '可入职时间', '入社可能日'],
  },
  'pref.expectedSalary': {
    exact: [
      'expected salary', 'salary expectation', 'desired salary', 'salary requirement',
      'compensation expectation', 'expected compensation', 'desired compensation',
      '期望薪资', '期望薪水', '薪资要求', '期望月薪', '期望年薪',
      '希望年収', '希望給与', '希望月給',
    ],
    contains: ['expected salary', 'salary expectation', '期望薪', '希望年収', '希望給与'],
    negative: ['current salary', '当前薪资', '现薪资', '現年収'],
  },
  'pref.requiresVisaSponsorship': {
    exact: [
      'require visa sponsorship', 'need sponsorship', 'visa sponsorship',
      'do you require sponsorship', 'sponsorship required',
      '是否需要签证支持', '需要工作签证',
      'ビザサポート', '就労ビザ',
    ],
    contains: ['sponsorship', '签证支持', 'ビザ'],
  },
  'pref.workAuthorization': {
    exact: [
      'work authorization', 'work permit', 'right to work', 'eligible to work',
      'authorized to work', 'work eligibility',
      '工作许可', '工作资格', '就业资格',
      '就労資格', '在留資格',
    ],
    contains: ['work authorization', 'right to work', '工作许可', '就労資格'],
  },

  'answer.coverLetter': {
    exact: [
      'cover letter', 'covering letter', 'letter of interest', 'motivation letter',
      '求职信', '自荐信', 'カバーレター', '志望動機書',
    ],
    contains: ['cover letter', '求职信', 'カバーレター'],
  },
  'answer.selfIntroduction': {
    exact: [
      'self introduction', 'introduce yourself', 'tell us about yourself',
      'personal statement',
      '自我介绍', '个人陈述', '请介绍一下自己',
      '自己紹介', '自己pr',
    ],
    contains: ['introduce yourself', 'tell us about yourself', '自我介绍', '自己紹介'],
  },
  'answer.whyThisCompany': {
    exact: [
      'why do you want to work here', 'why this company', 'why us',
      'why are you interested in this role', 'motivation',
      '为什么选择我们', '应聘理由', '为何加入我们',
      '志望動機', '当社を志望した理由',
    ],
    contains: ['why this company', 'why do you want to work', '应聘理由', '志望動機'],
  },
  'answer.strengths': {
    exact: [
      'strengths', 'your strengths', 'greatest strength', 'strengths and weaknesses',
      '优势', '个人优势', '你的优点', '長所', '強み',
    ],
    contains: ['strength', '个人优势', '長所', '強み'],
  },
  'answer.careerGoal': {
    exact: [
      'career goal', 'career goals', 'career plan', 'where do you see yourself',
      'long term goals', 'career objective',
      '职业规划', 'career 规划', '职业目标', '未来规划',
      'キャリアプラン', '将来の目標',
    ],
    contains: ['career goal', 'career plan', '职业规划', 'キャリアプラン'],
  },
};

/**
 * `autocomplete` token → FieldKey. These are authoritative when present: a site
 * that bothers to write autocomplete="postal-code" means it.
 */
export const AUTOCOMPLETE_MAP: Record<string, FieldKey> = {
  name: 'basic.fullName',
  'given-name': 'basic.firstName',
  'family-name': 'basic.lastName',
  'additional-name': 'basic.middleName',
  nickname: 'basic.preferredName',
  email: 'contact.email',
  tel: 'contact.phone',
  'tel-national': 'contact.phone',
  'tel-country-code': 'contact.phoneCountryCode',
  bday: 'basic.birthDate',
  sex: 'basic.gender',
  url: 'contact.links.website',
  'street-address': 'contact.address.line1',
  'address-line1': 'contact.address.line1',
  'address-line2': 'contact.address.line2',
  'address-level2': 'contact.address.city',
  'address-level1': 'contact.address.state',
  'postal-code': 'contact.address.postalCode',
  country: 'contact.address.country',
  'country-name': 'contact.address.country',
  organization: 'work.company',
  'organization-title': 'work.title',
};

/** `<input type>` → FieldKey, only for types that imply a single meaning. */
export const INPUT_TYPE_MAP: Record<string, FieldKey> = {
  email: 'contact.email',
  tel: 'contact.phone',
  url: 'contact.links.website',
};

/** Keys whose value is a yes/no answer — used to shape checkbox handling. */
export const BOOLEAN_KEYS: ReadonlySet<FieldKey> = new Set<FieldKey>([
  'pref.willingToRelocate',
  'pref.requiresVisaSponsorship',
]);

/** Keys that expect a long free-text answer, so a textarea is corroborating. */
export const LONG_TEXT_KEYS: ReadonlySet<FieldKey> = new Set<FieldKey>([
  'basic.summary',
  'work.description',
  'project.description',
  'answer.coverLetter',
  'answer.selfIntroduction',
  'answer.whyThisCompany',
  'answer.strengths',
  'answer.careerGoal',
]);

/** Keys that expect a date-ish value. */
export const DATE_KEYS: ReadonlySet<FieldKey> = new Set<FieldKey>([
  'basic.birthDate',
  'education.startDate',
  'education.endDate',
  'work.startDate',
  'work.endDate',
  'pref.availableFrom',
]);

const aliasIndex = new Map<string, FieldKey[]>();
for (const [key, entry] of Object.entries(ALIASES) as [FieldKey, AliasEntry][]) {
  for (const alias of entry.exact) {
    const norm = normalizeLabel(alias);
    if (!norm) continue;
    const bucket = aliasIndex.get(norm);
    if (bucket) bucket.push(key);
    else aliasIndex.set(norm, [key]);
  }
}

/** Every key whose `exact` list contains this normalised string. */
export function lookupExact(text: string): FieldKey[] {
  return aliasIndex.get(normalizeLabel(text)) ?? [];
}

/** Same, but for an identifier like `candidate_first_name`. */
export function lookupIdentifier(identifier: string): FieldKey[] {
  const joined = tokenizeIdentifier(identifier).join(' ');
  return joined ? aliasIndex.get(joined) ?? [] : [];
}

export function isVetoed(key: FieldKey, haystack: string): boolean {
  const negatives = ALIASES[key]?.negative;
  if (!negatives?.length) return false;
  const norm = normalizeLabel(haystack);
  if (!norm) return false;
  return negatives.some((needle) => norm.includes(normalizeLabel(needle)));
}

/**
 * Whether an alias is specific enough to be used as a *substring* probe.
 *
 * Short generic words are fine as whole-label aliases but disastrous as
 * substrings: `role` would match "How did you hear about this role?", and `to`
 * would match almost anything. Multi-word Latin phrases and CJK strings carry
 * enough signal; bare short Latin words do not.
 */
function isProbeworthy(needle: string): boolean {
  if (!needle) return false;
  if (/[぀-ヿ一-鿿]/.test(needle)) return needle.length >= 2;
  if (needle.includes(' ')) return true;
  return needle.length >= 5;
}

export function containsAlias(key: FieldKey, haystack: string): string | null {
  const entry = ALIASES[key];
  if (!entry) return null;
  const norm = normalizeLabel(haystack);
  if (!norm) return null;
  const probes = [...(entry.contains ?? []), ...entry.exact];
  for (const probe of probes) {
    const needle = normalizeLabel(probe);
    if (isProbeworthy(needle) && norm.includes(needle)) return probe;
  }
  return null;
}

export const ALL_FIELD_KEYS = Object.keys(ALIASES) as FieldKey[];
