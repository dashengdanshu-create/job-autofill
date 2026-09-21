import assert from 'node:assert/strict';
import { it } from 'node:test';
import { loadHtml } from './helpers.ts';
import { detectFields } from '../content/field-detector.ts';
import { matchFields } from '../core/field-matcher.ts';
import { fillFields } from '../content/form-filler.ts';
import { resolveAdapter } from '../adapters/index.ts';
const adapter = resolveAdapter('https://example-employer.jobs.feishu.cn/demo/apply');
function field(id: string, label: string, tag = 'input') {
 return `<div class="atsx-form-item"><div class="atsx-form-item-label"><label for="${id}">${label}</label></div><div class="atsx-form-item-control"><${tag} id="${id}"></${tag}></div></div>`;
}
const entry = (type: string, i: number) => `<div class="resumeEditForm-item resumeEditForm-${type}">${field(`${type}[${i}].company`,'公司名称')}${field(`${type}[${i}].title`,'职位名称')}${field(`${type}[${i}].desc`,'描述','textarea')}</div>`;
const section = (title: string, content: string) => `<div class="createFormSection-container"><div class="createFormSection-left">${title}</div><div class="createFormSection-right">${content}</div></div>`;

it('reuses the same adapter across employer subdomains and excludes lookalike hosts', () => {
 for (const host of ['example-employer.jobs.feishu.cn', 'another-employer.jobs.feishu.cn']) assert.equal(resolveAdapter(`https://${host}/different/apply`).id,'feishu-jobs');
 assert.equal(resolveAdapter('https://jobs.feishu.cn.example.com').id,'generic');
 assert.equal(resolveAdapter('https://example.com').id,'generic');
});
it('separates work/internship descriptions and preserves 0-based repeated entries', () => {
 const doc=loadHtml(section('工作经历',entry('career',0))+section('实习经历',entry('internship',0)+entry('internship',1))+section('项目经历',field('project[0].desc','描述','textarea')+field('project[1].desc','描述','textarea')));
 const fields=detectFields({doc,adapter}); const matches=matchFields(fields,{adapter});
 assert.deepEqual(matches.map(m=>[m.fieldKey,m.entryIndex]),[
 ['work.company',0],['work.title',0],['work.description',0],
 ['internship.company',0],['internship.title',0],['internship.description',0],
 ['internship.company',1],['internship.title',1],['internship.description',1],
 ['project.description',0],['project.description',1]]);
 assert.ok(matches.every(m=>m.band==='auto'));
 const plan=matches.map((m,i)=>({fieldId:m.fieldId,kind:fields[i]!.kind,value:`${m.fieldKey} row ${m.entryIndex}`}));
 assert.ok(fillFields(plan,fields,doc).every(r=>r.status==='filled'));
 assert.equal(doc.getElementById('internship[1].desc')!.textContent,'internship.description row 1');
});
it('keeps education school and major on the correct rows', () => {
 const doc=loadHtml(section('教育经历',[0,1].map(i=>`<div class="resumeEditForm-item">${field(`education[${i}].school`,'学校名称')}${field(`education[${i}].fieldOfStudy`,'专业')}</div>`).join('')));
 const matches=matchFields(detectFields({doc,adapter}),{adapter});
 assert.deepEqual(matches.map(m=>m.entryIndex),[0,0,1,1]);
 assert.deepEqual(matches.map(m=>m.fieldKey),['education.school','education.major','education.school','education.major']);
});
it('uses scoped titles when identifiers are opaque, without learning a global description alias', () => {
 const doc=loadHtml(section('实习经历','<div class="resumeEditForm-item">'+field('opaque','描述','textarea')+'</div>')+section('培训经历',field('other','描述','textarea')));
 const fields=detectFields({doc,adapter});const matches=matchFields(fields,{adapter});
 assert.equal(matches[0]!.fieldKey,'internship.description');assert.equal(matches[0]!.band,'auto');
 assert.notEqual(matches[1]!.band,'auto');
});
it('does not type values into select search inputs or date-picker hidden proxies', () => {
 const doc=loadHtml(section('教育经历','<div class="atsx-form-item"><div class="atsx-form-item-label"><label>学校名称</label></div><div class="atsx-select"><input id="education[0].school"></div></div><input class="atsx-date-picker-period-hidden-input"><div class="resumeEditForm-hiddenField"><input id="formControlChangeFlag"></div>'));
 const fields=detectFields({doc,adapter});assert.equal(fields.length,1);assert.ok(fields[0]!.manualReason);
 assert.equal(fillFields([{fieldId:fields[0]!.fieldId,kind:'text',value:'学校'}],fields,doc)[0]!.status,'skipped');
});

it('excludes no-experience toggles so they cannot consume the company match', () => {
 const doc=loadHtml(section('工作经历','<div class="noExperience-container"><label>没有工作经历<input type="checkbox"></label></div>'+entry('career',0)));
 const fields=detectFields({doc,adapter});
 const matches=matchFields(fields,{adapter});
 assert.equal(fields.length,3);
 assert.ok(matches.every(m=>m.band==='auto'));
 assert.equal(matches[0]!.fieldKey,'work.company');
});
