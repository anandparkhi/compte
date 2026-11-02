import { levenshtein, normalizeText, tokenize, tokenVariants } from "./normalize";
import type { EntityMatch } from "./types";

const GENERIC = new Set(
  [
    "traders", "trader", "trading", "enterprises", "enterprise", "pvt", "private", "ltd", "limited", "llp", "and", "co", "company",
    "industries", "stores", "store", "agencies", "agency", "sons", "brothers", "bros", "corporation", "services", "solutions", "the",
    "ट्रेडर्स", "ट्रेडर्स", "एंटरप्राइजेस", "एंटरप्रायझेस", "इंडस्ट्रीज", "स्टोअर्स", "स्टोर्स", "कंपनी", "एजन्सी", "एजेंसी", "ब्रदर्स",
  ].map(normalizeText),
);

interface Named { id: string; name: string; aliases: string[] }

function tokenMatches(nameTok: string, textVariants: string[][]): "EXACT" | "FUZZY" | null {
  for (const vars of textVariants) {
    if (vars.includes(nameTok)) return "EXACT";
  }
  if (nameTok.length >= 5) {
    for (const vars of textVariants) for (const v of vars) if (v.length >= 4 && levenshtein(v, nameTok) <= 1) return "FUZZY";
  }
  return null;
}

/**
 * Deterministic entity matcher used for customers and products.
 * Scores each candidate name/alias by how many of its tokens appear in the text;
 * a non-generic ("distinctive") token must match. Ties => AMBIGUOUS, never a guess.
 */
export function matchEntity(text: string, entities: Named[], opts: { excludeTokens?: Set<string> } = {}): EntityMatch & { matchedTokens: string[] } {
  const textTokens = tokenize(normalizeText(text)).filter((t) => !opts.excludeTokens?.has(t));
  const variants = textTokens.map(tokenVariants);
  const scored: { id: string; score: number; kind: "EXACT" | "PARTIAL" | "FUZZY"; matched: string[] }[] = [];

  for (const e of entities) {
    let best: { score: number; kind: "EXACT" | "PARTIAL" | "FUZZY"; matched: string[] } | null = null;
    for (const label of [e.name, ...e.aliases]) {
      const nameToks = tokenize(normalizeText(label));
      if (!nameToks.length) continue;
      const distinctive = nameToks.filter((t) => !GENERIC.has(t));
      let hits = 0, fuzzy = false, distinctHit = false;
      const matched: string[] = [];
      for (const nt of nameToks) {
        const m = tokenMatches(nt, variants);
        if (m) {
          hits++;
          matched.push(nt);
          if (m === "FUZZY") fuzzy = true;
          if (!GENERIC.has(nt)) distinctHit = true;
        }
      }
      if (!distinctHit && distinctive.length) continue;
      if (!hits) continue;
      const score = hits / nameToks.length;
      const kind = score === 1 ? (fuzzy ? "FUZZY" : "EXACT") : "PARTIAL";
      if (!best || score > best.score) best = { score, kind, matched };
    }
    if (best) scored.push({ id: e.id, ...best });
  }

  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return { mention: null, matchedId: null, candidates: [], confidence: "NONE", matchedTokens: [] };
  const top = scored[0];
  // Ambiguous if another entity scores close, or matched every token the winner matched
  // (e.g. text "Ramesh" vs customers "Ramesh Traders" and "Ramesh Steel Works").
  const close = scored.filter((s) => s.id !== top.id && (top.score - s.score < 0.25 || top.matched.every((t) => s.matched.includes(t))));
  if (close.length) {
    return { mention: top.matched.join(" "), matchedId: null, candidates: [top.id, ...close.map((c) => c.id)], confidence: "AMBIGUOUS", matchedTokens: top.matched };
  }
  return { mention: top.matched.join(" "), matchedId: top.id, candidates: [], confidence: top.kind, matchedTokens: top.matched };
}
