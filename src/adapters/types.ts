import type { DetectedField, FieldKey } from '../core/types.ts';

export interface AdapterHit {
  fieldKey: FieldKey;
  /** Defaults to BASE_SCORES.adapter when omitted. Cap at 0.99. */
  score?: number;
  note?: string;
}

/**
 * A site adapter encodes knowledge the generic cascade cannot infer — e.g. a
 * board that names its email field `q_12345`. V0.1 ships only the generic
 * adapter; the registry exists so per-site work can land without touching core.
 */
export interface SiteAdapter {
  id: string;
  /** Hostname suffixes this adapter claims. Empty means fallback/global. */
  hosts: string[];
  /** Return a hit to override the cascade, or null to defer to it. */
  match?(field: DetectedField): AdapterHit | null;
  /** Optional CSS selectors to exclude from detection on this site. */
  ignoreSelectors?: string[];
  /** DOM-specific context for a verified site structure. */
  describe?(element: Element): Partial<Pick<DetectedField,
    'label' | 'sectionKind' | 'sectionLabel' | 'groupId' | 'explicitIndex' | 'manualReason'>>;
}
