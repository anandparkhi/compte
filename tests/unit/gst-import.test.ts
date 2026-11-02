import { describe,it,expect } from "vitest";
import { parseGstr1 } from "../../src/lib/gst-import/parser";
const supplier="27ABCDE1234F1Z5";
const base={gstin:supplier,fp:"102026",b2b:[{ctin:"29ABCDE1234F1Z3",inv:[{inum:"A1",idt:"01-10-2026",val:118,itms:[{itm_det:{txval:100}}]}]}],hsn:{data:[{hsn_sc:"3923",desc:"Boxes",uqc:"NOS",qty:1,rt:18,txval:100}]}};
describe("GSTR-1 file import parser",()=>{
 it("previews historical invoices, recipient GSTINs and HSN rows",()=>{const p=parseGstr1(base,supplier);expect(p.invoices).toHaveLength(1);expect(p.customers).toEqual(["29ABCDE1234F1Z3"]);expect(p.hsn[0].hsn).toBe("3923");});
 it("rejects another business' returns",()=>expect(()=>parseGstr1(base,"27ZZZZZ1234F1Z5")).toThrow(/Supplier GSTIN/));
 it("rejects unsupported empty returns",()=>expect(()=>parseGstr1({gstin:supplier,fp:"102026"},supplier)).toThrow(/No supported/));
 it("has stable hashes regardless of JSON key order",()=>{const a=parseGstr1(base,supplier);const b=parseGstr1({...base,other:"ignored"},supplier);expect(a.fingerprint).toBe(b.fingerprint);});
});
