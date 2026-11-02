import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "./globals.css";
import { brand } from "@/lib/config/brand";

const noto = localFont({
  src: [
    { path: "./fonts/NotoSansDevanagari_400Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/NotoSansDevanagari_700Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-noto",
  display: "swap",
});

export const metadata: Metadata = { title: `${brand.name} — ${brand.tagline}`, description: brand.shortDescription };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f6f5c" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get("compte_lang")?.value ?? "en";
  return (
    <html lang={lang === "hi" ? "hi" : lang === "mr" ? "mr" : "en-IN"} className={noto.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
