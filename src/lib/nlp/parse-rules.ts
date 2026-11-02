import { matchEntity } from "./match";
import { detectScript, normalizeText, tokenize, tokenVariants } from "./normalize";
import { numberize, type NumToken } from "./numbers";
import type { Catalog, EntityMatch, Lang, ParsedIntent, ParsedItem, TaxInclusion } from "./types";

/**
 * Deterministic rule-based extractor. Works with no API keys and is the fallback when the
 * Claude extractor is unavailable. Handles English, Hindi, Marathi, Hinglish and the SMS grammar
 *   BILL <customer> <qty> <unit/product> <price> [GST<rate>] [INCL|EXCL]
 */
const n = (arr: string[]) => new Set(arr.map(normalizeText));

const CURRENCY = n(["₹", "rs", "inr", "rupee", "rupees", "rupaye", "rupaiye", "rupay", "rupiya", "rupye", "रुपये", "रुपए", "रुपया", "रुपयांना", "रुपयाला", "रुपयांचे", "रूपये", "रु", "रुपयात", "रुपयांत"]);
const PERCENT = n(["%", "percent", "per cent", "pct", "प्रतिशत", "टक्के", "टक्का", "pratishat", "takke", "taka", "percentage", "परसेंट"]);
const GST_WORDS = n(["gst", "जीएसटी", "जी एस टी", "igst", "tax", "टैक्स", "टॅक्स"]);
const EACH = n(["each", "per", "every", "har", "हर", "प्रत्येक", "प्रत्येकी", "प्रति", "pratyek", "prati", "@", "at", "rate", "दर", "dar", "pe", "पे", "नग"]);
const TOTAL = n(["total", "kul", "कुल", "एकूण", "ekun", "टोटल"]);
const UNIT_WORDS: Record<string, string> = Object.fromEntries(
  Object.entries({
    BOX: ["box", "boxes", "बॉक्स", "डब्बा", "डब्बे", "डबे", "खोका", "खोके", "khoka", "dabba", "dabbe"],
    KGS: ["kg", "kgs", "kilo", "kilos", "किलो", "kilogram"],
    PCS: ["piece", "pieces", "pcs", "pc", "पीस", "नग", "nag", "nos"],
    BAG: ["bag", "bags", "बोरी", "बोरे", "बॅग", "बैग", "bori"],
    LTR: ["litre", "liter", "litres", "liters", "ltr", "लीटर", "लिटर"],
    MTR: ["meter", "metre", "meters", "metres", "mtr", "मीटर"],
    DOZ: ["dozen", "dozens", "दर्जन", "डझन", "darjan"],
    HRS: ["hour", "hours", "hrs", "घंटे", "घंटा", "तास", "ghante"],
    ROL: ["roll", "rolls", "रोल"],
  }).flatMap(([unit, words]) => words.map((w) => [normalizeText(w), unit])),
);
const EXCLUSIVE_PATTERNS = [
  /\bplus\b/, /\bextra\b/, /\bexcl(usive|uding)?\b/, /\bseparate(ly)?\b/, /\badditional\b/, /\balag\b/, /\bwithout gst\b/, /\bbina gst\b/,
  /अलग/, /वेगळा|वेगळे|वेगळी|वेगळ्या/, /\bvegla\b/, /\+\s*gst/, /ऊपर से|उपर से|\bupar se\b/, /वरून/, /जोड़|जोड/,
];
const INCLUSIVE_PATTERNS = [/\bincl(usive|uding)?\b/, /\binc gst\b/, /gst included/, /all inclusive/, /सहित/, /समेत/, /मिलाकर/, /धरून/, /\bsahit\b/, /\bsamet\b/, /\bmilakar\b/, /\bdharun\b/, /जीएसटी सह\b/];

const HINDI_MARKERS = n(["बनाओ", "बना", "के", "लिए", "हर", "है", "का", "की", "अलग", "लगाओ", "और", "बेचे", "बेचा", "दो", "सौ", "को", "से", "दिया", "दिए", "करो", "चाहिए"]);
const MARATHI_MARKERS = n(["विकले", "विकला", "प्रत्येक", "प्रत्येकी", "वेगळा", "वेगळे", "लावा", "आणि", "केले", "दिले", "पाहिजे", "शंभर", "वीस", "पाच", "दोन", "करा", "बनवा", "आहे", "द्या", "रुपयांना", "बिल"]);
const HINGLISH_MARKERS = n(["ko", "beche", "becha", "bana", "banao", "rupaye", "bees", "har", "ka", "ki", "hai", "aur", "lagao", "alag", "se", "wala", "wale", "diya", "kar", "karo", "chahiye", "vikle", "ani", "pratyek"]);
const STOP_BEFORE_CUSTOMER = n(["ko", "को", "के", "for", "ला", "kade", "कडे", "saathi", "साठी", "to", "ne", "ने"]);

function isUnit(t: string): string | undefined {
  for (const v of tokenVariants(t)) if (UNIT_WORDS[v]) return UNIT_WORDS[v];
  return undefined;
}

