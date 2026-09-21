/**
 * Section and ordinal inference — the two V0.2 primitives.
 *
 * These are pure string functions, so they are pinned exactly. The tests that
 * matter most are the negative ones: 实习经历 must NOT classify as work, and a
 * label that merely mentions a year must NOT be read as an ordinal.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SECTION_LABELS, classifySection, parseOrdinal } from '../core/sections.ts';
import { SECTION_OF_KEY, isRepeatingKey } from '../core/types.ts';
import type { SectionKind } from '../core/types.ts';

describe('classifySection: Chinese headings', () => {
  const cases: Array<[string, SectionKind]> = [
    ['教育经历', 'education'],
    ['教育背景', 'education'],
    ['学历信息', 'education'],
    ['工作经历', 'work'],
    ['工作经验', 'work'],
    ['职业经历', 'work'],
    ['实习经历', 'internship'],
    ['实习经验', 'internship'],
    ['校园经历', 'campus'],
    ['课外活动', 'campus'],
    ['社会实践', 'campus'],
    ['社团经历', 'campus'],
    ['项目经历', 'project'],
    ['语言能力', 'language'],
  ];

  for (const [heading, expected] of cases) {
    it(`classifies ${heading} as ${expected}`, () => {
      assert.equal(classifySection(heading), expected);
    });
  }

  it('separates 实习经历 from 工作经历 despite the shared 经历 suffix', () => {
    // The whole reason SECTION_HEADINGS is ordered most-specific-first.
    assert.equal(classifySection('实习经历'), 'internship');
    assert.equal(classifySection('工作经历'), 'work');
    assert.notEqual(classifySection('实习经历'), classifySection('工作经历'));
  });

  it('classifies headings decorated with numbering and punctuation', () => {
    assert.equal(classifySection('三、实习经历（选填）'), 'internship');
    assert.equal(classifySection('2. 工作经历 *'), 'work');
  });
});

describe('classifySection: English and Japanese headings', () => {
  it('classifies English headings', () => {
    assert.equal(classifySection('Work Experience'), 'work');
    assert.equal(classifySection('Employment History'), 'work');
    assert.equal(classifySection('Internship Experience'), 'internship');
    assert.equal(classifySection('Education'), 'education');
    assert.equal(classifySection('Extracurricular Activities'), 'campus');
    assert.equal(classifySection('Projects'), 'project');
  });

  it('classifies Japanese headings', () => {
    assert.equal(classifySection('職歴'), 'work');
    assert.equal(classifySection('インターン経験'), 'internship');
    assert.equal(classifySection('学歴'), 'education');
    assert.equal(classifySection('課外活動'), 'campus');
  });

  it('is case-insensitive for Latin headings', () => {
    assert.equal(classifySection('WORK EXPERIENCE'), 'work');
    assert.equal(classifySection('work experience'), 'work');
  });
});

describe('classifySection: non-headings', () => {
  it('returns unknown for text that names no section', () => {
    for (const text of ['基本信息', '姓名', 'Contact Details', '', '   ', '提交申请']) {
      assert.equal(classifySection(text), 'unknown', text);
    }
  });

  it('does not classify a bare 经历 with no qualifier', () => {
    // Too vague to act on: guessing would send fields to the wrong section.
    assert.equal(classifySection('经历'), 'unknown');
  });
});

describe('parseOrdinal: bracket form is 0-based', () => {
  it('reads the index from a bracketed path', () => {
    assert.equal(parseOrdinal('work[0].company'), 0);
    assert.equal(parseOrdinal('work[1].company'), 1);
    assert.equal(parseOrdinal('education[2].school'), 2);
  });

  it('reads the first index of a nested bracket path', () => {
    assert.equal(parseOrdinal('items[3][name]'), 3);
  });
});

describe('parseOrdinal: delimited and trailing forms are 1-based', () => {
  it('reads underscore-delimited ordinals', () => {
    assert.equal(parseOrdinal('intern_1_company'), 0);
    assert.equal(parseOrdinal('intern_2_company'), 1);
  });

  it('reads dash-delimited ordinals', () => {
    assert.equal(parseOrdinal('education-3-major'), 2);
  });

  it('reads a bare trailing digit', () => {
    assert.equal(parseOrdinal('company2'), 1);
    assert.equal(parseOrdinal('org1'), 0);
    assert.equal(parseOrdinal('orgAward2'), 1);
  });

  it('documents the deliberate split between the two conventions', () => {
    // `foo[1]` is the second entry; `foo_1_` is the first. Both populations are
    // real — JS frameworks index from 0, hand-written server forms label from 1 —
    // and there is no signal that resolves it, so the shape decides.
    assert.equal(parseOrdinal('work[1].company'), 1);
    assert.equal(parseOrdinal('work_1_company'), 0);
  });
});

describe('parseOrdinal: absence and rejection', () => {
  it('returns null when no attribute carries an ordinal', () => {
    assert.equal(parseOrdinal('company'), null);
    assert.equal(parseOrdinal('school', 'eduSchool', ''), null);
    assert.equal(parseOrdinal(''), null);
    assert.equal(parseOrdinal(), null);
  });

  it('tries each attribute in turn and takes the first hit', () => {
    assert.equal(parseOrdinal('', 'company', 'work_2_company'), 1);
  });

  it('rejects implausibly large ordinals', () => {
    // A four-digit run is a year or an id, not a repeat index.
    assert.equal(parseOrdinal('startDate2024'), null);
    assert.equal(parseOrdinal('field_1234_x'), null);
  });

  it('rejects a 1-based zero', () => {
    // `foo_0_` under the 1-based reading would be entry -1; treat it as absent
    // rather than guessing which convention the author meant.
    assert.equal(parseOrdinal('work_0_company'), null);
  });
});

describe('section metadata', () => {
  it('labels every section kind for display', () => {
    const kinds: SectionKind[] = [
      'education', 'work', 'internship', 'campus', 'project', 'language', 'unknown',
    ];
    for (const kind of kinds) {
      assert.equal(typeof SECTION_LABELS[kind], 'string');
      assert.ok(SECTION_LABELS[kind].length > 0, kind);
    }
  });

  it('maps every repeating key to a section and no others', () => {
    assert.equal(isRepeatingKey('work.company'), true);
    assert.equal(isRepeatingKey('internship.company'), true);
    assert.equal(isRepeatingKey('campus.organization'), true);
    assert.equal(isRepeatingKey('education.school'), true);
    // Singular keys have no entry index to assign.
    assert.equal(isRepeatingKey('basic.fullName'), false);
    assert.equal(isRepeatingKey('contact.email'), false);
    assert.equal(isRepeatingKey('pref.targetTitle'), false);
  });

  it('agrees with classifySection about which section each key serves', () => {
    assert.equal(SECTION_OF_KEY['internship.company'], 'internship');
    assert.equal(SECTION_OF_KEY['work.company'], 'work');
    assert.equal(SECTION_OF_KEY['campus.role'], 'campus');
    assert.equal(SECTION_OF_KEY['basic.fullName'], undefined);
  });
});
