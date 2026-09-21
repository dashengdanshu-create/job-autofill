/**
 * Text normalisation shared by the alias tables and the fuzzy scorer.
 *
 * CJK text has no spaces, so tokenisation cannot be whitespace-based. We fold
 * width/case/kana differences first, then produce both word tokens (for Latin)
 * and character bigrams (for CJK) so the two scripts can be compared uniformly.
 */

/** Full-width ASCII and full-width space → half-width. */
function foldWidth(input: string): string {
  return input
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

/** Katakana → Hiragana, so フリガナ and ふりがな compare equal. */
function foldKana(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * Simplified/traditional folding for the handful of characters that actually
 * collide in recruitment forms. A full mapping table is out of scope for V0.1;
 * these are the ones we hit in practice.
 */
const HANZI_FOLD: Record<string, string> = {
  個: '个', 歷: '历', 經: '经', 驗: '验', 學: '学', 曆: '历', 職: '职', 業: '业',
  電: '电', 話: '话', 郵: '邮', 編: '编', 號: '号', 證: '证', 書: '书', 專: '专',
  長: '长', 愛: '爱', 簡: '简', 應: '应', 崗: '岗', 資: '资', 訊: '讯', 網: '网',
  級: '级', 語: '语', 國: '国', 現: '现', 單: '单', 離: '离', 態: '态', 間: '间',
  時: '时', 對: '对', 關: '关', 於: '于', 們: '们', 為: '为', 認: '认', 設: '设',
  計: '计', 開: '开', 發: '发', 產: '产', 運: '运', 營: '营', 銷: '销', 稱: '称',
  類: '类', 別: '别', 樣: '样', 準: '准', 實: '实', 際: '际', 圖: '图', 檔: '档',
  數: '数', 據: '据', 傳: '传', 給: '给', 從: '从', 會: '会', 誌: '志', 標: '标',
};

function foldHanzi(input: string): string {
  let out = '';
  for (const ch of input) out += HANZI_FOLD[ch] ?? ch;
  return out;
}

/** Canonical form used everywhere: lowercase, width/kana/hanzi folded. */
export function normalize(input: string | null | undefined): string {
  if (!input) return '';
  return foldHanzi(foldKana(foldWidth(input)))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips punctuation and the decorations recruitment forms sprinkle on labels:
 * required markers, colons, parentheses, and the trailing "(optional)".
 */
export function normalizeLabel(input: string | null | undefined): string {
  return normalize(input)
    .replace(/[*＊]/g, ' ')
    .replace(/[（(【\[][^）)】\]]*(optional|任意|选填|選填)[^）)】\]]*[）)】\]]/g, ' ')
    .replace(/[:：;；.,、。·・_/\\|—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits an identifier such as `candidate_first-name2` or `firstName` into
 * lowercase word tokens.
 */
export function tokenizeIdentifier(input: string | null | undefined): string[] {
  if (!input) return [];
  return normalize(input)
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9぀-ヿ一-鿿가-힯]+/)
    .flatMap(splitCamelRuns)
    .filter(Boolean);
}

/** `firstname` stays one token, but `firstName` was already space-split above. */
function splitCamelRuns(chunk: string): string[] {
  return chunk.split(/\s+/).filter(Boolean);
}

/** Latin word tokens from free text. */
export function tokenizeWords(input: string): string[] {
  return normalizeLabel(input).split(/\s+/).filter(Boolean);
}

/** Character n-grams — the workable unit for CJK similarity. */
export function ngrams(input: string, n = 2): string[] {
  const clean = normalizeLabel(input).replace(/\s+/g, '');
  if (clean.length < n) return clean ? [clean] : [];
  const out: string[] = [];
  for (let i = 0; i <= clean.length - n; i += 1) out.push(clean.slice(i, i + n));
  return out;
}

export function hasCjk(input: string): boolean {
  return /[぀-ヿ一-鿿]/.test(input);
}

/** Jaccard overlap of two token sets. */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

/** Sørensen–Dice over character bigrams. */
export function diceBigrams(a: string, b: string): number {
  const ga = ngrams(a, 2);
  const gb = ngrams(b, 2);
  if (ga.length === 0 || gb.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of ga) counts.set(g, (counts.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of gb) {
    const left = counts.get(g) ?? 0;
    if (left > 0) {
      shared += 1;
      counts.set(g, left - 1);
    }
  }
  return (2 * shared) / (ga.length + gb.length);
}

/**
 * Script-aware similarity: Latin text compares by word tokens, CJK by bigrams,
 * mixed text takes the better of the two.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const cjk = hasCjk(na) || hasCjk(nb);
  const wordScore = jaccard(tokenizeWords(na), tokenizeWords(nb));
  const charScore = diceBigrams(na, nb);
  return cjk ? Math.max(charScore, wordScore) : Math.max(wordScore, charScore * 0.9);
}
