import assert from 'node:assert/strict';
import { it } from 'node:test';
import { field } from './helpers.ts';

it('aggregates documents, routes each plan precisely, and rejects a changed target tab', async () => {
  let listener: any;
  let activeTab = 7;
  const calls: Array<{ tab: number; message: any; target: any }> = [];
  const injections: any[] = [];
  const api = {
    scripting: { executeScript: async (args: any) => {
      injections.push(args);
      if (args.target.documentIds[0] === 'doc-b') throw new Error('activeTab cannot inject cross-origin');
    } },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(fn: any) { listener = fn; } } },
    action: { onClicked: { addListener() {} } },
    tabs: {
      query: async () => [{ id: activeTab, url: 'https://example.test/apply', title: 'Apply' }],
      sendMessage: async (tab: number, message: any, target: any) => {
        calls.push({ tab, message, target });
        if (message.type === 'DETECT') return { ok: true, result: {
          url: '', title: '', adapterId: 'generic', fields: [field({ fieldId: 'jaf-1' })],
          matches: [{ fieldId: 'jaf-1', fieldKey: 'contact.email' }],
        } };
        if (message.type === 'FILL') return { ok: true, results: message.plan.map((p: any) => ({fieldId: p.fieldId, status: 'filled'})) };
        return { ok: true };
      },
    },
    webNavigation: { getAllFrames: async () => [{ documentId: 'doc-a' }, { documentId: 'doc-b' }] },
  };
  (globalThis as any).chrome = api;
  await import('../background/service-worker.ts');
  const relay = (payload: any): Promise<any> => new Promise((resolve) => listener({ type: 'RELAY', payload }, {}, resolve));
  const detected = await relay({ type: 'DETECT' });
  assert.deepEqual(detected.result.fields.map((f: any) => f.fieldId), ['7:doc-a:jaf-1', '7:doc-b:jaf-1']);
  const plan = detected.result.fields.map((f: any) => ({ fieldId: f.fieldId, kind: 'text', value: 'test@example.com' }));
  const filled = await relay({ type: 'FILL', plan });
  assert.deepEqual(filled.results.map((r: any) => r.fieldId), plan.map((p: any) => p.fieldId));
  assert.deepEqual(calls.filter((c) => c.message.type === 'FILL').map((c) => c.target), [{ documentId: 'doc-a' }, { documentId: 'doc-b' }]);
  assert.ok(calls.filter((c) => c.message.type === 'FILL').every((c) => c.message.plan[0].fieldId === 'jaf-1'));
  assert.deepEqual(injections.map(i => [i.target.documentIds[0], i.world, i.files[0]]),
    [['doc-a', 'MAIN', 'content/page-write.js'], ['doc-b', 'MAIN', 'content/page-write.js']]);
  const before = calls.length;
  activeTab = 8;
  const stale = await relay({ type: 'FILL', plan });
  assert.equal(stale.ok, false);
  assert.equal(calls.length, before);
  delete (globalThis as any).chrome;
});
