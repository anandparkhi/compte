import {describe,it,expect} from "vitest";
import {balanceFor,parseBankCsv,validateBankEntry,whatsappText,normalizePhone} from "../../src/lib/payment/reconciliation";
describe("payment reconciliation",()=>{
 it("calculates partial and paid status without rounding drift",()=>{expect(balanceFor("118.00",[{amount:"18.00"}])).toEqual({paid:"18.00",due:"100.00",status:"PARTIAL"});expect(balanceFor("118.00",[{amount:"118.00"}]).status).toBe("PAID");});
 it("reads quoted bank narration in CSV",()=>{const rows=parseBankCsv('Date,Amount,Reference,Narration\n2026-11-02,118.00,UTR1,"UPI, Ramesh"');expect(rows[0].narration).toBe("UPI, Ramesh");expect(validateBankEntry(rows[0]).amount).toBe("118.00");});
 it("rejects debits and malformed dates",()=>{expect(()=>validateBankEntry({date:"2026-11-02",amount:"-3",reference:"",narration:""})).toThrow();expect(()=>validateBankEntry({date:"2026-02-30",amount:"3",reference:"",narration:""})).toThrow();});
 it("creates Hindi and Marathi reminders without sending",()=>{expect(whatsappText("hi","reminder","Ram","A1","118")).toContain("बाकी");expect(whatsappText("mr","reminder","Ram","A1","118")).toContain("बाकी");expect(normalizePhone("9876543210")).toBe("919876543210");});
});
