import { getState } from "./states";

/**
 * GSTIN structural validation (format + check digit).
 * IMPORTANT: a structurally valid GSTIN is NOT proof of registration. Live status can only be
 * obtained from an authorised GSTN/GSP data source, which this MVP does not have.
 */
const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// Regular taxpayer pattern: 2-digit state, 10-char PAN, entity number, 'Z' (default), check char
const REGULAR_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function computeGstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARSET.indexOf(first14[i]);
    if (v < 0) throw new Error("invalid character");
    const product = v * ((i % 2) + 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export type GstinValidation =
  | { valid: true; gstin: string; stateCode: string; pan: string }
  | { valid: false; gstin: string; reason: "EMPTY" | "LENGTH" | "FORMAT" | "STATE_CODE" | "CHECKSUM" };

export function normalizeGstin(input: string): string {
  return (input ?? "").toUpperCase().replace(/\s+/g, "");
}

export function validateGstin(input: string): GstinValidation {
  const gstin = normalizeGstin(input);
  if (!gstin) return { valid: false, gstin, reason: "EMPTY" };
  if (gstin.length !== 15) return { valid: false, gstin, reason: "LENGTH" };
  if (!REGULAR_PATTERN.test(gstin)) return { valid: false, gstin, reason: "FORMAT" };
  const stateCode = gstin.slice(0, 2);
  if (!getState(stateCode)) return { valid: false, gstin, reason: "STATE_CODE" };
  if (computeGstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) return { valid: false, gstin, reason: "CHECKSUM" };
  return { valid: true, gstin, stateCode, pan: gstin.slice(2, 12) };
}

export const GSTIN_REASON_TEXT: Record<string, string> = {
  EMPTY: "GSTIN is required.",
  LENGTH: "GSTIN must be exactly 15 characters.",
  FORMAT: "GSTIN format is invalid (expected 2-digit state code, 10-character PAN, entity code, Z, check character).",
  STATE_CODE: "The first two digits are not a valid GST state code.",
  CHECKSUM: "The check character does not match — the GSTIN has a typo.",
};

/** Mask a GSTIN for display, e.g. 27ZZZFZ0001Z1Z5 -> 27ZZZ••••••1Z5 */
export function maskGstin(gstin: string): string {
  if (!gstin || gstin.length < 15) return gstin;
  return `${gstin.slice(0, 5)}••••••${gstin.slice(11)}`;
}
