import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ownerUiCopy, ownerUiLanguages } from "../../src/lib/i18n/owner-ui-copy";

describe("mobile owner journeys",()=>{
 it("has the same non-empty labels in English, Hindi and Marathi",()=>{
  const keys=Object.keys(ownerUiLanguages.en).sort();
  for(const translations of Object.values(ownerUiLanguages)){
   expect(Object.keys(translations).sort()).toEqual(keys);
   expect(Object.values(translations).every(s=>s.trim().length>0)).toBe(true);
  }
  expect(ownerUiCopy("unknown")).toBe(ownerUiLanguages.en);
 });
 it("does not show literal template expressions as text on key screens",()=>{
  const files=[
   "src/app/(app)/page.tsx",
   "src/app/(app)/returns/page.tsx",
   "src/app/(app)/returns/[period]/page.tsx",
   "src/app/(app)/invoices/imported/[batch]/[index]/page.tsx",
  ];
  for(const name of files){
   const source=readFileSync(resolve(process.cwd(),name),"utf8");
   expect(source,name).not.toMatch(/["']\{(?:copy|u)\.[a-zA-Z]+\}["']/);
  }
 });
 it("keeps filing caveats out of default mobile page banners",()=>{
  const detail=readFileSync(resolve(process.cwd(),"src/app/(app)/returns/[period]/page.tsx"),"utf8");
  expect(detail).toContain("<details");
  expect(detail).toContain("u.exportWarning");
  expect(detail).not.toContain('title="Compte exports are not portal upload-ready"');
 });
});
