"use client";
import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api, errorText } from "@/lib/client-api";

export function AuthForm({ mode, demo }: { mode: "login" | "signup"; demo?: { email: string; password: string } | null }) {
  const [email, setEmail] = useState(demo?.email ?? "");
  const [password, setPassword] = useState(demo?.password ?? "");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-6">
      <h1 className="mb-1 text-2xl font-bold">{mode === "login" ? "Log in" : "Create your account"}</h1>
      <p className="mb-5 text-sm text-muted">{mode === "login" ? "Your books and GST returns, in one place." : "Next, you'll add your business and GST details."}</p>
      {demo && mode === "login" && (
        <Alert tone="demo" className="mb-4" title="Demo mode">
          Fictional demo account prefilled: <span className="font-mono">{demo.email}</span> / <span className="font-mono">{demo.password}</span>
        </Alert>
      )}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ next: string }>(`/api/auth/${mode}`, { body: mode === "login" ? { email, password } : { name, email, password } });
            window.location.href = r.next;
          } catch (e2) {
            setErr(errorText(e2));
            setBusy(false);
          }
        }}
      >
        {mode === "signup" && <Field label="Your name" htmlFor="name"><Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>}
        <Field label="Email" htmlFor="email"><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 10 characters" : undefined}>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
        </Field>
        {err && <Alert tone="danger">{err}</Alert>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? <>New here? <Link className="font-semibold text-brand-700" href="/signup">Create an account</Link></> : <>Have an account? <Link className="font-semibold text-brand-700" href="/login">Log in</Link></>}
      </p>
    </Card>
  );
}
