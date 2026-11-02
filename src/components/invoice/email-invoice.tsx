"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { Alert, Badge, Button, Card, CardTitle, Input } from "@/components/ui";
import { api, errorText } from "@/lib/client-api";

type Res = { delivered: boolean; status: string; error?: string | null; preview?: { to: string; subject: string; html: string; attachment: string } };

export function EmailInvoice({ invoiceId, defaultTo, label, history }: { invoiceId: string; defaultTo: string; label: string; history: { id: string; to: string; status: string; at: string }[] }) {
  const router = useRouter();
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <CardTitle className="mb-3">{label}</CardTitle>
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null); setRes(null);
        try { setRes(await api<Res>(`/api/invoices/${invoiceId}/email`, { body: { to } })); router.refresh(); } catch (e2) { setErr(errorText(e2)); }
        setBusy(false);
      }}>
        <Input type="email" aria-label="Recipient email" value={to} onChange={(e) => setTo(e.target.value)} required />
        <Button type="submit" disabled={busy}><Mail className="size-4" />Send</Button>
      </form>
      {err && <Alert tone="danger" className="mt-3">{err}</Alert>}
      {res?.delivered && <Alert tone="brand" className="mt-3">Sent via email provider.</Alert>}
      {res && !res.delivered && res.status === "FAILED" && <Alert tone="danger" className="mt-3">Not delivered: {res.error}</Alert>}
      {res?.preview && (
        <Alert tone="warn" className="mt-3" title="Email NOT sent — provider not configured">
          Set RESEND_API_KEY and EMAIL_FROM to send. Preview: <b>{res.preview.subject}</b> → {res.preview.to}, attachment {res.preview.attachment}
        </Alert>
      )}
      {history.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {history.map((h) => <li key={h.id} className="flex items-center justify-between gap-2"><span className="truncate">{h.to}</span><Badge tone={h.status === "SENT" ? "brand" : "warn"}>{h.status.replace(/_/g, " ").toLowerCase()}</Badge></li>)}
        </ul>
      )}
    </Card>
  );
}
