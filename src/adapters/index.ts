import type { SiteAdapter } from './types.ts';
import { feishuAdapter } from './feishu.ts';
import { beisenAdapter } from './beisen.ts';
import { genericAdapter } from './generic.ts';

/**
 * Registry, most-specific first. `resolveAdapter` picks the first adapter whose
 * host suffix matches, falling back to generic.
 */
const REGISTRY: SiteAdapter[] = [feishuAdapter, beisenAdapter, genericAdapter];

export function resolveAdapter(url: string): SiteAdapter {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return genericAdapter;
  }
  for (const adapter of REGISTRY) {
    if (adapter.hosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
      return adapter;
    }
  }
  return genericAdapter;
}

export { genericAdapter };
export type { SiteAdapter };
