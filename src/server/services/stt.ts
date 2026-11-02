import "server-only";
import { env } from "../env";
import { AppError } from "../errors";

/**
 * Speech-to-text adapter. Provider: Sarvam AI (POST https://api.sarvam.ai/speech-to-text,
 * header api-subscription-key, multipart file/model/mode/language_code; REST audio ≤ 30 s).
 * Audio is processed in memory and never stored by Compte.
 */
export interface TranscriptionResult {
  status: "OK" | "NOT_CONFIGURED";
  transcript?: string;
  languageCode?: string | null;
  provider?: string;
}

const LANG_CODES: Record<string, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };
export const MAX_AUDIO_BYTES = 2_500_000;

export async function transcribe(audio: Blob, language: string, fetchImpl: typeof fetch = fetch): Promise<TranscriptionResult> {
  if (!env.sarvamApiKey) return { status: "NOT_CONFIGURED" };
  if (audio.size === 0) throw new AppError(422, "EMPTY_AUDIO", "No audio received");
  if (audio.size > MAX_AUDIO_BYTES) throw new AppError(413, "AUDIO_TOO_LARGE", "Recording is too long — keep it under 30 seconds");
  const form = new FormData();
  form.append("file", audio, "speech.webm");
  form.append("model", env.sarvamModel);
  if (env.sarvamModel.startsWith("saaras")) form.append("mode", "transcribe");
  form.append("language_code", LANG_CODES[language] ?? "unknown");
  const res = await fetchImpl("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": env.sarvamApiKey }, body: form });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new AppError(502, "STT_FAILED", `Speech provider error (HTTP ${res.status}). ${text}`);
  }
  const body = (await res.json()) as { transcript?: string; language_code?: string | null };
  return { status: "OK", transcript: (body.transcript ?? "").trim(), languageCode: body.language_code ?? null, provider: `sarvam:${env.sarvamModel}` };
}
