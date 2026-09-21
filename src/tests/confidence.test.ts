import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AMBIGUITY_WINDOW,
  BANDS,
  BASE_SCORES,
  MODIFIERS,
  applyModifiers,
  bandFor,
  clamp01,
  fuzzyScore,
  round2,
} from '../core/confidence.ts';

describe('confidence: policy bands', () => {
  it('pins the documented thresholds', () => {
    assert.equal(BANDS.AUTO, 0.9);
    assert.equal(BANDS.REVIEW, 0.65);
  });

  it('bands the edges exactly as specified', () => {
    assert.equal(bandFor(1), 'auto');
    assert.equal(bandFor(0.9), 'auto', '0.90 must auto-fill');
    assert.equal(bandFor(0.8999), 'review', 'just under 0.90 must need review');
    assert.equal(bandFor(0.89), 'review');
    assert.equal(bandFor(0.65), 'review', '0.65 must be reviewable');
    assert.equal(bandFor(0.6499), 'skip', 'just under 0.65 must be skipped');
    assert.equal(bandFor(0), 'skip');
  });

  it('keeps every base score inside [0,1]', () => {
    for (const [name, score] of Object.entries(BASE_SCORES)) {
      assert.ok(score >= 0 && score <= 1, `${name} out of range: ${score}`);
    }
  });

  it('orders stage scores by trustworthiness', () => {
    assert.ok(BASE_SCORES.adapter > BASE_SCORES.aliasExact);
    assert.ok(BASE_SCORES.aliasExact > BASE_SCORES.aliasExactAttr);
    assert.ok(BASE_SCORES.aliasExactAttr > BASE_SCORES.semanticHtml);
    assert.ok(BASE_SCORES.semanticHtml > BASE_SCORES.label);
    assert.ok(BASE_SCORES.label > BASE_SCORES.legend);
    assert.ok(BASE_SCORES.legend > BASE_SCORES.nearbyText);
    assert.ok(BASE_SCORES.fuzzyCeiling > BASE_SCORES.fuzzyFloor);
  });

  it('places the three strongest stages at or above the auto threshold', () => {
    assert.ok(BASE_SCORES.aliasExact >= BANDS.AUTO);
    assert.ok(BASE_SCORES.aliasExactAttr >= BANDS.AUTO);
    assert.ok(BASE_SCORES.semanticHtml >= BANDS.AUTO);
  });

  it('keeps label-only evidence below auto so it needs review', () => {
    assert.ok(BASE_SCORES.label < BANDS.AUTO);
    assert.ok(BASE_SCORES.label >= BANDS.REVIEW);
  });
});

describe('confidence: arithmetic', () => {
  it('clamps out-of-range and NaN inputs', () => {
    assert.equal(clamp01(1.7), 1);
    assert.equal(clamp01(-0.4), 0);
    assert.equal(clamp01(Number.NaN), 0);
  });

  it('rounds to two decimals', () => {
    assert.equal(round2(0.8249999), 0.82);
    assert.equal(round2(0.825001), 0.83);
  });

  it('adds corroboration and subtracts ambiguity', () => {
    assert.equal(applyModifiers(0.82, [MODIFIERS.corroborated]), 0.86);
    assert.equal(applyModifiers(0.95, [MODIFIERS.ambiguous]), 0.8);
  });

  it('never escapes [0,1] after modifiers', () => {
    assert.equal(applyModifiers(0.99, [MODIFIERS.corroborated, MODIFIERS.corroborated]), 1);
    assert.equal(applyModifiers(0.1, [MODIFIERS.ambiguous, MODIFIERS.typeMismatch]), 0);
  });

  it('drops an ambiguous exact-alias hit out of the auto band', () => {
    const score = applyModifiers(BASE_SCORES.aliasExact, [MODIFIERS.ambiguous]);
    assert.equal(bandFor(score), 'review', 'ambiguity must prevent silent auto-fill');
  });

  it('uses a sane ambiguity window', () => {
    assert.ok(AMBIGUITY_WINDOW > 0 && AMBIGUITY_WINDOW < 0.2);
  });
});

describe('confidence: fuzzy mapping', () => {
  it('maps similarity into the fuzzy band', () => {
    assert.equal(fuzzyScore(0), 0);
    assert.equal(fuzzyScore(1), BASE_SCORES.fuzzyCeiling);
    const mid = fuzzyScore(0.5);
    assert.ok(mid > BASE_SCORES.fuzzyFloor && mid < BASE_SCORES.fuzzyCeiling);
  });

  it('never lets a fuzzy match auto-fill on its own', () => {
    assert.ok(fuzzyScore(1) < BANDS.AUTO, 'fuzzy alone must never reach auto');
  });

  it('is monotonic in similarity', () => {
    let previous = -1;
    for (const sim of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const score = fuzzyScore(sim);
      assert.ok(score >= previous, `not monotonic at ${sim}`);
      previous = score;
    }
  });
});
