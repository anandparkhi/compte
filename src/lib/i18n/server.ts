import "server-only";
import { cookies } from "next/headers";
import { isUiLang, translator, type UiLang } from "./messages";

export async function getLang(fallback?: string | null): Promise<UiLang> {
  const c = (await cookies()).get("compte_lang")?.value;
  if (isUiLang(c)) return c;
  return isUiLang(fallback) ? fallback : "en";
}

export async function getT(fallback?: string | null) {
  const lang = await getLang(fallback);
  return { lang, t: translator(lang) };
}
