import type { SiteAdapter } from './types.ts';

/**
 * The fallback adapter: no site-specific overrides, only universally-safe
 * exclusions. Anything genuinely generic belongs in core/aliases.ts instead, so
 * `match` stays absent here by design.
 */
export const genericAdapter: SiteAdapter = {
  id: 'generic',
  hosts: [],
  ignoreSelectors: [
    // Site search and filter widgets are never part of an application form.
    'input[type="search"]',
    '[role="search"] input',
    'form[role="search"] input',
    // Cookie banners and newsletter signups.
    '[class*="cookie" i] input',
    '[id*="cookie" i] input',
    '[class*="newsletter" i] input',
  ],
};