export function detectLanguage(text: string): Lang {
  const { devanagari, latin } = detectScript(text);
  const toks = tokenize(normalizeText(text));
  if (devanagari > 0 && latin > 0) {
    const latinWords = toks.filter((t) => /^[a-z]{2,}$/.test(t) && !GST_WORDS.has(t)).length;
    if (latinWords >= 2 && devanagari >= 6) return "mixed";
  }
  if (devanagari > latin) {
    let hi = 0, mr = 0;
    for (const t of toks) {
      if (HINDI_MARKERS.has(t)) hi++;
      if (MARATHI_MARKERS.has(t)) mr++;
      if (/[ऀ-ॿ]{2,}(ला|ना|च्या|साठी)$/.test(t)) mr += 0.5;
      if (/[ऀ-ॿ]+(ळ)/.test(t)) mr += 0.5; // ळ is very common in Marathi, rare in Hindi
    }
    return mr > hi ? "mr" : "hi";
  }
  const hinglish = toks.filter((t) => HINGLISH_MARKERS.has(t)).length;
  if (hinglish >= 2) return "mixed";
  return "en";
}

function detectInclusion(norm: string): TaxInclusion {
  const ex = EXCLUSIVE_PATTERNS.some((r) => r.test(norm));
  const inc = INCLUSIVE_PATTERNS.some((r) => r.test(norm));
  if (ex && !inc) return "EXCLUSIVE";
  if (inc && !ex) return "INCLUSIVE";
  return null;
}

function isContextWord(t: string) {
  return CURRENCY.has(t) || PERCENT.has(t) || !!isUnit(t) || GST_WORDS.has(t) || EACH.has(t);
}

/** SMS grammar: BILL RAMESH 20 BOX 500 GST18 [INCL|EXCL] */
export function parseSmsBill(body: string, catalog: Catalog): ParsedIntent | null {
  const m = /^\s*bill\s+(.+?)\s+(\d+(?:\.\d+)?)\s+([^\d]+?)\s+(\d+(?:\.\d+)?)(?:\s+gst\s*(\d+(?:\.\d+)?)\s*%?)?(?:\s+(incl|excl))?\s*$/i.exec(body.trim());
  if (!m) return null;
  const [, customerText, qty, itemText, price, rate, incl] = m;
  const customer = matchEntity(customerText, catalog.customers);
  const product = matchEntity(itemText, catalog.products);
  const unit = isUnit(normalizeText(itemText.trim().split(/\s+/)[0]));
  const item: ParsedItem = {
    product: product.confidence === "NONE" ? productByUnit(unit, catalog, itemText) : stripMatch(product, itemText),
    quantity: qty,
    unitPrice: price,
    unitMention: itemText.trim(),
  };
  return {
    intent: "CREATE_INVOICE",
    language: "en",
    customer: { ...stripMatch(customer, customerText), mention: customerText.trim() },
    items: [item],
    gstRate: rate ?? null,
    taxInclusion: incl ? (incl.toLowerCase() === "incl" ? "INCLUSIVE" : "EXCLUSIVE") : null,
    method: "RULES",
    notes: ["Parsed from SMS command format."],
  };
}

function stripMatch(m: EntityMatch & { matchedTokens?: string[] }, mention?: string): EntityMatch {
  const { matchedTokens: _ignored, ...rest } = m;
  void _ignored;
  return { ...rest, mention: rest.mention ?? mention ?? null };
}

function productByUnit(unit: string | undefined, catalog: Catalog, mention: string | null): ParsedItem["product"] {
  if (!unit) return { mention, matchedId: null, candidates: [], confidence: "NONE" };
  const ps = catalog.products.filter((p) => p.unit === unit);
  if (ps.length === 1) return { mention, matchedId: ps[0].id, candidates: [], confidence: "UNIT_ONLY" };
  if (ps.length > 1) return { mention, matchedId: null, candidates: ps.map((p) => p.id), confidence: "AMBIGUOUS" };
  return { mention, matchedId: null, candidates: [], confidence: "NONE" };
}

