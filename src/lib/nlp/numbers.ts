import { normalizeText } from "./normalize";

/**
 * Number-word recognition for English, Hindi (Devanagari + romanised) and Marathi.
 * Converts token sequences such as ["पांच","सौ"] or ["five","hundred"] or ["पाचशे"] into "500".
 */
const raw: Record<string, number> = {
  // English
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Hindi (Devanagari)
  "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "छह": 6, "छः": 6, "छे": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
  "ग्यारह": 11, "बारह": 12, "तेरह": 13, "चौदह": 14, "पंद्रह": 15, "सोलह": 16, "सत्रह": 17, "अठारह": 18, "उन्नीस": 19,
  "बीस": 20, "इक्कीस": 21, "बाईस": 22, "तेईस": 23, "चौबीस": 24, "पच्चीस": 25, "छब्बीस": 26, "सत्ताईस": 27, "अट्ठाईस": 28, "उनतीस": 29,
  "तीस": 30, "पैंतीस": 35, "चालीस": 40, "पैंतालीस": 45, "पचास": 50, "साठ": 60, "सत्तर": 70, "पचहत्तर": 75, "अस्सी": 80, "नब्बे": 90,
  "डेढ": 1.5, "ढाई": 2.5,
  // Marathi (Devanagari) — shared spellings above cover एक/तीन/चार/सात/आठ/तीस/साठ/सत्तर
  "दोन": 2, "पाच": 5, "सहा": 6, "नऊ": 9, "दहा": 10, "अकरा": 11, "बारा": 12, "तेरा": 13, "चौदा": 14, "पंधरा": 15, "सोळा": 16,
  "सतरा": 17, "अठरा": 18, "एकोणीस": 19, "वीस": 20, "पंचवीस": 25, "चाळीस": 40, "पन्नास": 50, "पंचाहत्तर": 75, "ऐंशी": 80, "नव्वद": 90,
  "दीड": 1.5, "अडीच": 2.5,
  // Romanised Hindi / Marathi
  ek: 1, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, paach: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, das: 10, dus: 10,
  gyarah: 11, barah: 12, baarah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, athara: 18, unnis: 19,
  bees: 20, bis: 20, vees: 20, pachchis: 25, pachis: 25, tees: 30, chalis: 40, chaalis: 40, pachas: 50, pachaas: 50,
  sattar: 70, assi: 80, nabbe: 90, nabbey: 90, dedh: 1.5, dhai: 2.5,
  // ambiguous romanised words (only accepted in numeric context, see AMBIGUOUS)
  do: 2, nau: 9,
};

const rawMult: Record<string, number> = {
  hundred: 100, thousand: 1000, lakh: 100000, lakhs: 100000, lac: 100000,
  "सौ": 100, "शंभर": 100, "शे": 100, "हजार": 1000, "लाख": 100000,
  sau: 100, so: 100, shambhar: 100, she: 100, hazar: 1000, hazaar: 1000, hajar: 1000, hajaar: 1000, lakh_: 100000,
};

export const NUMBER_WORDS = new Map(Object.entries(raw).map(([k, v]) => [normalizeText(k), v]));
export const MULTIPLIERS = new Map(Object.entries(rawMult).map(([k, v]) => [normalizeText(k.replace(/_$/, "")), v]));
/** Words that are numbers only in numeric context (e.g. "bana do" = "make it", not 2) */
export const AMBIGUOUS = new Set(["do", "nau"]);

/** Marathi compound hundreds: पाचशे = 500, दोनशे = 200, दीडशे = 150; romanised panchshe */
function compoundHundred(token: string): number | undefined {
  for (const suffix of ["शे", "she"]) {
    if (token.length > suffix.length && token.endsWith(suffix)) {
      const base = NUMBER_WORDS.get(token.slice(0, -suffix.length));
      if (base !== undefined && base < 10) return base * 100;
    }
  }
  return undefined;
}

export interface NumToken {
  text: string;
  /** numeric value as decimal string when this token is a number */
  value?: string;
  /** original tokens consumed */
  span: [number, number];
}

const isDigitNum = (t: string) => /^\d+(\.\d+)?$/.test(t);

/**
 * Collapse number sequences. `isContextWord(token)` tells whether a token is a unit/currency/
 * percent/multiplier word, used to accept ambiguous words like "do".
 */
export function numberize(tokens: string[], isContextWord: (t: string) => boolean): NumToken[] {
  const out: NumToken[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const start = i;
    const wordVal = (tok: string, next?: string): number | undefined => {
      if (isDigitNum(tok)) return Number(tok);
      const c = compoundHundred(tok);
      if (c !== undefined) return c;
      const v = NUMBER_WORDS.get(tok);
      if (v === undefined) return undefined;
      if (AMBIGUOUS.has(tok)) {
        if (!next) return undefined;
        if (!(MULTIPLIERS.has(next) || isContextWord(next) || NUMBER_WORDS.has(next) || isDigitNum(next))) return undefined;
      }
      return v;
    };

    const first = wordVal(t, tokens[i + 1]);
    if (first === undefined) {
      out.push({ text: t, span: [i, i] });
      i++;
      continue;
    }
    // Digit numbers stand alone unless followed by a multiplier ("5 hundred", "2 लाख")
    let total = 0;
    let current = 0;
    let consumedAny = false;
    let lastWasDigit = false;
    while (i < tokens.length) {
      const tok = tokens[i];
      const mult = MULTIPLIERS.get(tok);
      if (mult !== undefined && consumedAny) {
        if (mult === 100) current = (current || 1) * 100;
        else { total += (current || 1) * mult; current = 0; }
        i++;
        lastWasDigit = false;
        continue;
      }
      if (consumedAny && lastWasDigit) break; // "20 500" are two numbers
      const v = wordVal(tok, tokens[i + 1]);
      if (v === undefined) {
        if (consumedAny && (tok === "and" || tok === "aur" || tok === "और") && i + 1 < tokens.length) {
          const nv = wordVal(tokens[i + 1], tokens[i + 2]);
          if (nv !== undefined && nv < 100 && current >= 100) { i++; continue; }
        }
        break;
      }
      // word numbers: allow "twenty five" composition but not "five twenty"
      if (consumedAny && !isDigitNum(tok)) {
        const lastUnit = current % 100;
        if (!(lastUnit % 10 === 0 && lastUnit >= 20 && v < 10) && !(current % 100 === 0 && current > 0 && v < 100)) break;
      }
      if (consumedAny && isDigitNum(tok)) break;
      current += v;
      consumedAny = true;
      lastWasDigit = isDigitNum(tok);
      i++;
    }
    const value = total + current;
    out.push({ text: tokens.slice(start, i).join(" "), value: String(value), span: [start, i - 1] });
  }
  return out;
}
