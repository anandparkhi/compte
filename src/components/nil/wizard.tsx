"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleHelp, Clock, Copy, Download, ExternalLink, Loader2, MessageSquare, Phone, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { Alert, Badge, Button, Card, CardTitle, cn, Input } from "@/components/ui";
import { FilingStatusBadge } from "@/components/filing-status-badge";
import { api, errorText } from "@/lib/client-api";
import { detectSmsPlatform, smsComposerUri } from "@/lib/domain/gstn-sms";
import type { FilingStatus } from "@/lib/domain/filing-state";
import type { EligibilityCheck, Tri } from "@/lib/domain/nil-eligibility";
import type { MessageKey } from "@/lib/i18n/messages";

interface View {
  filing: { id: string; returnType: "GSTR1" | "GSTR3B"; periodKey: string; filingFrequency: string; status: FilingStatus; isDemo: boolean; gstin: string; arn: string | null; arnVerificationStatus: string; rejectionReason: string | null; declarationAt: string | null };
  period: { label: string; key: string; endExclusive: string };
  business: { legalName: string; gstin: string; filingFrequency: string; phoneIsGstnRegistered: string };
  local: { issuedInvoiceCount: number; draftInvoiceCount: number; inwardSupplyCount: number; reverseChargeInwardCount: number };
  latestAssessment: { outcome: string; answers: Record<string, Tri>; checks: EligibilityCheck[]; declarationAccepted: boolean } | null;
  evidence: { id: string; createdAt: string; kind: string; source: string; summary: string }[];
  sms: { to: string; body: string } | null;
  confirmationTemplate: string;
  helpSms: string;
}
type Q = { id: string; text: string; textEn: string; checkWhere: string; conservative: boolean };

const SOURCE_BADGE: Record<string, { label: string; tone: "brand" | "info" | "warn" | "neutral" }> = {
  COMPTE_LEDGER: { label: "Compte books", tone: "brand" },
  SYSTEM_RULE: { label: "Rule check", tone: "neutral" },
  USER_DECLARATION: { label: "Your answer", tone: "info" },
  NOT_VERIFIABLE_BY_COMPTE: { label: "Portal — Compte can't verify", tone: "warn" },
};