export function parseWithRules(text: string, catalog: Catalog): ParsedIntent {
  const sms = parseSmsBill(text, catalog);
  if (sms) return sms;

  const notes: string[] = [];
  const language = detectLanguage(text);
  const norm = normalizeText(text);
  const tokens = tokenize(norm);
  const nts: NumToken[] = numberize(tokens, isContextWord);
  const words = nts.map((t) => t.text);

  // --- GST rate ---
  let gstRate: string | null = null;
  const rateIdx = new Set<number>();
  for (let i = 0; i < nts.length; i++) {
    if (!nts[i].value) continue;
    const next = nts[i + 1]?.text, prev = nts[i - 1]?.text, prev2 = nts[i - 2]?.text;
    const pctNext = next !== undefined && PERCENT.has(next);
    const gstPrev = (prev !== undefined && GST_WORDS.has(prev)) || (prev2 !== undefined && GST_WORDS.has(prev2) && !nts[i - 1]?.value);
    if (pctNext || gstPrev) {
      gstRate = nts[i].value!;
      rateIdx.add(i);
      break;
    }
  }

  // --- quantity / price ---
  const numIdx = nts.map((t, i) => (t.value && !rateIdx.has(i) ? i : -1)).filter((i) => i >= 0);
  const near = (i: number, set: Set<string>, before: number, after: number) => {
    for (let k = Math.max(0, i - before); k <= Math.min(nts.length - 1, i + after); k++) if (k !== i && set.has(nts[k].text)) return true;
    return false;
  };
  const productTokenSet = new Set(
    catalog.products.flatMap((p) => [p.name, ...p.aliases]).flatMap((l) => tokenize(normalizeText(l))),
  );
  const followedByItem = (i: number) => [1, 2].some((d) => {
    const t = nts[i + d]?.text;
    return !!t && (!!isUnit(t) || tokenVariants(t).some((v) => productTokenSet.has(v)));
  });

  let qtyI: number | null = null, priceI: number | null = null, totalI: number | null = null;
  for (const i of numIdx) {
    const cur = near(i, CURRENCY, 1, 1);
    if (near(i, TOTAL, 2, 0)) { totalI = i; continue; }
    if (cur || nts[i - 1]?.text === "@" || nts[i - 1]?.text === "at" || (near(i, EACH, 3, 2) && !followedByItem(i))) {
      if (priceI === null) priceI = i;
    } else if (followedByItem(i) && qtyI === null) {
      qtyI = i;
    }
  }
  const leftovers = numIdx.filter((i) => i !== qtyI && i !== priceI && i !== totalI);
  if (qtyI === null && leftovers.length) { qtyI = leftovers.shift()!; notes.push("Quantity was inferred from word order — please check it."); }
  if (priceI === null && leftovers.length) { priceI = leftovers.shift()!; notes.push("Unit price was inferred from word order — please check it."); }
  if (totalI !== null) notes.push(`A total amount (${nts[totalI].value}) was mentioned. Compte needs the unit price; please confirm it — totals are always recalculated.`);
  if (leftovers.length) notes.push(`Unused numbers in the message: ${leftovers.map((i) => nts[i].value).join(", ")}.`);

  // --- customer & product ---
  const excludeForCustomer = new Set<string>([...productTokenSet, ...Object.keys(UNIT_WORDS)]);
  const customerMatch = matchEntity(text, catalog.customers, { excludeTokens: excludeForCustomer });
  let customer = stripMatch(customerMatch);
  if (customer.confidence === "NONE") {
    // try to extract a mention: words before a postposition ("Suresh ko", "for Suresh", "सुरेशला")
    const stopAt = words.findIndex((w) => STOP_BEFORE_CUSTOMER.has(w));
    let mention: string | null = null;
    if (stopAt > 0 && words[stopAt] !== "for" && words[stopAt] !== "to") mention = words.slice(Math.max(0, stopAt - 2), stopAt).join(" ");
    else if (stopAt >= 0 && (words[stopAt] === "for" || words[stopAt] === "to")) mention = words.slice(stopAt + 1, stopAt + 3).filter((w) => !/^\d/.test(w)).join(" ");
    const pretty = mention ? mention.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : null;
    customer = { mention: pretty || null, matchedId: null, candidates: [], confidence: "NONE" };
  }

  const customerTokens = new Set(customerMatch.matchedTokens);
  const productMatch = matchEntity(text, catalog.products, { excludeTokens: customerTokens });
  const unitTok = qtyI !== null ? [nts[qtyI + 1]?.text, nts[qtyI + 2]?.text].find((t) => t && isUnit(t)) : words.find((w) => isUnit(w));
  const unitCode = unitTok ? isUnit(unitTok) : undefined;
  const product = productMatch.confidence === "NONE" ? productByUnit(unitCode, catalog, unitTok ?? null) : stripMatch(productMatch);
  if (product.confidence === "UNIT_ONLY") notes.push(`Product matched by unit "${unitTok}" — confirm it is the right item.`);

  const taxInclusion = detectInclusion(norm);
  const hasAmount = qtyI !== null || priceI !== null;
  const billWords = /\b(bill|invoice|sold|sell|supplied|send|sent|beche|becha|bana|bhejo|bheja|bheje|diya|diye)\b|बिल|बेचे|बेचा|विकले|विकला|इनवॉइस|बनाओ|बना|भेजो|भेजा|भेजे|पाठवले|पाठवा|दिले/.test(norm);

  return {
    intent: hasAmount || billWords ? "CREATE_INVOICE" : "UNKNOWN",
    language,
    customer,
    items: [{ product, quantity: qtyI !== null ? nts[qtyI].value! : null, unitPrice: priceI !== null ? nts[priceI].value! : null, unitMention: unitTok ?? null }],
    gstRate,
    taxInclusion,
    method: "RULES",
    notes,
  };
}
