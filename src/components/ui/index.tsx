import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...c: ClassValue[]) {
  return twMerge(clsx(c));
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-200",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  outline: "border border-line bg-white text-ink hover:bg-canvas",
  ghost: "text-ink hover:bg-black/5",
  danger: "bg-danger-50 text-danger-600 hover:bg-red-100",
};
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-14 px-6 text-base" };

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button className={cn("inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60", variants[variant], sizes[size], className)} {...p} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={cn("inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors", variants[variant], sizes[size], className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-[#e8ebe5] bg-white p-4 sm:p-5", className)} {...p} />;
}

export function CardTitle({ className, ...p }: ComponentProps<"h2">) {
  return <h2 className={cn("text-[15px] font-semibold tracking-[-0.02em] text-ink", className)} {...p} />;
}

export function Label({ className, ...p }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-semibold text-ink", className)} {...p} />;
}

const field = "w-full rounded-xl border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-canvas";
export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(field, "h-11", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(field, "py-2.5", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(field, "h-11 pr-8", className)} {...p} />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-danger-600">{error}</p>}
    </div>
  );
}

type Tone = "neutral" | "brand" | "warn" | "danger" | "demo" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-black/5 text-ink",
  brand: "bg-brand-50 text-brand-700",
  warn: "bg-warn-50 text-warn-600",
  danger: "bg-danger-50 text-danger-600",
  demo: "bg-demo text-danger-600",
  info: "bg-sky-50 text-sky-800",
};
export function Badge({ tone = "neutral", className, ...p }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} {...p} />;
}

export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl px-4 py-3 text-sm", tones[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-1", "leading-relaxed")}>{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.05em] text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="tabular mt-3 text-[28px] font-semibold tracking-[-0.055em] text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