export function NilWizard({ labels: L, initial, questions, declaration, maskedGstin, maskedPhone, gstn }: {
  labels: Record<MessageKey, string>; initial: View; questions: Q[]; declaration: string; maskedGstin: string; maskedPhone: string;
  gstn: { portalUrl: string; faq: string; troubleshooting: string; validity: number; resendWait: number; maxWrong: number };
}) {
  const [view, setView] = useState<View>(initial);
  const [answers, setAnswers] = useState<Record<string, Tri>>(initial.latestAssessment?.answers ?? {});
  const [declared, setDeclared] = useState(initial.latestAssessment?.declarationAccepted ?? false);
  const [irrev, setIrrev] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [arn, setArn] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [reReview, setReReview] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [sim, setSim] = useState<{ code?: string; arn?: string; log: { from: "phone" | "gstn"; text: string }[] }>({ log: [] });
  useEffect(() => setPlatform(detectSmsPlatform(navigator.userAgent)), []);

  const f = view.filing;
  const rt = f.returnType === "GSTR1" ? "GSTR-1" : "GSTR-3B";
  const code = f.returnType === "GSTR1" ? "R1" : "3B";
  const status = f.status;
  const fsLabel = (s: FilingStatus) => L[`fs_${s}` as MessageKey];
  const reviewable = ["NOT_STARTED", "ELIGIBILITY_REVIEW", "INELIGIBLE", "NEEDS_MANUAL_REVIEW", "ELIGIBLE_SELF_DECLARED"].includes(status) || (status === "REJECTED" && reReview);
  const checks = view.latestAssessment?.checks ?? [];
  const outcome = view.latestAssessment?.outcome;

  const refresh = async () => setView(await api<View>(`/api/nil-filings/${f.id}/view`));
  const act = async (name: string, path: string, body?: unknown) => {
    setBusy(name); setErr(null);
    try { await api(`/api/nil-filings/${f.id}/${path}`, { body: body ?? {} }); await refresh(); return true; }
    catch (e) { setErr(errorText(e)); await refresh().catch(() => {}); return false; }
    finally { setBusy(null); }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const answeredAll = questions.every((q) => answers[q.id] && answers[q.id] !== "UNKNOWN");
  const localBlock = view.local.issuedInvoiceCount > 0 || (f.returnType === "GSTR3B" && view.local.inwardSupplyCount > 0);

  // ---- demo simulator helpers (codes are generated in the browser only and never sent to the server) ----
  const rand = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => String(x % 10)).join("");
  const simSendInitiation = async () => {
    if (!view.sms) return;
    const ok = await act("init", "initiation-sent");
    if (!ok) return;
    const c = rand(6);
    setSim({ code: c, log: [{ from: "phone", text: view.sms.body }, { from: "gstn", text: `DEMO: ${c} is the CODE for Nil filing of ${code} for ${f.gstin} for period ${f.periodKey}. Code validity is ${gstn.validity} min. Confirm return filing by sending: CNF ${code} <CODE> to 14409` }] });
  };
  const simSendConfirmation = async () => {
    const ok = await act("conf", "confirmation-sent");
    if (!ok) return;
    const demoArn = `DEMO-AA${f.gstin.slice(0, 2)}${f.periodKey.slice(0, 2)}${f.periodKey.slice(4)}${rand(7)}`;
    setArn(demoArn);
    setSim((s) => ({ ...s, arn: demoArn, log: [...s.log, { from: "phone", text: `CNF ${code} ${s.code}` }, { from: "gstn", text: `DEMO: Your ${rt} for ${f.periodKey} is filed. ARN ${demoArn}. (Simulated — nothing was filed.)` }] }));
  };

  const smsHref = useMemo(() => (view.sms ? smsComposerUri(view.sms.to, view.sms.body, platform) : "#"), [view.sms, platform]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Header */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">GST Return — {view.period.label}</p>
            <h1 className="text-2xl font-bold">{rt} nil filing</h1>
          </div>
          <FilingStatusBadge status={status} label={fsLabel(status)} demo={f.isDemo} />
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Business</dt><dd className="font-medium">{view.business.legalName}</dd></div>
          <div><dt className="text-xs text-muted">GSTIN</dt><dd className="font-mono">{maskedGstin}</dd></div>
          <div><dt className="text-xs text-muted">Filing frequency</dt><dd>{view.business.filingFrequency === "MONTHLY" ? "Monthly" : "Quarterly"} · period {f.periodKey}</dd></div>
        </dl>
        {f.isDemo && <Alert tone="demo" className="mt-3" title="DEMO — NOT GOVERNMENT FILED">This is a simulation with fictional data. GSTN replies below are generated in your browser. No SMS is sent and nothing is filed.</Alert>}
      </Card>

      {err && <Alert tone="danger">{err}</Alert>}

      {/* Step A: eligibility */}
      {reviewable && (
        <>
          <Card>
            <CardTitle className="mb-1">{L.nil_local_checks}</CardTitle>
            <p className="mb-3 text-xs text-muted">Absence of records in Compte is not proof of a nil return — you'll be asked about activity outside Compte too.</p>
            <ul className="space-y-2 text-sm">
              <CheckRow ok={view.local.issuedInvoiceCount === 0} text={view.local.issuedInvoiceCount ? `${view.local.issuedInvoiceCount} issued invoice(s) in ${view.period.label} — outward supplies exist` : "No invoices issued in Compte for this period"} />
              {view.local.draftInvoiceCount > 0 && <CheckRow warn text={`${view.local.draftInvoiceCount} draft invoice(s) dated in this period — issue or discard them first`} />}
              {f.returnType === "GSTR3B" && <CheckRow ok={view.local.inwardSupplyCount === 0} text={view.local.inwardSupplyCount ? `${view.local.inwardSupplyCount} purchase record(s) in this period${view.local.reverseChargeInwardCount ? `, ${view.local.reverseChargeInwardCount} under reverse charge` : ""} — GSTR-3B is not nil` : "No purchases recorded in Compte for this period"} />}
            </ul>
            {localBlock && <Alert tone="danger" className="mt-3" title={L.nil_ineligible}>Your declarations cannot override activity recorded in Compte. Prepare a regular {rt} instead{f.returnType === "GSTR1" ? <> — <Link className="font-semibold underline" href={`/returns/${f.periodKey}`}>open GSTR-1 preparation</Link></> : " with your accountant"}.</Alert>}
          </Card>

          <Card>
            <CardTitle className="mb-3">{L.nil_questions}</CardTitle>
            <ol className="space-y-4">
              {questions.map((q, i) => (
                <li key={q.id}>
                  <p className="text-[15px] font-medium leading-snug">{i + 1}. {q.text}</p>
                  {q.text !== q.textEn && <p className="mt-0.5 text-xs text-muted">{q.textEn}</p>}
                  <p className="mt-1 flex flex-wrap gap-1">
                    {q.checkWhere === "GST_PORTAL" && <Badge tone="warn">Check on GST portal</Badge>}
                    {q.checkWhere === "YOUR_PHONE" && <Badge tone="info"><Phone className="size-3" />Your phone</Badge>}
                    {q.conservative && <Badge>Compte is cautious here</Badge>}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={q.textEn}>
                    {(["YES", "NO", "UNKNOWN"] as Tri[]).map((a) => (
                      <button key={a} type="button" role="radio" aria-checked={answers[q.id] === a} data-q={q.id} data-a={a}
                        onClick={() => setAnswers((s) => ({ ...s, [q.id]: a }))}
                        className={cn("h-11 rounded-xl border text-sm font-semibold", answers[q.id] === a ? (a === "UNKNOWN" ? "border-warn-600 bg-warn-50 text-warn-600" : "border-brand-600 bg-brand-600 text-white") : "border-line bg-white")}>
                        {a === "YES" ? L.nil_yes : a === "NO" ? L.nil_no : L.nil_unknown}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardTitle className="mb-2">{L.nil_declaration}</CardTitle>
            <label className="flex items-start gap-3 text-[15px] leading-snug">
              <input type="checkbox" className="mt-1 size-5 shrink-0 accent-brand-600" checked={declared} onChange={(e) => setDeclared(e.target.checked)} data-testid="declaration" />
              <span>{declaration}</span>
            </label>
            {!answeredAll && <p className="mt-3 text-xs text-warn-600">Answer every question with Yes or No. “Not sure” keeps nil filing blocked until you check.</p>}
            <Button size="lg" className="mt-4 w-full" disabled={!!busy} onClick={async () => { const ok = await act("assess", "assess", { answers, declarationAccepted: declared }); if (ok) setReReview(false); }}>
              {busy === "assess" && <Loader2 className="size-4 animate-spin" />}{L.nil_save_assessment}
            </Button>
          </Card>

          {outcome && !(status === "REJECTED") && <OutcomePanel outcome={outcome} checks={checks} L={L} rt={rt} periodKey={f.periodKey} returnType={f.returnType} />}
        </>
      )}

      {/* Step B: explicit irreversible confirmation */}
      {status === "ELIGIBLE_SELF_DECLARED" && (
        <Card className="border-brand-200">
          <CardTitle className="mb-2 flex items-center gap-2"><ShieldCheck className="size-5 text-brand-600" />Before you file</CardTitle>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>You will send the SMS yourself from the authorised signatory&apos;s mobile registered on the GST portal{maskedPhone ? ` (Compte has ${maskedPhone} on record — ${view.business.phoneIsGstnRegistered === "DECLARED_YES" ? "you declared it is registered" : "not declared as registered"})` : ""}.</li>
            <li>A filed nil return cannot be revised.</li>
            <li>Compte does not send anything to GSTN and never asks for your verification code.</li>
          </ul>
          <label className="flex items-start gap-3 text-[15px] font-medium">
            <input type="checkbox" className="mt-1 size-5 shrink-0 accent-brand-600" checked={irrev} onChange={(e) => setIrrev(e.target.checked)} data-testid="irreversible" />
            <span>{L.nil_irreversible}</span>
          </label>
          <Button size="lg" className="mt-4 w-full" disabled={!irrev || !!busy} onClick={() => act("prepare", "prepare", { irreversibleAck: true })}>{busy === "prepare" && <Loader2 className="size-4 animate-spin" />}{L.nil_show_sms}</Button>
        </Card>
      )}

      {/* Step C: send initiation SMS */}
      {status === "READY_FOR_GOVERNMENT_SMS" && view.sms && (
        <Card className="border-brand-200">
          <CardTitle className="mb-3">{L.nil_step_send}</CardTitle>
          <SmsBox to={view.sms.to} body={view.sms.body} L={L} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" size="lg" onClick={() => copy(view.sms!.body)}><Copy className="size-4" />{copied ? L.nil_copied : L.nil_copy}</Button>
            <a href={smsHref} className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"><MessageSquare className="size-5" />{L.nil_open_sms}</a>
          </div>
          <p className="mt-2 text-xs text-muted">“{L.nil_open_sms}” works on phones; some SMS apps ignore the prefilled text — if so, paste the copied message. Send to <b>14409</b> only.</p>
          <FeaturePhoneHelp L={L} sms={view.sms} code={code} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {f.isDemo
              ? <Button size="lg" onClick={simSendInitiation} disabled={!!busy}>{busy === "init" && <Loader2 className="size-4 animate-spin" />}Simulate sending (DEMO)</Button>
              : <Button size="lg" onClick={() => act("init", "initiation-sent")} disabled={!!busy}>{L.nil_sent_initiation}</Button>}
            <Button variant="ghost" onClick={() => act("cancel", "cancel")} disabled={!!busy}>I haven&apos;t sent it — go back</Button>
          </div>
        </Card>
      )}

      {/* Step D: confirmation */}
      {status === "INITIATION_SENT_USER_REPORTED" && (
        <Card className="border-brand-200">
          <CardTitle className="mb-2">{L.nil_step_confirm}</CardTitle>
          <p className="text-[15px] leading-relaxed">{L.nil_confirm_explain}</p>
          <div className="mt-3 rounded-xl bg-ink px-4 py-3 font-mono text-lg tracking-wide text-white" data-testid="cnf-template">{view.confirmationTemplate}</div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Replace &lt;6-digit code&gt; with the code from GSTN&apos;s SMS. Code is valid {gstn.validity} minutes and works once.</li>
            <li>{gstn.maxWrong}+ wrong codes in a day block SMS filing for that GSTIN and number for 24 hours.</li>
            <li>Code expired? Send the NIL SMS again after waiting at least {gstn.resendWait} minutes.</li>
            <li><b>Do not type the code into Compte.</b> Compte never stores it.</li>
          </ul>
          {view.sms && <FeaturePhoneHelp L={L} sms={view.sms} code={code} />}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {f.isDemo
              ? <Button size="lg" onClick={simSendConfirmation} disabled={!!busy || !sim.code}>{busy === "conf" && <Loader2 className="size-4 animate-spin" />}Simulate CNF reply (DEMO)</Button>
              : <Button size="lg" onClick={() => act("conf", "confirmation-sent")} disabled={!!busy}>{L.nil_sent_confirmation}</Button>}
            <Button variant="danger" onClick={() => setShowReject(true)}>{L.nil_rejected_btn}</Button>
          </div>
          {f.isDemo && !sim.code && <p className="mt-2 text-xs text-muted">Demo state was reset by a page reload — use “GSTN replied with an error” to restart, or continue from a fresh demo.</p>}
        </Card>
      )}

      {/* Step E: record ARN */}
      {status === "AWAITING_GOVERNMENT_CONFIRMATION" && (
        <Card className="border-brand-200">
          <CardTitle className="mb-2">{L.nil_step_arn}</CardTitle>
          <p className="mb-3 text-sm text-muted">GSTN sends the ARN by SMS (and to the primary signatory&apos;s email) after a successful filing. Copy it here exactly.</p>
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); act("arn", "arn", { arn }); }}>
            <Input aria-label={L.nil_arn_label} placeholder={f.isDemo ? "DEMO-…" : "e.g. AA27…"} className="font-mono uppercase" value={arn} onChange={(e) => setArn(e.target.value.toUpperCase())} required />
            <Button type="submit" size="lg" disabled={!!busy || arn.length < 6}>{busy === "arn" && <Loader2 className="size-4 animate-spin" />}{L.nil_record_arn}</Button>
          </form>
          <Button variant="danger" className="mt-3" onClick={() => setShowReject(true)}>{L.nil_rejected_btn}</Button>
        </Card>
      )}

      {/* Rejection */}
      {showReject && ["INITIATION_SENT_USER_REPORTED", "AWAITING_GOVERNMENT_CONFIRMATION"].includes(status) && (
        <Card>
          <CardTitle className="mb-2">What did GSTN reply?</CardTitle>
          <p className="mb-2 text-xs text-muted">Describe the error (e.g. “Invalid or expired code”, “saved data exists”). Do not paste any verification code.</p>
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); if (await act("rej", "rejected", { reason: rejectReason })) setShowReject(false); }}>
            <Input aria-label="GSTN error" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required minLength={3} />
            <Button type="submit" variant="danger" disabled={!!busy}>Record error</Button>
          </form>
          <p className="mt-2 text-xs"><a className="font-semibold text-brand-700 underline" href={gstn.troubleshooting} target="_blank" rel="noreferrer">GSTN troubleshooting guide</a></p>
        </Card>
      )}
      {status === "REJECTED" && !reReview && (
        <Card>
          <Alert tone="danger" title={fsLabel("REJECTED")}>{f.rejectionReason}</Alert>
          <p className="mt-3 text-sm text-muted">Nothing was filed. Fix the cause (or file on the portal), then review eligibility again.</p>
          <Button className="mt-3" onClick={() => setReReview(true)}>Review eligibility again</Button>
        </Card>
      )}

      {/* Done (ARN recorded) */}
      {(status === "ARN_RECORDED_UNVERIFIED" || status === "FILED_VERIFIED") && (
        <Card className="border-warn-600/30">
          <div className="flex items-center gap-2">{status === "FILED_VERIFIED" ? <CheckCircle2 className="size-6 text-brand-600" /> : <Clock className="size-6 text-warn-600" />}<CardTitle>{fsLabel(status)}</CardTitle></div>
          <p className="mt-3 text-sm text-muted">{L.nil_arn_label}</p>
          <p className="font-mono text-xl font-bold" data-testid="arn-value">{f.arn}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge tone={f.arnVerificationStatus === "VERIFIED" ? "brand" : "warn"}>{f.arnVerificationStatus === "VERIFIED" ? "Verified from official source" : "Not verified by Compte"}</Badge>
            {f.isDemo && <Badge tone="demo">DEMO — NOT GOVERNMENT FILED</Badge>}
          </div>
          <Alert tone="warn" className="mt-3">{L.nil_arn_unverified_note}</Alert>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a href={gstn.portalUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 font-semibold"><ExternalLink className="size-4" />{L.nil_verify_portal}</a>
            <a href={`/api/nil-filings/${f.id}/report`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 font-semibold text-white"><Download className="size-4" />{L.nil_report}</a>
          </div>
        </Card>
      )}

      {/* Demo phone */}
      {f.isDemo && sim.log.length > 0 && (
        <Card className="bg-demo/40">
          <CardTitle className="mb-2 flex items-center gap-2"><Smartphone className="size-5" />Simulated phone — DEMO</CardTitle>
          <div className="space-y-2">
            {sim.log.map((m, i) => (
              <div key={i} className={cn("max-w-[90%] rounded-2xl px-3 py-2 font-mono text-[13px]", m.from === "phone" ? "ml-auto bg-ink text-white" : "bg-white ring-1 ring-line")}>
                <p className="mb-0.5 font-sans text-[10px] font-bold uppercase opacity-70">{m.from === "phone" ? "You → 14409 (simulated)" : "14409 (simulated reply)"}</p>{m.text}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">The demo code above exists only in this browser tab. Compte&apos;s server never receives it.</p>
        </Card>
      )}

      {/* Evidence timeline */}
      {view.evidence.length > 0 && (
        <Card>
          <CardTitle className="mb-2">Activity record</CardTitle>
          <ul className="space-y-1.5 text-sm">
            {view.evidence.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                <time className="text-xs text-muted">{new Date(e.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                <span>{e.summary}</span>
                <Badge tone={e.source === "DEMO_SIMULATOR" ? "demo" : e.source === "COMPTE_LEDGER" ? "brand" : "info"}>{e.source.replace(/_/g, " ").toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
          <a href={`/api/nil-filings/${f.id}/report`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700"><Download className="size-4" />{L.nil_report}</a>
        </Card>
      )}

      <p className="text-center text-xs text-muted">
        Official reference: <a className="underline" href={gstn.faq} target="_blank" rel="noreferrer">GSTN nil filing by SMS FAQ</a> · help SMS: <span className="font-mono">{view.helpSms}</span> to 14409
      </p>
    </div>
  );
}

function CheckRow({ ok, warn, text }: { ok?: boolean; warn?: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2">
      {warn ? <CircleHelp className="mt-0.5 size-4 shrink-0 text-warn-600" /> : ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-600" />}
      <span>{text}</span>
    </li>
  );
}

function OutcomePanel({ outcome, checks, L, rt, periodKey, returnType }: { outcome: string; checks: EligibilityCheck[]; L: Record<MessageKey, string>; rt: string; periodKey: string; returnType: string }) {
  const fail = checks.filter((c) => c.result === "FAIL");
  const review = checks.filter((c) => c.result === "REVIEW");
  const unknown = checks.filter((c) => c.result === "UNKNOWN");
  const tone = outcome === "ELIGIBLE_SELF_DECLARED" ? "brand" : outcome === "INELIGIBLE" ? "danger" : "warn";
  const title = outcome === "ELIGIBLE_SELF_DECLARED" ? L.nil_eligible : outcome === "INELIGIBLE" ? L.nil_ineligible : outcome === "NEEDS_MANUAL_REVIEW" ? L.nil_manual : L.nil_incomplete;
  return (
    <Card data-testid="outcome" data-outcome={outcome}>
      <Alert tone={tone} title={title}>
        {outcome === "INELIGIBLE" && <>Nil filing is disabled for {rt}. Prepare a regular return{returnType === "GSTR1" ? <> (<Link className="underline" href={`/returns/${periodKey}`}>GSTR-1 preparation</Link>)</> : ""} or contact your accountant.</>}
        {outcome === "INCOMPLETE" && <>Eligibility is <b>unverified</b>. Compte blocks the SMS step until every item is answered.</>}
        {outcome === "NEEDS_MANUAL_REVIEW" && <>Something needs a closer look before nil filing. Resolve it or ask your accountant.</>}
        {outcome === "ELIGIBLE_SELF_DECLARED" && <>Based on Compte&apos;s checks and <b>your declarations</b>. The GST portal remains the authority.</>}
      </Alert>
      {[...fail, ...review, ...unknown].length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {[...fail, ...review, ...unknown].map((c) => (
            <li key={c.id} className="flex flex-wrap items-start gap-2">
              {c.result === "FAIL" ? <XCircle className="mt-0.5 size-4 text-danger-600" /> : <CircleHelp className="mt-0.5 size-4 text-warn-600" />}
              <span className="flex-1">{c.label}{c.detail ? <span className="block text-xs text-muted">{c.detail}</span> : null}</span>
              <Badge tone={SOURCE_BADGE[c.source]?.tone ?? "neutral"}>{SOURCE_BADGE[c.source]?.label ?? c.source}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SmsBox({ to, body, L }: { to: string; body: string; L: Record<MessageKey, string> }) {
  return (
    <div className="rounded-2xl bg-ink p-4 text-white">
      <p className="text-xs uppercase tracking-wide text-white/60">{L.nil_to}</p>
      <p className="font-mono text-2xl font-bold tracking-wider" data-testid="sms-to">{to}</p>
      <p className="mt-3 text-xs uppercase tracking-wide text-white/60">SMS</p>
      <p className="break-words font-mono text-[17px] font-bold leading-relaxed tracking-wide sm:text-xl" data-testid="sms-body">{body}</p>
    </div>
  );
}

function FeaturePhoneHelp({ L, sms, code }: { L: Record<MessageKey, string>; sms: { to: string; body: string }; code: string }) {
  return (
    <details className="mt-3 rounded-xl bg-canvas p-3 text-sm">
      <summary className="cursor-pointer font-semibold">{L.nil_feature_phone}</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 font-mono text-[13px] leading-relaxed">
        <li>Messages → New message</li>
        <li>To: {sms.to}</li>
        <li>Type exactly: {sms.body}</li>
        <li>Send. Wait for a 6-digit code.</li>
        <li>New message to {sms.to}: CNF {code} (space) code</li>
        <li>Wait for the ARN. Write it down.</li>
      </ol>
    </details>
  );
}
