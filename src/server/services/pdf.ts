import "server-only";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import { brand } from "@/lib/config/brand";
import { formatIndianNumber } from "@/lib/domain/money";
import { formatDateIN } from "@/lib/domain/periods";
import { STATUS_LABEL, type FilingStatus } from "@/lib/domain/filing-state";
import { stateName } from "@/lib/domain/states";
import type { InvoiceSnapshot } from "./invoices";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
// Noto Sans Devanagari covers Latin, Devanagari and ₹, so names in any of our languages render.

const INK = "#1c2321", MUTED = "#5d6b66", LINE = "#d9e0dd", ACCENT = "#1f6f5c", SOFT = "#eef4f1";

function resolveFont(name: string): Buffer | null {
  // Output-file tracing may place assets at a different root inside Vercel.
  const locations = [
    path.join(FONT_DIR, name),
    path.join("/var/task/assets/fonts", name),
    path.join(process.cwd(), ".next/server/assets/fonts", name),
    path.join(process.cwd(), ".next/assets/fonts", name),
  ];
  for (const location of locations) {
    try { if (existsSync(location)) return readFileSync(location); } catch { /* try next location */ }
  }
  console.error("[compte:pdf] Font unavailable in runtime bundle:", name, "cwd:", process.cwd());
  return null;
}

function newDoc(title: string) {
  const doc = new PDFDocument({ size: "A4", margin: 36, info: { Title: title, Producer: brand.name, Creator: brand.name } });
  const regular = resolveFont("NotoSansDevanagari_400Regular.ttf");
  const bold = resolveFont("NotoSansDevanagari_700Bold.ttf");
  if (!regular || !bold) throw new Error("PDF_RUNTIME_FONTS_MISSING");
  doc.registerFont("R", regular);
  doc.registerFont("B", bold);
  doc.font("R").fillColor(INK);
  return doc;
}

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

const inr = (v: string) => formatIndianNumber(v);

