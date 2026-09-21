/**
 * Confidence arithmetic and the fill policy.
 *
 * Thresholds live here alone. Unit tests assert the band edges so that tuning a
 * base score elsewhere cannot silently move a field from "needs review" into
 * "fills automatically".
 */

import type { MatchBand } from './types.ts';

export const BANDS = {
  /** >= this fills without asking. */
  AUTO: 0.9,
  /** >= this may fill, but only after the user ticks it. */
  REVIEW: 0.65,
} as const;

/** Base score per matching stage. Ordered by how much we trust the signal. */
export const BASE_SCORES = {
  adapter: 0.97,
  /** Exact alias hit on visible label text. */
  aliasExact: 0.95,
  /**
   * Exact alias hit on a name/id attribute. Slightly below the visible-label
   * score: when a page labels a field 職種 but names it `job_type`, the human
   * -readable text is the better evidence of intent.
   */
  aliasExactAttr: 0.93,
  semanticHtml: 0.92,
  label: 0.82,
  legend: 0.74,
  nearbyText: 0.7,
  fuzzyCeiling: 0.8,
  fuzzyFloor: 0.55,
} as const;

export const MODIFIERS = {
  /** Two independent sources point at the same key. */
  corroborated: 0.04,
  /**
   * The key's section agrees with the heading the field sits under — e.g. a
   * "公司名称" input beneath an 实习经历 heading matching an internship key.
   * Large enough to break the tie between internship.company and work.company,
   * which are otherwise scored identically by the label alone.
   */
  sectionAgrees: 0.08,
  /** The key belongs to a different section than the heading indicates. */
  sectionConflicts: -0.2,
  /** A rival key scored within AMBIGUITY_WINDOW of the winner. */
  ambiguous: -0.15,
  /** Control type contradicts the key (number input for a name). */
  typeMismatch: -0.1,
  /** Field already holds a value — still fillable, but worth a second look. */
  prefilled: -0.05,
  /**
   * The control's shape cannot express the key's value at all — a dropdown for a
   * key that wants a paragraph. Heavier than typeMismatch: that one says "this
   * looks off", this one says the value could not be written even if correct.
   */
  wrongControlShape: -0.35,
  /** Matched only because a select's options looked right. */
  optionShapeOnly: -0.08,
} as const;

export const AMBIGUITY_WINDOW = 0.05;

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Rounds to 2dp so the UI and tests compare stable numbers. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function applyModifiers(base: number, mods: number[]): number {
  return round2(clamp01(mods.reduce((acc, m) => acc + m, base)));
}

export function bandFor(confidence: number): MatchBand {
  if (confidence >= BANDS.AUTO) return 'auto';
  if (confidence >= BANDS.REVIEW) return 'review';
  return 'skip';
}

/** Maps a fuzzy similarity in [0,1] onto the fuzzy stage's score range. */
export function fuzzyScore(similarity: number): number {
  if (similarity <= 0) return 0;
  const { fuzzyFloor, fuzzyCeiling } = BASE_SCORES;
  return round2(fuzzyFloor + (fuzzyCeiling - fuzzyFloor) * clamp01(similarity));
}

/** The minimum similarity worth reporting at all. Below this we emit nothing. */
export const FUZZY_MIN_SIMILARITY = 0.42;
