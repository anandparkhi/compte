import { GSTN } from "../config/brand";
import { validateGstin } from "./gstin";
import { isPeriodEnded, parsePeriodKey, type FilingFrequency } from "./periods";

/**
 * Official GSTN nil-return SMS formats (send to 14409 from the authorised signatory's
 * registered mobile number). Verified against tutorial.gst.gov.in FAQs (Nov 2026):
 *   NIL<space>R1<space><GSTIN><space><MMYYYY>   then   CNF<space>R1<space><6-digit code>
 *   NIL<space>3B<space><GSTIN><space><MMYYYY>   then   CNF<space>3B<space><6-digit code>
 *   HELP<space>R1 / HELP<space>3B
 * Quarterly filers use the last month of the quarter as MMYYYY.
 *
 * Compte only GENERATES these strings. It never sends them, and never receives, stores or
 * proxies the verification code.
 */
export type NilReturnType = "GSTR1" | "GSTR3B";

export const GSTN_RETURN_CODE: Record<NilReturnType, "R1" | "3B"> = { GSTR1: "R1", GSTR3B: "3B" };

export class SmsCommandError extends Error {}

export function buildNilInitiationSms(args: { returnType: NilReturnType; gstin: string; periodKey: string; frequency: FilingFrequency; today: string }): { to: string; body: string } {
  const v = validateGstin(args.gstin);
  if (!v.valid) throw new SmsCommandError("Cannot build SMS: GSTIN is not structurally valid");
  let period;
  try {
    period = parsePeriodKey(args.periodKey, args.frequency);
  } catch (e) {
    throw new SmsCommandError(`Cannot build SMS: ${(e as Error).message}`);
  }
  if (!isPeriodEnded(period, args.today)) throw new SmsCommandError("Cannot build SMS: the return period has not ended yet");
  return { to: GSTN.smsShortCode, body: `NIL ${GSTN_RETURN_CODE[args.returnType]} ${v.gstin} ${period.key}` };
}

/** Template shown to the user. The placeholder is NEVER replaced by Compte. */
export function confirmationTemplate(returnType: NilReturnType): string {
  return `CNF ${GSTN_RETURN_CODE[returnType]} <6-digit code>`;
}

export function helpSms(returnType: NilReturnType): string {
  return `HELP ${GSTN_RETURN_CODE[returnType]}`;
}

export type SmsPlatform = "ios" | "android" | "other";

export function detectSmsPlatform(userAgent: string): SmsPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/**
 * sms: URI for the composer handoff. iOS expects `sms:NUMBER&body=`, Android `sms:NUMBER?body=`.
 * Prefilled bodies are not honoured by every SMS app — the UI always offers Copy as fallback.
 */
export function smsComposerUri(to: string, body: string, platform: SmsPlatform): string {
  const enc = encodeURIComponent(body);
  return platform === "ios" ? `sms:${to}&body=${enc}` : `sms:${to}?body=${enc}`;
}

/** Detects text that looks like a GSTN 14409 command (used to keep it OUT of Compte's own SMS inbox). */
export function looksLikeGstnCommand(text: string): boolean {
  return /^\s*(NIL|CNF|HELP)\s+(R1|3B|R3B|C8|CMP08)\b/i.test(text ?? "");
}
