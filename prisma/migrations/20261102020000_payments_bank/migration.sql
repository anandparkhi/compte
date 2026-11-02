CREATE TABLE "BankImportTransaction" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "fingerprint" TEXT NOT NULL,
 "date" TIMESTAMP(3) NOT NULL,
 "amount" TEXT NOT NULL,
 "reference" TEXT NOT NULL,
 "narration" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BankImportTransaction_businessId_fingerprint_key" ON "BankImportTransaction"("businessId","fingerprint");
CREATE INDEX "BankImportTransaction_businessId_date_idx" ON "BankImportTransaction"("businessId","date");
CREATE TABLE "InvoicePayment" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "invoiceId" TEXT NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "amount" TEXT NOT NULL,
 "receivedAt" TIMESTAMP(3) NOT NULL,
 "reference" TEXT,
 "source" TEXT NOT NULL,
 "bankTransactionId" TEXT UNIQUE REFERENCES "BankImportTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InvoicePayment_businessId_invoiceId_idx" ON "InvoicePayment"("businessId","invoiceId");
