"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { api, errorText } from "@/lib/client-api";

export function StartNilButton({ returnType, periodKey, demo, label, variant }: { returnType: "GSTR1" | "GSTR3B"; periodKey: string; demo: boolean; label: string; variant: "primary" | "outline" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <Button variant={variant} disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          await api("/api/nil-filings", { body: { returnType, periodKey, demo } });
          router.push(`/returns/${periodKey}/nil/${returnType.toLowerCase()}${demo ? "?demo=1" : ""}`);
        } catch (e) { setErr(errorText(e)); setBusy(false); }
      }}>{label}</Button>
      {err && <p className="mt-1 text-xs text-danger-600">{err}</p>}
    </div>
  );
}
