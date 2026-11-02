const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** Canonicalise text for matching: NFC, digits, nukta/chandrabindu folding, lowercase, punctuation. */
export function normalizeText(input: string): string {
  let s = (input ?? "").normalize("NFC");
  s = s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  s = s.replace(/़/g, ""); // nukta: ज़ -> ज, ड़ -> ड
  s = s.replace(/ँ/g, "ं"); // chandrabindu -> anusvara: पाँच -> पांच
  s = s.toLowerCase();
  s = s.replace(/(\d),(?=\d)/g, "$1"); // 1,000 -> 1000
  s = s.replace(/\/-/g, " "); // 500/- -> 500
  s = s.replace(/₹/g, " ₹ ");
  s = s.replace(/\brs\.?(?=\s|\d|$)/g, " rs ");
  s = s.replace(/%/g, " % ");
  s = s.replace(/@/g, " @ ");
  s = s.replace(/(\d)\s*[x×]\s*(\d)/g, "$1 x $2");
  // split digits from letters (Latin or Devanagari), keep decimals
  s = s.replace(/(\d)([^\d\s.])/g, "$1 $2").replace(/([^\d\s.])(\d)/g, "$1 $2");
  s = s.replace(/[,;:!?।॥|"'“”‘’()[\]{}]/g, " ");
  s = s.replace(/\.(?!\d)/g, " ").replace(/(?<!\d)\./g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function tokenize(normalized: string): string[] {
  return normalized ? normalized.split(" ") : [];
}

const MARATHI_SUFFIXES = ["च्या", "साठी", "कडे", "कडून", "ला", "ना", "चे", "ची", "चा", "ने", "नी", "शी"];

/** Token plus suffix-stripped variants (Marathi case markers attach to the noun: ट्रेडर्सला) */
export function tokenVariants(token: string): string[] {
  const out = new Set([token]);
  for (const suf of MARATHI_SUFFIXES) if (token.length > suf.length + 1 && token.endsWith(suf)) out.add(token.slice(0, -suf.length));
  if (/^[a-z]+$/.test(token) && token.length > 4) {
    if (token.endsWith("es")) out.add(token.slice(0, -2));
    if (token.endsWith("s")) out.add(token.slice(0, -1));
  }
  return [...out];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function detectScript(text: string): { devanagari: number; latin: number } {
  const dev = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const lat = (text.match(/[A-Za-z]/g) ?? []).length;
  return { devanagari: dev, latin: lat };
}
