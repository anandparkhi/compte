"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquareText, Mic, Send, Square } from "lucide-react";
import { Alert, Badge, Button, Card, cn, Select, Textarea } from "@/components/ui";
import { api, errorText } from "@/lib/client-api";

const EXAMPLES: { lang: string; text: string }[] = [
  { lang: "English", text: "Create a bill for Ramesh Traders for twenty boxes at five hundred rupees each, plus eighteen percent GST." },
  { lang: "हिंदी", text: "रमेश ट्रेडर्स के लिए बीस बॉक्स का बिल बनाओ, हर बॉक्स पांच सौ रुपये का है, जीएसटी अलग से लगाओ।" },
  { lang: "मराठी", text: "रमेश ट्रेडर्सला वीस बॉक्स विकले, प्रत्येक पाचशे रुपये, जीएसटी वेगळा लावा." },
  { lang: "Hinglish", text: "Ramesh ko bees box beche, 500 rupaye each, GST eighteen percent. Bill bana do." },
];

type Labels = Record<"create_hint" | "create_mic_start" | "create_mic_stop" | "create_transcribing" | "create_text_placeholder" | "create_language" | "create_extract" | "create_sms_tab" | "create_voice_tab" | "create_transcript" | "create_stt_not_configured", string>;

export function Composer({ labels: L, uiLang, sttConfigured, llmConfigured, businessPhone }: { labels: Labels; uiLang: string; sttConfigured: boolean; llmConfigured: boolean; businessPhone: string }) {
  const [tab, setTab] = useState<"voice" | "sms">("voice");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-white p-1 ring-1 ring-line" role="tablist">
        {(["voice", "sms"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("h-11 rounded-lg text-sm font-semibold", tab === k ? "bg-brand-600 text-white" : "text-ink")}>
            {k === "voice" ? L.create_voice_tab : L.create_sms_tab}
          </button>
        ))}
      </div>
      {tab === "voice" ? <VoiceText L={L} uiLang={uiLang} sttConfigured={sttConfigured} llmConfigured={llmConfigured} /> : <SmsSimulator businessPhone={businessPhone} />}
    </div>
  );
}

function VoiceText({ L, uiLang, sttConfigured, llmConfigured }: { L: Labels; uiLang: string; sttConfigured: boolean; llmConfigured: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [lang, setLang] = useState(uiLang === "en" ? "auto" : uiLang);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<"stt" | "extract" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fromVoice, setFromVoice] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const startRec = async () => {
    setErr(null); setNotice(null);
    if (!sttConfigured) { setNotice(L.create_stt_not_configured); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setBusy("stt");
        try {
          const fd = new FormData();
          fd.append("audio", new Blob(chunks, { type: r.mimeType || "audio/webm" }), "speech.webm");
          fd.append("language", lang);
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const body = await res.json();
          if (!res.ok) throw new Error(body?.error?.message ?? "Transcription failed");
          if (body.status === "NOT_CONFIGURED") setNotice(L.create_stt_not_configured);
          else { setText(body.transcript); setFromVoice(true); }
        } catch (e) { setErr(errorText(e)); }
        setBusy(null);
      };
      r.start();
      rec.current = r;
      setRecording(true);
      timer.current = setTimeout(() => r.state === "recording" && r.stop(), 29_000); // provider REST limit is 30 s
    } catch {
      setErr("Microphone not available. Allow microphone access or type instead.");
    }
  };
  const stopRec = () => { if (timer.current) clearTimeout(timer.current); rec.current?.stop(); };

  const extract = async () => {
    setBusy("extract"); setErr(null);
    try {
      const r = await api<{ id: string }>("/api/invoices/extract", { body: { text, language: lang, source: fromVoice ? "VOICE" : "TEXT" } });
      router.push(`/invoices/${r.id}`);
    } catch (e) { setErr(errorText(e)); setBusy(null); }
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-2">
        <button
          type="button"
          onClick={recording ? stopRec : startRec}
          disabled={busy !== null}
          aria-pressed={recording}
          className={cn("grid size-24 place-items-center rounded-full text-white shadow-md transition-colors", recording ? "bg-danger-600" : "bg-brand-600 hover:bg-brand-700", busy && "opacity-60")}
        >
          {busy === "stt" ? <Loader2 className="size-10 animate-spin" /> : recording ? <Square className="size-9" /> : <Mic className="size-10" />}
          <span className="sr-only">{recording ? L.create_mic_stop : L.create_mic_start}</span>
        </button>
        <p className="text-sm font-medium text-muted">{busy === "stt" ? L.create_transcribing : recording ? L.create_mic_stop : L.create_mic_start}</p>
        {!sttConfigured && <Badge tone="warn">Speech-to-text: not configured</Badge>}
      </div>
      {notice && <Alert tone="warn">{notice}</Alert>}

      <div className="flex items-center gap-2">
        <label htmlFor="lang" className="text-sm font-semibold">{L.create_language}</label>
        <Select id="lang" className="h-9 w-auto" value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="auto">Auto</option><option value="en">English</option><option value="hi">हिंदी</option><option value="mr">मराठी</option>
        </Select>
      </div>
      <div>
        {fromVoice && <p className="mb-1 text-xs font-semibold text-warn-600">{L.create_transcript}</p>}
        <Textarea aria-label="Transaction text" rows={4} value={text} placeholder={L.create_text_placeholder} onChange={(e) => { setText(e.target.value); }} className="text-base" />
      </div>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex.lang} type="button" onClick={() => { setText(ex.text); setFromVoice(false); }} className="rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line hover:bg-brand-50">
            {ex.lang} example
          </button>
        ))}
      </div>
      {err && <Alert tone="danger">{err}</Alert>}
      <Button size="lg" className="w-full" onClick={extract} disabled={text.trim().length < 2 || busy !== null}>
        {busy === "extract" ? <Loader2 className="size-5 animate-spin" /> : null}{L.create_extract}
      </Button>
      <p className="text-center text-xs text-muted">
        Read by: {llmConfigured ? "Claude (structured extraction)" : "Compte offline rules (Claude not configured)"} · GST is always calculated by Compte&apos;s deterministic engine · nothing is issued until you confirm.
      </p>
    </Card>
  );
}

