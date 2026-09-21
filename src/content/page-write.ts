/** Runs only on the verified Beisen site, in the page's JS world. */
export function commitPageText(node: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (node.disabled || node.readOnly || !node.isConnected ||
      (node instanceof HTMLInputElement && !['text', 'email', 'tel', 'url', 'number', 'date', 'month'].includes(node.type))) return false;
  const value = node.value;
  const tracker = (node as unknown as { _valueTracker?: { setValue(value: string): void } })._valueTracker;
  tracker?.setValue(value === '' ? '\u0000' : '');
  node.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true,
    inputType: 'insertReplacementText', data: value }));
  node.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  return node.isConnected && node.value === value;
}

export function settlePageText(node: HTMLInputElement | HTMLTextAreaElement): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => {
    if (!node.isConnected) { resolve(false); return; }
    const win = node.ownerDocument.defaultView!;
    node.dispatchEvent(new win.FocusEvent('blur', { composed: true }));
    node.dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, composed: true }));
    resolve(true);
  }, 100));
}

if (typeof window !== 'undefined' && location.hostname === 'jobs.gdjztech.com') {
  document.addEventListener('jaf-commit-text', (event) => {
    const node = event.target;
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) ||
        !node.hasAttribute('data-jaf-write')) return;
    if (!commitPageText(node)) { node.setAttribute('data-jaf-write-result', 'failed'); return; }
    // Phoenix submits the editor's React state to the form only on blur.
    void settlePageText(node).then((ok) =>
      node.setAttribute('data-jaf-write-result', ok ? 'ok' : 'failed'));
  }, true);
}
