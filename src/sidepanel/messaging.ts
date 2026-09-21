import type { DetectResult, FillPlanEntry, FillResult, RuntimeMessage } from '../core/types.ts';

interface Envelope<T> {
  ok: boolean;
  error?: string;
  result?: T;
  results?: T;
  tab?: { id: number; url: string; title: string };
}

async function relay<T>(payload: RuntimeMessage): Promise<Envelope<T>> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'RELAY', payload });
    return (response ?? { ok: false, error: '后台没有响应' }) as Envelope<T>;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getTargetTab(): Promise<{ url: string; title: string } | null> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_TARGET_TAB' });
    if (response?.ok && response.tab) return { url: response.tab.url, title: response.tab.title };
  } catch {
    // Panel opened outside a browser window — fall through.
  }
  return null;
}

export async function requestDetect(): Promise<{ result?: DetectResult; error?: string }> {
  const response = await relay<DetectResult>({ type: 'DETECT' });
  if (!response.ok) return { error: response.error ?? '检测失败' };
  return { result: response.result };
}

export async function requestFill(
  plan: FillPlanEntry[],
): Promise<{ results?: FillResult[]; error?: string }> {
  const response = await relay<FillResult[]>({ type: 'FILL', plan });
  if (!response.ok) return { error: response.error ?? '填充失败' };
  return { results: response.results };
}

export async function requestHighlight(fieldId: string): Promise<void> {
  await relay({ type: 'HIGHLIGHT', fieldId });
}