async function renderInvoicePdfFull(s: InvoiceSnapshot, cancelled = false): Promise<Buffer> {
  const doc = newDoc(`Tax Invoice ${s.invoiceNumber}`);
  const W = doc.page.width - 72;
  const X = 36;
  if (cancelled) {
    doc.save().rotate(-30, { origin: [300, 420] }).font("B").fontSize(46)
      .fillColor("#c33030").opacity(0.18).text("CANCELLED", 50, 360, { width: 500, align: "center" }).restore();
    doc.opacity(1);
  }

  if (s.isDemo) {
    doc.save().rotate(-30, { origin: [300, 420] }).font("B").fontSize(54).fillColor("#e8b4b4").opacity(0.35).text("DEMO — FICTIONAL", 60, 380, { width: 500, align: "center" }).restore();
    doc.opacity(1);
  }

  // Header
  doc.rect(X, 36, W, 4).fill(ACCENT);
  doc.font("B").fontSize(18).fillColor(INK).text("TAX INVOICE", X, 50);
  doc.font("R").fontSize(8).fillColor(MUTED).text("Original for recipient", X, 72);
  doc.font("B").fontSize(11).fillColor(INK).text(s.supplier.legalName, X + W / 2, 50, { width: W / 2, align: "right" });
  doc.font("R").fontSize(8.5).fillColor(MUTED)
    .text(s.supplier.tradeName ? `Trade name: ${s.supplier.tradeName}` : "", X + W / 2, 65, { width: W / 2, align: "right" })
    .text(s.supplier.address, { width: W / 2, align: "right" })
    .text(`${s.supplier.stateName} (${s.supplier.stateCode})`, { width: W / 2, align: "right" })
    .fillColor(INK).font("B").text(`GSTIN: ${s.supplier.gstin}`, { width: W / 2, align: "right" })
    .font("R").fillColor(MUTED).text(`${s.supplier.phone} · ${s.supplier.email}`, { width: W / 2, align: "right" });

  // Meta + parties
  let y = 140;
  doc.roundedRect(X, y, W, 104, 6).fill(SOFT);
  const col = (W - 24) / 3;
  const block = (cx: number, title: string, lines: [string, boolean?][]) => {
    doc.font("B").fontSize(7.5).fillColor(ACCENT).text(title.toUpperCase(), cx, y + 10, { width: col });
    let yy = y + 24;
    for (const [t, bold] of lines) {
      if (!t) continue;
      doc.font(bold ? "B" : "R").fontSize(8.5).fillColor(INK);
      const h = doc.heightOfString(t, { width: col });
      doc.text(t, cx, yy, { width: col });
      yy += h + 1;
    }
  };
  block(X + 12, "Invoice details", [
    [`Invoice no: ${s.invoiceNumber}`, true],
    [`Date: ${formatDateIN(s.invoiceDate)}`],
    [`Place of supply: ${s.placeOfSupply.stateName} (${s.placeOfSupply.stateCode})`],
    [`Supply: ${s.supplyType === "INTRA" ? "Intra-state" : "Inter-state"}`],
    ["Tax payable on reverse charge: No"],
  ]);
  block(X + 12 + col, "Bill to", [
    [s.recipient.name, true],
    [s.recipient.billingAddress],
    [`${s.recipient.stateName} (${s.recipient.stateCode})`],
    [s.recipient.gstin ? `GSTIN: ${s.recipient.gstin}` : "Unregistered recipient", !!s.recipient.gstin],
  ]);
  block(X + 12 + col * 2, "Ship to", s.recipient.shippingAddress
    ? [[s.recipient.name, true], [s.recipient.shippingAddress], [s.recipient.shippingStateCode ? `${stateName(s.recipient.shippingStateCode)} (${s.recipient.shippingStateCode})` : ""]]
    : [["Same as billing address"]]);

  // Items table
  y = 258;
  const intra = s.supplyType === "INTRA";
  const cols = intra
    ? [{ h: "#", w: 16, a: "left" }, { h: "Description", w: 120, a: "left" }, { h: "HSN/SAC", w: 44, a: "left" }, { h: "Qty", w: 34, a: "right" }, { h: "Rate ₹", w: 52, a: "right" }, { h: "Taxable ₹", w: 62, a: "right" }, { h: "GST%", w: 30, a: "right" }, { h: "CGST ₹", w: 50, a: "right" }, { h: `${s.stateTaxLabel} ₹`, w: 50, a: "right" }, { h: "Total ₹", w: 65, a: "right" }]
    : [{ h: "#", w: 16, a: "left" }, { h: "Description", w: 150, a: "left" }, { h: "HSN/SAC", w: 48, a: "left" }, { h: "Qty", w: 40, a: "right" }, { h: "Rate ₹", w: 56, a: "right" }, { h: "Taxable ₹", w: 68, a: "right" }, { h: "GST%", w: 32, a: "right" }, { h: "IGST ₹", w: 58, a: "right" }, { h: "Total ₹", w: 55, a: "right" }];
  const scale = W / cols.reduce((a, c) => a + c.w, 0);
  cols.forEach((c) => (c.w *= scale));
  const row = (cells: string[], yy: number, bold = false) => {
    let cx = X;
    let maxH = 0;
    cells.forEach((t, i) => {
      doc.font(bold ? "B" : "R").fontSize(8).fillColor(INK);
      const h = doc.heightOfString(t, { width: cols[i].w - 6 });
      maxH = Math.max(maxH, h);
      doc.text(t, cx + 3, yy, { width: cols[i].w - 6, align: cols[i].a as "left" | "right" });
      cx += cols[i].w;
    });
    return maxH;
  };
  doc.rect(X, y, W, 20).fill(ACCENT);
  doc.fillColor("#ffffff");
  let cx = X;
  cols.forEach((c) => { doc.font("B").fontSize(7.5).fillColor("#ffffff").text(c.h, cx + 3, y + 6, { width: c.w - 6, align: c.a as "left" | "right" }); cx += c.w; });
  y += 26;
  for (const l of s.lines) {
    const cells = intra
      ? [String(l.position), l.description, l.hsnSac, `${l.quantity} ${l.unit}`, inr(l.unitPrice) + (l.priceIncludesTax ? "*" : ""), inr(l.taxableValue), l.gstRate, inr(l.cgst), inr(l.sgst), inr(l.lineTotal)]
      : [String(l.position), l.description, l.hsnSac, `${l.quantity} ${l.unit}`, inr(l.unitPrice) + (l.priceIncludesTax ? "*" : ""), inr(l.taxableValue), l.gstRate, inr(l.igst), inr(l.lineTotal)];
    const h = row(cells, y);
    y += h + 8;
    doc.moveTo(X, y - 4).lineTo(X + W, y - 4).strokeColor(LINE).lineWidth(0.5).stroke();
    if (y > 640) { doc.addPage(); y = 50; }
  }
  if (s.lines.some((l) => l.priceIncludesTax)) {
    doc.font("R").fontSize(7).fillColor(MUTED).text("* Rate entered inclusive of GST; taxable value derived.", X, y);
    y += 12;
  }

  // Totals
  y += 6;
  const tW = 220, tX = X + W - tW;
  const tl = (label: string, val: string, bold = false) => {
    doc.font(bold ? "B" : "R").fontSize(bold ? 10.5 : 9).fillColor(INK).text(label, tX, y, { width: tW - 90 }).text(val, tX + tW - 100, y, { width: 100, align: "right" });
    y += bold ? 18 : 14;
  };
  tl("Taxable value", `₹${inr(s.totals.taxableTotal)}`);
  if (intra) { tl("CGST", `₹${inr(s.totals.cgstTotal)}`); tl(s.stateTaxLabel, `₹${inr(s.totals.sgstTotal)}`); }
  else tl("IGST", `₹${inr(s.totals.igstTotal)}`);
  doc.moveTo(tX, y).lineTo(tX + tW, y).strokeColor(ACCENT).lineWidth(1).stroke();
  y += 6;
  tl("Grand total", `₹${inr(s.totals.grandTotal)}`, true);
  doc.font("R").fontSize(8.5).fillColor(MUTED).text(s.amountInWords, X, y - 30, { width: W - tW - 16 });

  // Footer: declaration + signature
  y = Math.max(y + 20, 660);
  if (y > 740) { doc.addPage(); y = 60; }
  doc.font("B").fontSize(8).fillColor(INK).text("Declaration", X, y);
  doc.font("R").fontSize(7.5).fillColor(MUTED).text("We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.", X, y + 11, { width: W / 2 });
  doc.font("B").fontSize(8.5).fillColor(INK).text(`For ${s.supplier.legalName}`, X + W / 2, y, { width: W / 2, align: "right" });
  doc.font("R").fontSize(8).fillColor(MUTED).text("Authorised Signatory", X + W / 2, y + 40, { width: W / 2, align: "right" })
    .fillColor(INK).text(`${s.signatory.name}, ${s.signatory.designation}`, { width: W / 2, align: "right" });
  doc.font("R").fontSize(6.5).fillColor(MUTED).text(
    `Generated by ${brand.name} from the issued invoice record (issued ${new Date(s.issuedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST). Not an e-invoice: no IRN/QR from the Invoice Registration Portal.${s.isDemo ? " DEMO DATA — FICTIONAL BUSINESS." : ""}`,
    X, 800, { width: W, align: "center" },
  );
  return toBuffer(doc);
}

