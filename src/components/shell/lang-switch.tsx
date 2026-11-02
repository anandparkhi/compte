"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { LANGS, LANG_LABEL, type UiLang } from "@/lib/i18n/messages";

export function LangSwitch({ lang }: { lang: UiLang }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted">
      <Languages className="size-4" aria-hidden />
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink"
        value={lang}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          start(async () => {
            await fetch("/api/preferences/language", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: v }) });
            router.refresh();
          });
        }}
      >
        {LANGS.map((l) => <option key={l} value={l}>{LANG_LABEL[l as UiLang]}</option>)}
      </select>
    </label>
  );
}
