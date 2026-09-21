/**
 * Content script: the page-side message router.
 *
 * Holds the most recent detect result so a subsequent FILL can (a) resolve
 * fieldIds through the detector registry and (b) re-check guards against the
 * same snapshot the user reviewed.
 */

import type { DetectResult, DetectedField, RuntimeMessage } from '../core/types.ts';
import { matchFields } from '../core/field-matcher.ts';
import { resolveAdapter } from '../adapters/index.ts';
import { detectFields, elementsFor } from './field-detector.ts';
import { fillFieldsSettled } from './form-filler.ts';

let lastSnapshot: DetectedField[] = [];
let filling = false;

function runDetect(): DetectResult {
  const adapter = resolveAdapter(location.href);
  const fields = detectFields({ adapter });
  lastSnapshot = fields;
  const matches = matchFields(fields, { adapter });
  return {
    url: location.href,
    title: document.title,
    adapterId: adapter.id,
    fields,
    matches,
  };
}

const HIGHLIGHT_CLASS = 'jaf-highlight';

function ensureHighlightStyle(root: Document | ShadowRoot): void {
  if (root.getElementById('jaf-highlight-style')) return;
  const style = document.createElement('style');
  style.id = 'jaf-highlight-style';
  style.textContent = `.${HIGHLIGHT_CLASS}{outline:2px solid #2563eb!important;outline-offset:1px!important;transition:outline-color .2s}`;
  if (root === document) document.documentElement.appendChild(style);
  else root.appendChild(style);
}

function highlight(fieldId: string): void {
  for (const el of document.querySelectorAll(`.${HIGHLIGHT_CLASS}`)) {
    el.classList.remove(HIGHLIGHT_CLASS);
  }
  const targets = elementsFor(fieldId);
  const first = targets[0];
  if (!first) return;
  for (const el of targets) {
    ensureHighlightStyle(el.getRootNode() as Document | ShadowRoot);
    el.classList.add(HIGHLIGHT_CLASS);
  }
  first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => {
    for (const el of targets) el.classList.remove(HIGHLIGHT_CLASS);
  }, 2000);
}

if (!(window as unknown as { __jobAutofillReady?: boolean }).__jobAutofillReady) {
chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  try {
    switch (message.type) {
      case 'PING':
        sendResponse({ ok: true, ready: true });
        return false;

      case 'DETECT':
        if (filling) {
          sendResponse({ ok: false, error: '正在填写，请等待本轮完成后再检测' });
          return false;
        }
        sendResponse({ ok: true, result: runDetect() });
        return false;

      case 'FILL': {
        if (filling) {
          sendResponse({ ok: false, error: '正在填写，请勿重复点击' });
          return false;
        }
        filling = true;
        void fillFieldsSettled(message.plan, lastSnapshot).then(
          (results) => sendResponse({ ok: true, results }),
          (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
        ).finally(() => { filling = false; });
        return true;
      }

      case 'HIGHLIGHT':
        highlight(message.fieldId);
        sendResponse({ ok: true });
        return false;

      default:
        sendResponse({ ok: false, error: 'unknown message' });
        return false;
    }
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
});

// Marker the service worker probes to decide whether injection is needed.
(window as unknown as { __jobAutofillReady?: boolean }).__jobAutofillReady = true;

}
