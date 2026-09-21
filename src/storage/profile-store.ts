/**
 * chrome.storage.local persistence for the Candidate Profile.
 *
 * `storage.sync` is deliberately not used — it would replicate the profile
 * through the user's Google account, which contradicts the privacy promise.
 */

import {
  SCHEMA_VERSION,
  createEmptyProfile,
  normalizeProfile,
  type CandidateProfile,
} from '../core/candidate-profile.ts';

const STORAGE_KEY = 'candidateProfile';

/**
 * Keys we refuse to persist even if an imported file contains them. The schema
 * has no home for these, but an import is arbitrary JSON, so strip explicitly.
 */
const FORBIDDEN_KEY_PATTERN =
  /(idcard|id_card|identity|passport|ssn|socialsecurity|social_security|bank|iban|swift|cardnumber|card_number|cvv|cvc|taxid|tax_id|password|secret|token|身份证|护照|银行|税号|密码|マイナンバー|パスポート|銀行)/i;

export interface ImportReport {
  profile: CandidateProfile;
  /** Paths dropped because they matched a forbidden pattern. */
  redacted: string[];
}

/** Recursively removes sensitive keys, recording what was dropped. */
function redact(value: unknown, path: string, dropped: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item, i) => redact(item, `${path}[${i}]`, dropped));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_KEY_PATTERN.test(key)) {
        dropped.push(childPath);
        continue;
      }
      out[key] = redact(child, childPath, dropped);
    }
    return out;
  }
  return value;
}

function storageArea(): chrome.storage.StorageArea | null {
  const area = globalThis.chrome?.storage?.local;
  return area ?? null;
}

export async function loadProfile(): Promise<CandidateProfile> {
  const area = storageArea();
  if (!area) return createEmptyProfile();
  const bag = await area.get(STORAGE_KEY);
  const stored = bag?.[STORAGE_KEY];
  if (!stored) return createEmptyProfile();
  return migrate(stored);
}

export async function saveProfile(profile: CandidateProfile): Promise<CandidateProfile> {
  const area = storageArea();
  const stamped: CandidateProfile = {
    ...normalizeProfile(profile),
    updatedAt: new Date().toISOString(),
  };
  if (area) await area.set({ [STORAGE_KEY]: stamped });
  return stamped;
}

export async function patchProfile(
  patch: (current: CandidateProfile) => CandidateProfile,
): Promise<CandidateProfile> {
  const current = await loadProfile();
  return saveProfile(patch(current));
}

export async function clearProfile(): Promise<void> {
  const area = storageArea();
  if (area) await area.remove(STORAGE_KEY);
}

export function exportJson(profile: CandidateProfile): string {
  return JSON.stringify(profile, null, 2);
}

/**
 * Parses and sanitises untrusted JSON. Throws only on unparseable input; any
 * structural surprises are absorbed by normalizeProfile.
 */
export function importJson(raw: string): ImportReport {
  const parsed: unknown = JSON.parse(raw);
  const dropped: string[] = [];
  const cleaned = redact(parsed, '', dropped);
  return { profile: normalizeProfile(cleaned), redacted: dropped };
}

/** Version migrations. Only 0.1 exists, so this normalises and stamps. */
function migrate(stored: unknown): CandidateProfile {
  const profile = normalizeProfile(stored);
  profile.schemaVersion = SCHEMA_VERSION;
  return profile;
}

export { STORAGE_KEY, FORBIDDEN_KEY_PATTERN };
