import {describe,it,expect} from "vitest";
import {assessNilEligibility,questionsFor,type Tri} from "../../src/lib/domain/nil-eligibility";
import {parsePeriodKey} from "../../src/lib/domain/periods";
import {ownerCopy,ownerLanguages} from "../../src/lib/i18n/owner-copy";
import {computeDraft,type RuleProduct} from "../../src/lib/domain/invoice-rules";
const answers=(type:"GSTR1"|"GSTR3B"):Record<string,Tri>=>Object.fromEntries(questionsFor(type,"MONTHLY").map(q=>[q.id,q.disqualifyOn==="YES"?"NO":"YES"]));
const local={issuedInvoiceCount:0,draftInvoiceCount:0,inwardSupplyCount:0,reverseChargeInwardCount:0,alreadyRecordedInCompte:false,historicalImportCount:2};
const business={gstin:"27ZZZFZ0001Z1ZU",registrationType:"REGULAR",filingFrequency:"MONTHLY" as const};
describe("owner UX safeguards",()=>{
 for(const type of ["GSTR1","GSTR3B"] as const)it("blocks nil "+type+" even when all outward invoices were imported",()=>{
  const r=assessNilEligibility({returnType:type,period:parsePeriodKey("092026","MONTHLY"),today:"2026-11-02",business,local,answers:answers(type),declarationAccepted:true});
  expect(r.outcome).toBe("INELIGIBLE");expect(r.blockers.some(b=>b.id==="local_imported_outward_supplies")).toBe(true);
 });
 it("has nonempty owner copy in each supported language and falls back to English",()=>{
  const keys=Object.keys(ownerLanguages.en).sort().join("|");
  for(const l of Object.values(ownerLanguages)){expect(Object.keys(l).sort().join("|")).toBe(keys);expect(Object.values(l).every(v=>v.length>0)).toBe(true);}
  expect(ownerCopy("xx")).toBe(ownerLanguages.en);
 });
 it("requires confirmation before old HSN products can be issued",()=>{
  const product:RuleProduct={id:"p",name:"Cartons",kind:"GOODS",hsnSac:"3923",unit:"NOS",gstRate:"18",taxSource:"HISTORICAL_IMPORT_UNVERIFIED"};
  const r=computeDraft({customerId:"c",invoiceDate:"2026-09-15",placeOfSupplyStateCode:"27",placeOfSupplySource:"USER_CONFIRMED",lines:[{productId:"p",description:"Cartons",quantity:"1",unitPrice:"100.00",gstRate:"18",priceIncludesTax:false}]},
   {business:{gstin:"27ZZZFZ0001Z1ZU",stateCode:"27",registrationType:"REGULAR",eInvoiceMandatory:false},
    customer:{id:"c",name:"Buyer",registrationStatus:"REGISTERED",gstin:"27ZZZFZ0001Z1ZU",stateCode:"27"},
    products:new Map([["p",product]]),today:"2026-11-02"});
  expect(r.canIssue).toBe(false);
  expect(r.issues.some(i=>i.code==="IMPORTED_PRODUCT_UNVERIFIED")).toBe(true);
 });
});
