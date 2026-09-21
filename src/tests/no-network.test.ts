/**
 * Privacy lint. Asserts the built bundle cannot phone home and the manifest
 * grants no permission that would let it.
 *
 * Run against dist/, so it catches a dependency that reaches the network as
 * well as first-party code. Requires `npm run build` first.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'dist');
const src = resolve(root, 'src');

function walk(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (full.endsWith(ext)) out.push(full);
  }
  return out;
}

const distBundles = walk(dist, '.js');
const buildRan = distBundles.length > 0;

describe('privacy: built bundle', () => {
  it('has been built (run npm run build first)', () => {
    assert.ok(buildRan, 'dist/ has no .js files — run `npm run build`');
  });

  it('contains no network call sites', () => {
    // Matches the call, not the mere mention: `fetch(`, `new WebSocket(`, etc.
    const forbidden = [
      /\bfetch\s*\(/,
      /new\s+WebSocket\s*\(/,
      /new\s+XMLHttpRequest\s*\(/,
      /new\s+EventSource\s*\(/,
      /navigator\s*\.\s*sendBeacon\s*\(/,
      /\bimportScripts\s*\(/,
    ];
    const offenders: string[] = [];
    for (const file of distBundles) {
      const code = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        if (pattern.test(code)) offenders.push(`${file.replace(root, '.')}: ${pattern}`);
      }
    }
    assert.deepEqual(offenders, [], `network call sites found:\n${offenders.join('\n')}`);
  });

  it('embeds no remote origins', () => {
    // Any absolute http(s) URL in shipped code is a potential exfil target.
    // Allowlisted entries are documentation strings and non-resolvable markers,
    // each verified to appear only inside a string literal — never as the
    // argument of a call. Adding to this list requires the same check.
    const allowed = [
      /job-autofill\.local/,   // the schema's $id
      /json-schema\.org/,      // the schema's $schema
      /www\.w3\.org/,          // SVG/XML namespace declarations
      /reactjs\.org/,          // React's invariant error-message links
      /react\.dev/,            // ditto, newer React builds
    ];
    const offenders: string[] = [];
    for (const file of distBundles) {
      const code = readFileSync(file, 'utf8');
      for (const match of code.matchAll(/https?:\/\/[\w.-]+/g)) {
        const url = match[0];
        if (allowed.some((re) => re.test(url))) continue;
        offenders.push(`${file.replace(root, '.')}: ${url}`);
      }
    }
    assert.deepEqual(offenders, [], `remote origins found:\n${offenders.join('\n')}`);
  });

  it('never uses chrome.storage.sync (that would leave the device)', () => {
    for (const file of distBundles) {
      const code = readFileSync(file, 'utf8');
      assert.ok(!/storage\s*\.\s*sync/.test(code), `${file} references storage.sync`);
    }
  });
});

describe('privacy: source', () => {
  const sources = walk(src, '.ts').concat(walk(src, '.tsx'))
    .filter((f) => !f.includes('/tests/'));

  it('has no network call sites in first-party source', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const code = readFileSync(file, 'utf8');
      for (const pattern of [/\bfetch\s*\(/, /new\s+WebSocket\s*\(/, /new\s+XMLHttpRequest\s*\(/]) {
        if (pattern.test(code)) offenders.push(`${file.replace(root, '.')}: ${pattern}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe('privacy: manifest', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(src, 'manifest.json'), 'utf8'),
  ) as {
    permissions?: string[];
    host_permissions?: string[];
    optional_host_permissions?: string[];
    externally_connectable?: unknown;
    content_security_policy?: { extension_pages?: string };
    manifest_version: number;
  };

  it('is manifest v3', () => {
    assert.equal(manifest.manifest_version, 3);
  });

  it('declares no host_permissions', () => {
    assert.equal(manifest.host_permissions, undefined);
    assert.equal(manifest.optional_host_permissions, undefined);
  });

  it('requests no permission that enables data exfiltration', () => {
    const banned = ['webRequest', 'webRequestBlocking', 'proxy', 'cookies',
      'history', 'bookmarks', 'downloads', 'clipboardRead', 'debugger',
      'nativeMessaging', 'identity'];
    for (const permission of manifest.permissions ?? []) {
      assert.ok(!banned.includes(permission), `unexpected permission: ${permission}`);
    }
  });

  it('requests only the permissions the feature set needs', () => {
    assert.deepEqual(
      [...(manifest.permissions ?? [])].sort(),
      ['activeTab', 'scripting', 'sidePanel', 'storage', 'tabs', 'webNavigation'],
    );
  });

  it('is not externally connectable', () => {
    assert.equal(manifest.externally_connectable, undefined);
  });

  it('pins a CSP that forbids outbound connections', () => {
    const csp = manifest.content_security_policy?.extension_pages ?? '';
    assert.match(csp, /connect-src 'none'/);
    assert.match(csp, /script-src 'self'/);
  });
});