/**
 * A robust emergency PDF path for serverless font/PDFKit rendering failures.
 * All financial and supplier/buyer fields remain visible; names in scripts outside
 * Helvetica's encoding may need correction, hence the prominent warning.
 */
async function renderInvoicePdfFallback(s: InvoiceSnapshot, cancelled: boolean): Promise<Buffer> {
  const doc = new PDFDocument({size:"A4",margin:42,info:{Title:`Tax Invoice ${s.invoiceNumber}`,Producer:brand.name}});
  const usable = (value: unknown) => String(value ?? "").replace(/[^\x20-\x7E]/g,"?");
  const write = (label:string, value:unknown) => {
    if (doc.y > 710) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(9).text(label,{continued:true});
    doc.font("Helvetica").fontSize(9).text(" "+usable(value));
    doc.moveDown(0.25);
  };
  doc.font("Helvetica-Bold").fontSize(18).text(cancelled?"CANCELLED INVOICE COPY":"TAX INVOICE");
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#a33528").text("Simplified PDF copy - check customer names and script characters against the original record.");
  doc.fillColor("#222222").moveDown(0.8);
  write("Invoice number:",s.invoiceNumber);
  write("Invoice date:",s.invoiceDate);
  write("Supplier:",s.supplier.legalName);
  write("Supplier GSTIN:",s.supplier.gstin);
  write("Supplier address:",s.supplier.address);
  write("Customer:",s.recipient.name);
  write("Customer GSTIN:",s.recipient.gstin ?? "Unregistered");
  write("Customer address:",s.recipient.billingAddress);
  write("Place of supply:",`${s.placeOfSupply.stateName} (${s.placeOfSupply.stateCode})`);
  write("Supply:",s.supplyType === "INTRA" ? "Intra-state" : "Inter-state");
  doc.moveDown(0.6).font("Helvetica-Bold").fontSize(11).text("ITEMS");
  for(const line of s.lines) {
    if(doc.y>690)doc.addPage();
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(9).text(`${line.position}. ${usable(line.description)}  [HSN/SAC ${usable(line.hsnSac)}]`);
    doc.font("Helvetica").fontSize(9).text(`Qty: ${usable(line.quantity)} ${usable(line.unit)}, rate: INR ${line.unitPrice}, GST: ${line.gstRate}%, taxable: INR ${line.taxableValue}, line total: INR ${line.lineTotal}`);
    doc.fontSize(8).text(`CGST: INR ${line.cgst}, SGST/UTGST: INR ${line.sgst}, IGST: INR ${line.igst}`);
  }
  if(doc.y>650)doc.addPage();
  doc.moveDown(1).font("Helvetica-Bold").fontSize(11).text("TOTALS");
  for(const [label,val] of [
    ["Taxable value",s.totals.taxableTotal],["CGST",s.totals.cgstTotal],["SGST/UTGST",s.totals.sgstTotal],
    ["IGST",s.totals.igstTotal],["Grand total",s.totals.grandTotal]
  ])write(label,`INR ${val}`);
  write("Amount in words:",s.amountInWords);
  write("Authorised signatory:",s.signatory.name);
  if(s.isDemo) doc.font("Helvetica-Bold").fontSize(10).text("DEMO - NOT A REAL INVOICE");
  if(cancelled)doc.font("Helvetica-Bold").fontSize(10).text("CANCELLED - FOR RECORDS ONLY");
  return toBuffer(doc);
}

