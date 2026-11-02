"use client";
import { LogOut } from "lucide-react";
export function LogoutButton({ label }: { label: string }) {
  return (
    <button
      className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-black/5"
      onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
    >
      <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