function SmsSimulator({ businessPhone }: { businessPhone: string }) {
  const [body, setBody] = useState("BILL RAMESH 20 BOX 500 GST18");
  const [log, setLog] = useState<{ from: "me" | "compte"; text: string; invoiceId?: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const msg = body.trim();
    if (!msg) return;
    setBusy(true);
    setLog((l) => [...l, { from: "me", text: msg }]);
    try {
      const r = await api<{ reply: string; invoiceId?: string | null }>("/api/sms/simulate", { body: { body: msg, messageId: crypto.randomUUID() } });
      setLog((l) => [...l, { from: "compte", text: r.reply, invoiceId: r.invoiceId }]);
      const m = /Reply CONFIRM (D[A-Z0-9]{5})/.exec(r.reply);
      setBody(m ? `CONFIRM ${m[1]}` : "");
    } catch (e) {
      setLog((l) => [...l, { from: "compte", text: `Error: ${errorText(e)}` }]);
    }
    setBusy(false);
  };
  return (
    <Card className="space-y-3">
      <Alert tone="demo" title="SMS simulator — not connected to any phone network">
        Simulates a merchant texting Compte from {businessPhone.replace(/^(\d{2})\d{5}/, "$1•••••")}. This is <b>not</b> the GSTN 14409 channel — GSTN filing commands sent here are rejected and not stored.
      </Alert>
      <div className="min-h-48 space-y-2 rounded-xl bg-canvas p-3" aria-live="polite">
        {!log.length && <p className="py-8 text-center text-sm text-muted"><MessageSquareText className="mx-auto mb-2 size-6" />Format: BILL &lt;customer&gt; &lt;qty&gt; &lt;unit&gt; &lt;price&gt; GST&lt;rate&gt;</p>}
        {log.map((m, i) => (
          <div key={i} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.from === "me" ? "ml-auto bg-brand-600 text-white" : "bg-white ring-1 ring-line")}>
            <p className="whitespace-pre-wrap break-words font-mono text-[13px]">{m.text}</p>
            {m.invoiceId && <a href={`/invoices/${m.invoiceId}`} className="mt-1 inline-block text-xs font-semibold text-brand-700 underline">Open in Compte</a>}
          </div>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input aria-label="SMS text" className="h-12 flex-1 rounded-xl border border-line bg-white px-3 font-mono text-sm uppercase" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" size="lg" disabled={busy || !body.trim()} aria-label="Send SMS"><Send className="size-5" /></Button>
      </form>
    </Card>
  );
}