export async function renderInvoicePdf(s: InvoiceSnapshot, cancelled = false): Promise<Buffer> {
  try {
    return await renderInvoicePdfFull(s, cancelled);
  } catch (e) {
    // Log the exact cause in Vercel, not to the browser or PDF URL.
    console.error("[compte:pdf] Full invoice PDF render failed; using fallback:",e);
    return renderInvoicePdfFallback(s,cancelled);
  }
}

export interface FilingReportData {
  filing: { id: string; returnType: string; periodKey: string; financialYear: string; filingFrequency: string; status: string; isDemo: boolean; arn: string | null; arnVerificationStatus: string; declarationAt: Date | null; irreversibleAckAt: Date | null; initiationReportedAt: Date | null; confirmationReportedAt: Date | null; arnRecordedAt: Date | null; rejectionReason: string | null; createdAt: Date; updatedAt: Date };
  periodLabel: string;
  business: { legalName: string; gstin: string };
  checks: { label: string; source: string; result: string; detail?: string }[];
  evidence: { createdAt: Date; kind: string; source: string; summary: string }[];
}

export async function renderFilingReportPdf(d: FilingReportData): Promise<Buffer> {
  const doc = newDoc(`${brand.name} nil filing activity report`);
  const X = 36, W = doc.page.width - 72;
  const ts = (v: Date | null) => (v ? `${new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} IST` : "—");
  doc.rect(X, 36, W, 4).fill(ACCENT);
  doc.font("B").fontSize(16).fillColor(INK).text(`${brand.name} — Nil Return Filing Activity Report`, X, 50);
  doc.roundedRect(X, 78, W, 40, 6).fill(d.filing.isDemo ? "#fdecec" : "#fff6e5");
  doc.font("B").fontSize(9).fillColor("#7a3b00").text(
    d.filing.isDemo ? "DEMO — NOT GOVERNMENT FILED. This report describes a simulated walkthrough with fictional data." : `INTERNAL ${brand.name.toUpperCase()} RECORD — NOT a government-issued acknowledgement or filing certificate.`,
    X + 10, 86, { width: W - 20 },
  );
  doc.font("R").fontSize(8).fillColor("#7a3b00").text("Filing status is authoritative only on the GST portal (Services › Returns › Track Return Status).", X + 10, 100, { width: W - 20 });

  let y = 132;
  const kv = (k: string, v: string) => { doc.font("B").fontSize(9).fillColor(MUTED).text(k, X, y, { width: 170 }); doc.font("R").fillColor(INK).text(v, X + 175, y, { width: W - 175 }); y += Math.max(14, doc.heightOfString(v, { width: W - 175 }) + 3); };
  kv("Business", d.business.legalName);
  kv("GSTIN", d.business.gstin);
  kv("Return", d.filing.returnType === "GSTR1" ? "GSTR-1 (nil)" : "GSTR-3B (nil)");
  kv("Period", `${d.periodLabel} — GSTN period ${d.filing.periodKey}`);
  kv("Filing frequency", d.filing.filingFrequency);
  kv("Status", `${STATUS_LABEL[d.filing.status as FilingStatus] ?? d.filing.status}${d.filing.isDemo ? " (DEMO)" : ""}`);
  kv("ARN", d.filing.arn ? `${d.filing.arn} — ${d.filing.arnVerificationStatus === "VERIFIED" ? "verified from official source" : "entered by user, NOT verified by Compte"}` : "—");
  kv("Channel", "Government SMS to 14409, sent by the taxpayer from the registered mobile (Compte sends nothing)");
  kv("Declaration accepted", ts(d.filing.declarationAt));
  kv("Irreversibility acknowledged", ts(d.filing.irreversibleAckAt));
  kv("Initiation SMS (user-reported)", ts(d.filing.initiationReportedAt));
  kv("Confirmation SMS (user-reported)", ts(d.filing.confirmationReportedAt));
  kv("ARN recorded", ts(d.filing.arnRecordedAt));
  if (d.filing.rejectionReason) kv("Reported GSTN error", d.filing.rejectionReason);

  y += 8;
  doc.font("B").fontSize(11).fillColor(INK).text("Eligibility checks", X, y); y += 16;
  for (const c of d.checks) {
    if (y > 760) { doc.addPage(); y = 50; }
    const src = c.source.replace(/_/g, " ").toLowerCase();
    const text = `${c.label}${c.detail ? ` — ${c.detail}` : ""}`;
    doc.font("R").fontSize(8);
    const h = doc.heightOfString(text, { width: W - 170 });
    if (y + h > 790) { doc.addPage(); y = 50; }
    doc.font("B").fontSize(8).fillColor(c.result === "PASS" ? ACCENT : c.result === "FAIL" ? "#a33" : "#9a5b00").text(c.result, X, y, { width: 55 });
    doc.font("R").fontSize(8).fillColor(INK).text(text, X + 58, y, { width: W - 170 });
    doc.fontSize(7).fillColor(MUTED).text(src, X + W - 105, y, { width: 105, align: "right" });
    y += h + 5;
  }
  y += 8;
  if (y > 720) { doc.addPage(); y = 50; }
  doc.font("B").fontSize(11).fillColor(INK).text("Evidence timeline", X, y); y += 16;
  for (const e of d.evidence) {
    if (y > 770) { doc.addPage(); y = 50; }
    const line = `${e.summary}  [${e.kind.toLowerCase().replace(/_/g, " ")} · ${e.source.toLowerCase().replace(/_/g, " ")}]`;
    doc.font("R").fontSize(8);
    const h = doc.heightOfString(line, { width: W - 135 });
    doc.fillColor(MUTED).text(ts(e.createdAt), X, y, { width: 130 });
    doc.fillColor(INK).text(line, X + 135, y, { width: W - 135 });
    y += h + 6;
  }
  doc.font("R").fontSize(6.5).fillColor(MUTED).text(`Report ${d.filing.id} generated ${ts(new Date())}. Compte never receives or stores GSTN verification codes.`, X, 800, { width: W, align: "center" });
  return toBuffer(doc);
}
