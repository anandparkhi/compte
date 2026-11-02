import {requirePageContext} from "@/server/auth/session";
import {BankReconciliation} from "@/components/payment/bank-reconciliation";
export const dynamic="force-dynamic";
export default async function BankPage(){await requirePageContext();return <div className="mx-auto max-w-3xl"><BankReconciliation/></div>;}
