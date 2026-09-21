import assert from 'node:assert/strict';
import { it } from 'node:test';
import { loadHtml } from './helpers.ts';
import { commitPageText, settlePageText } from '../content/page-write.ts';
it('rejects readonly controls before committing events', () => {
 const doc=loadHtml('<input readonly>');
 const input=doc.querySelector('input')!;
 input.readOnly=true;
 assert.equal(commitPageText(input),false);
});

it('commits delayed local state on focusout even while sidebar retains browser focus', async () => {
 const doc=loadHtml('<textarea></textarea>');
 const win=doc.defaultView!;
 (win as any).FocusEvent = win.Event;
 const input=doc.querySelector('textarea')!;
 let local=''; let saved='';
 input.addEventListener('input',()=>{ setTimeout(()=>{ local=input.value; },10); });
 doc.addEventListener('focusout',()=>{ saved=local; });
 input.value='实习内容';
 input.dispatchEvent(new win.Event('input'));
 input.dispatchEvent(new win.Event('focusout',{bubbles:true}));
 assert.equal(saved,'');
 assert.equal(await settlePageText(input),true);
 assert.equal(saved,'实习内容');
});
