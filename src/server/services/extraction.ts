import "server-only";
import { env } from "../env";
import { parseWithRules } from "@/lib/nlp/parse-rules";
import { createClaudeExtractor, llmToParsedIntent, type LlmExtractor } from "@/lib/nlp/claude-extract";
import type { Catalog, ParsedIntent } from "@/lib/nlp/types";

let override: LlmExtractor | null | undefined;
/** Test hook: inject a mock extractor (or null to force rules). */
export function setLlmExtractorForTests(x: LlmExtractor | null | undefined) {
  override = x;
}

function extractor(): LlmExtractor | null {
  if (override !== undefined) return override;
  return env.anthropicApiKey ? createClaudeExtractor(env.anthropicApiKey, env.anthropicModel) : null;
}

/**
 * Text -> structured intent. Claude when configured, deterministic rules otherwise or on failure.
 * Either way, the output is only a proposal: validation + GST maths happen downstream.
 */
export async function extractIntent(text: string, catalog: Catalog, languageHint?: string): Promise<ParsedIntent> {
  const llm = extractor();
  if (llm) {
    try {
      const x = await llm.extract(text, catalog, languageHint);
      return llmToParsedIntent(x, catalog);
    } catch (e) {
      const r = parseWithRules(text, catalog);
      r.notes.unshift(`Claude extraction unavailable (${e instanceof Error ? e.message.slice(0, 80) : "error"}); used Compte's offline rules.`);
      return r;
    }
  }
  return parseWithRules(text, catalog);
}
