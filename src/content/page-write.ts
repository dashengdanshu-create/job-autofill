/** Commits only the current, marked autofill text control in the page world. */
function isTextControl(node: EventTarget | null): node is HTMLInputElement | HTMLTextAreaElement {
  const el = node as HTMLInputElement | null;
  return !!el && (el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && ['text', 'search', 'email', 'tel', 'url', 'number', 'date', 'month', 'week', 'time', 'datetime-local'].includes(el.type)));
}

export function commitPageText(node: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (!isTextControl(node) || node.disabled || node.readOnly || !node.isConnected) return false;
  const win = node.ownerDocument.defaultView!;
  const value = node.value;
  const tracker = (node as unknown as { _valueTracker?: { setValue(value: string): void } })._valueTracker;
  if (typeof tracker?.setValue === 'function') tracker.setValue(value === '' ? '\u0000' : '');
  node.dispatchEvent(new win.InputEvent('input', { bubbles: true, composed: true,
    inputType: 'insertReplacementText', data: value }));
  node.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
  return node.isConnected && node.value === value;
}

export function settlePageText(node: HTMLInputElement | HTMLTextAreaElement): Promise<boolean> {
  const value = node.value;
  return new Promise((resolve) => setTimeout(() => {
    if (!node.isConnected || node.value !== value) { resolve(false); return; }
    const win = node.ownerDocument.defaultView!;
    let blurred = false;
    let focusedOut = false;
    const onBlur = () => { blurred = true; };
    const onFocusOut = () => { focusedOut = true; };
    node.addEventListener('blur', onBlur);
    node.addEventListener('focusout', onFocusOut);
    try {
      // Actual focus must leave too. Native events may be absent while a side
      // panel owns browser focus; emit only whichever notifications are missing.
      node.blur();
      if (!blurred) node.dispatchEvent(new win.FocusEvent('blur', { composed: true }));
      if (!focusedOut) node.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
      resolve(node.isConnected && node.value === value);
    } catch { resolve(false); }
    finally {
      node.removeEventListener('blur', onBlur);
      node.removeEventListener('focusout', onFocusOut);
    }
  }, 100));
}

const installed = new WeakSet<Document>();
export function installPageWriter(doc: Document): void {
  if (installed.has(doc)) return;
  installed.add(doc);
  doc.addEventListener('jaf-commit-text', (event) => {
    // composedPath retains the original input inside an open Shadow DOM.
    const node = event.composedPath()[0] ?? event.target;
    if (!isTextControl(node)) return;
    const token = node.getAttribute('data-jaf-write');
    if (!token) return;
    const reply = (ok: boolean) => {
      if (node.getAttribute('data-jaf-write') === token)
        node.setAttribute('data-jaf-write-result', `${token}:${ok ? 'ok' : 'failed'}`);
    };
    try {
      if (!commitPageText(node)) { reply(false); return; }
      void settlePageText(node).then(reply, () => reply(false));
    } catch { reply(false); }
  }, true);
}

// The bundle can be injected again when an already-open page is detected.
if (typeof window !== 'undefined') {
  const marker = window as unknown as { __jafPageWriter028?: boolean };
  if (!marker.__jafPageWriter028) {
    marker.__jafPageWriter028 = true;
    installPageWriter(document);
  }
}
