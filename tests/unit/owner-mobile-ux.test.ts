import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ownerUiCopy, ownerUiLanguages } from "../../src/lib/i18n/owner-ui-copy";
import { ownerCopy } from "../../src/lib/i18n/owner-copy";

const root=process.cwd();
const read=(path:string)=>readFileSync(join(root,path),"utf8");
describe("mobile owner experience",()=>{
 it("ships the same short UI copy keys in each supported language",()=>{
  const keys=Object.keys(ownerUiLanguages.en).sort();
  for(const lang of ["en","hi","mr"] as const){
   expect(Object.keys(ownerUiLanguages[lang]).sort()).toEqual(keys);
   expect(Object.values(ownerUiLanguages[lang]).every(v=>v.trim().length>0)).toBe(true);
   expect(ownerUiCopy(lang).invoiceAmount.length).toBeGreaterThan(0);
  }
  expect(ownerUiCopy("unsupported")).toBe(ownerUiLanguages.en);
  expect(ownerCopy("mr").homeTitle).toBeTruthy();
 });
 it("does not render owner translations as literal curly-brace text",()=>{
  const pages=[
   "src/app/(app)/page.tsx",
   "src/app/(app)/returns/page.tsx",
   "src/app/(app)/returns/[period]/page.tsx",
   "src/app/(app)/invoices/imported/[batch]/[index]/page.tsx",
  ];
  for(const page of pages){
   const content=read(page);
   expect(content, page).not.toMatch(/["']\{(?:copy|u)\.[a-zA-Z]+\}["']/);
  }
 });
 it("does not place compliance banners before a GST period's sales summary",()=>{
  const page=read("src/app/(app)/returns/[period]/page.tsx");
  expect(page.indexOf("aria-label={u.periodSummary}")).toBeGreaterThan(0);
  expect(page).toContain("<details");
  expect(page).not.toContain('tone="warn" title="Compte exports');
 });
 it("makes the imported invoice source secondary to the amounts",()=>{
  const page=read("src/app/(app)/invoices/imported/[batch]/[index]/page.tsx");
  expect(page.indexOf("u.invoiceAmount")).toBeLessThan(page.indexOf("u.sourceFile"));
  expect(page).toContain("break-all");
 });
});
