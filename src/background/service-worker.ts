/**
 * Service worker: opens the side panel and relays messages to the page.
 *
 * The interesting bit is target-tab resolution. The panel can run either as a
 * real side panel or (in E2E) as an ordinary tab; in the latter case
 * `tabs.query({active:true})` returns the panel itself. Skipping
 * chrome-extension:// URLs keeps both paths on identical logic.
 */

import type { RuntimeMessage, DetectResult, FillResult, FillPlanEntry } from '../core/types.ts';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
});

chrome.action?.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    void chrome.sidePanel?.open?.({ windowId: tab.windowId });
  }
});

const FILLABLE_SCHEME = /^https?:|^file:/;

/** The tab the user is applying on — never the panel's own tab. */
async function resolveTargetTab(): Promise<chrome.tabs.Tab | null> {
  const active = await chrome.tabs.query({ active: true, currentWindow: true });
  const usable = active.filter((t) => t.url && FILLABLE_SCHEME.test(t.url));
  if (usable.length > 0) return usable[0]!;

  // The active tab is the panel-as-tab, or a chrome:// page. Fall back to the
  // most recently accessed http/file tab in this window.
  const all = await chrome.tabs.query({ currentWindow: true });
  const candidates = all
    .filter((t) => t.url && FILLABLE_SCHEME.test(t.url))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return candidates[0] ?? null;
}

/** Address each document explicitly; an unqualified sendMessage only returns
 * one frame's response. Document IDs also prevent filling a replacement frame. */
async function detectTab(tab: chrome.tabs.Tab) {
  const tabId = tab.id!;
  const frames = await chrome.webNavigation.getAllFrames({ tabId }) ?? [];
  const replies = await Promise.all(frames.map(async (frame) => {
    const target = { documentId: frame.documentId };
    try {
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'PING' }, target);
      } catch {
        await chrome.scripting.executeScript({
          target: { tabId, documentIds: [frame.documentId] }, files: ['content/index.js'],
        });
      }
      const response = await chrome.tabs.sendMessage(tabId, { type: 'DETECT' }, target);
      if (!response?.ok || !response.result) return null;
      const result = response.result as DetectResult;
      const qualify = (id: string) => `${tabId}:${frame.documentId}:${id}`;
      return {
        ...result,
        fields: result.fields.map((field) => ({ ...field, fieldId: qualify(field.fieldId) })),
        matches: result.matches.map((match) => ({ ...match, fieldId: qualify(match.fieldId) })),
      };
    } catch {
      // Sandboxed / restricted frames may be inaccessible. Other frames remain usable.
      return null;
    }
  }));
  const results = replies.filter((result): result is DetectResult => result !== null);
  if (!results.length) return { ok: false, error: '无法读取页面，请刷新并检查扩展的网站访问权限' };
  return { ok: true, result: {
    url: tab.url ?? '', title: tab.title ?? '', adapterId: [...new Set(results.map((r) => r.adapterId))].join(', '),
    fields: results.flatMap((r) => r.fields), matches: results.flatMap((r) => r.matches),
  } };
}

function address(fieldId: string, tabId: number) {
  const [ownerTab, documentId, localId, extra] = fieldId.split(':');
  if (ownerTab !== String(tabId) || !documentId || !localId || extra !== undefined) {
    throw new Error('当前页面与检测时不同，请重新检测');
  }
  return { documentId, localId };
}

async function relayToDocuments(tab: chrome.tabs.Tab, payload: RuntimeMessage) {
  const tabId = tab.id!;
  if (payload.type === 'DETECT') return detectTab(tab);
  if (payload.type === 'HIGHLIGHT') {
    const { documentId, localId } = address(payload.fieldId, tabId);
    return chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT', fieldId: localId }, { documentId });
  }
  if (payload.type !== 'FILL') return { ok: true };
  const groups = new Map<string, FillPlanEntry[]>();
  // Validate the whole plan before writing anything.
  for (const entry of payload.plan) {
    const { documentId, localId } = address(entry.fieldId, tabId);
    const group = groups.get(documentId) ?? [];
    group.push({ ...entry, fieldId: localId });
    groups.set(documentId, group);
  }
  const results: FillResult[] = [];
  for (const [documentId, plan] of groups) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'FILL', plan }, { documentId });
      if (!response?.ok) throw new Error('页面没有响应');
      results.push(...(response.results as FillResult[]).map((r) => ({
        ...r, fieldId: `${tabId}:${documentId}:${r.fieldId}`,
      })));
    } catch {
      results.push(...plan.map((entry): FillResult => ({
        fieldId: `${tabId}:${documentId}:${entry.fieldId}`, status: 'failed',
        reason: '嵌入页面已变化或不可访问，请重新检测',
      })));
    }
  }
  return { ok: true, results };
}

interface RelayEnvelope {
  type: 'RELAY';
  payload: RuntimeMessage;
}

type PanelMessage = RelayEnvelope | { type: 'GET_TARGET_TAB' };

chrome.runtime.onMessage.addListener((message: PanelMessage, _sender, sendResponse) => {
  if (message.type !== 'RELAY' && message.type !== 'GET_TARGET_TAB') return false;
  void (async () => {
    try {
      const tab = await resolveTargetTab();
      if (!tab?.id) {
        sendResponse({ ok: false, error: '没有找到可填写的页面标签页' });
        return;
      }

      if (message.type === 'GET_TARGET_TAB') {
        sendResponse({ ok: true, tab: { id: tab.id, url: tab.url ?? '', title: tab.title ?? '' } });
        return;
      }

      const response = await relayToDocuments(tab, message.payload);
      sendResponse(response ?? { ok: false, error: '页面没有响应' });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  // Keep the channel open for the async reply.
  return true;
});
