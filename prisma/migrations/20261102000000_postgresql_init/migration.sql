-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeBusinessId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "gstin" TEXT NOT NULL,
    "gstinVerificationStatus" TEXT NOT NULL DEFAULT 'FORMAT_VALID_UNVERIFIED',
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "registrationType" TEXT NOT NULL DEFAULT 'REGULAR',
    "filingFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "financialYear" TEXT NOT NULL,
    "eInvoiceMandatory" BOOLEAN NOT NULL DEFAULT false,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "invoicePrefix" TEXT NOT NULL,
    "signatoryName" TEXT NOT NULL,
    "signatoryDesignation" TEXT NOT NULL DEFAULT 'Proprietor',
    "phoneIsGstnRegistered" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "phoneDeclarationAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "AuthorizedBusinessUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthorizedBusinessUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuthorizedBusinessUser_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "gstin" TEXT,
    "registrationStatus" TEXT NOT NULL DEFAULT 'REGISTERED',
    "stateCode" TEXT NOT NULL,
    "billingAddress" TEXT NOT NULL,
    "shippingAddress" TEXT,
    "shippingStateCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'GOODS',
    "hsnSac" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "defaultPrice" TEXT NOT NULL,
    "gstRate" TEXT NOT NULL,
    "priceIncludesTax" BOOLEAN NOT NULL DEFAULT false,
    "taxEffectiveFrom" TIMESTAMP(3),
    "taxSource" TEXT NOT NULL DEFAULT 'USER_ENTERED',
    "taxConfirmedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoiceNumber" TEXT,
    "financialYear" TEXT,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "placeOfSupplyStateCode" TEXT,
    "placeOfSupplySource" TEXT,
    "supplyType" TEXT,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "taxableTotal" TEXT NOT NULL DEFAULT '0.00',
    "cgstTotal" TEXT NOT NULL DEFAULT '0.00',
    "sgstTotal" TEXT NOT NULL DEFAULT '0.00',
    "igstTotal" TEXT NOT NULL DEFAULT '0.00',
    "grandTotal" TEXT NOT NULL DEFAULT '0.00',
    "source" TEXT NOT NULL DEFAULT 'TEXT',
    "sourceText" TEXT,
    "sourceLanguage" TEXT,
    "extractionMethod" TEXT,
    "extractionNotes" TEXT NOT NULL DEFAULT '[]',
    "inboundMessageId" TEXT,
    "idempotencyKey" TEXT,
    "snapshot" TEXT,
    "snapshotHash" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hsnSac" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "unitPrice" TEXT NOT NULL,
    "priceIncludesTax" BOOLEAN NOT NULL DEFAULT false,
    "gstRate" TEXT NOT NULL,
    "taxableValue" TEXT NOT NULL DEFAULT '0.00',
    "cgst" TEXT NOT NULL DEFAULT '0.00',
    "sgst" TEXT NOT NULL DEFAULT '0.00',
    "igst" TEXT NOT NULL DEFAULT '0.00',
    "lineTotal" TEXT NOT NULL DEFAULT '0.00',
    CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceLineItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceNumberSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvoiceNumberSequence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT,
    "channel" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyRedacted" BOOLEAN NOT NULL DEFAULT false,
    "classification" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "replyText" TEXT,
    "invoiceId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboundMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "providerResponse" TEXT,
    "errorMessage" TEXT,
    "requestedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailDelivery_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailDelivery_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "returnType" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT_PREPARED',
    "invoiceCount" INTEGER NOT NULL DEFAULT 0,
    "taxableTotal" TEXT NOT NULL DEFAULT '0.00',
    "taxTotal" TEXT NOT NULL DEFAULT '0.00',
    "exportKind" TEXT,
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReturnBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InwardSupply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierGstin" TEXT,
    "documentNumber" TEXT NOT NULL,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "taxableValue" TEXT NOT NULL,
    "taxAmount" TEXT NOT NULL,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InwardSupply_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NilReturnFiling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "returnType" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "filingFrequency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "filingChannel" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "eligibilityChecklist" TEXT NOT NULL DEFAULT '{}',
    "declarationAt" TIMESTAMP(3),
    "irreversibleAckAt" TIMESTAMP(3),
    "initiationReportedAt" TIMESTAMP(3),
    "confirmationReportedAt" TIMESTAMP(3),
    "arn" TEXT,
    "arnVerificationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "arnRecordedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NilReturnFiling_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NilEligibilityAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filingId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "returnType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "checks" TEXT NOT NULL,
    "declarationAccepted" BOOLEAN NOT NULL DEFAULT false,
    "declarationText" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NilEligibilityAssessment_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "NilReturnFiling" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NilEligibilityAssessment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FilingEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filingId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FilingEvidence_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "NilReturnFiling" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FilingEvidence_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_gstin_key" ON "Business"("gstin");

-- CreateIndex
CREATE INDEX "AuthorizedBusinessUser_businessId_idx" ON "AuthorizedBusinessUser"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedBusinessUser_userId_businessId_key" ON "AuthorizedBusinessUser"("userId", "businessId");

-- CreateIndex
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_gstin_key" ON "Customer"("businessId", "gstin");

-- CreateIndex
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");

-- CreateIndex
CREATE INDEX "Invoice_businessId_status_invoiceDate_idx" ON "Invoice"("businessId", "status", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_invoiceNumber_key" ON "Invoice"("businessId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_idempotencyKey_key" ON "Invoice"("businessId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceNumberSequence_businessId_financialYear_key" ON "InvoiceNumberSequence"("businessId", "financialYear");

-- CreateIndex
CREATE INDEX "InboundMessage_businessId_idx" ON "InboundMessage"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_channel_providerMessageId_key" ON "InboundMessage"("channel", "providerMessageId");

-- CreateIndex
CREATE INDEX "EmailDelivery_businessId_invoiceId_idx" ON "EmailDelivery"("businessId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnBatch_businessId_returnType_periodKey_key" ON "ReturnBatch"("businessId", "returnType", "periodKey");

-- CreateIndex
CREATE INDEX "InwardSupply_businessId_documentDate_idx" ON "InwardSupply"("businessId", "documentDate");

-- CreateIndex
CREATE UNIQUE INDEX "NilReturnFiling_businessId_returnType_periodKey_isDemo_key" ON "NilReturnFiling"("businessId", "returnType", "periodKey", "isDemo");

-- CreateIndex
CREATE INDEX "NilEligibilityAssessment_filingId_idx" ON "NilEligibilityAssessment"("filingId");

-- CreateIndex
CREATE INDEX "FilingEvidence_filingId_idx" ON "FilingEvidence"("filingId");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- Preserve issued-invoice immutability from the original SQLite migrations.
CREATE OR REPLACE FUNCTION protect_issued_invoice() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'ISSUED' THEN RAISE EXCEPTION 'Issued invoices cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'ISSUED' AND (NEW."status" IS DISTINCT FROM OLD."status" OR
    NEW."invoiceNumber" IS DISTINCT FROM OLD."invoiceNumber" OR
    NEW."invoiceDate" IS DISTINCT FROM OLD."invoiceDate" OR
    NEW."customerId" IS DISTINCT FROM OLD."customerId" OR
    NEW."placeOfSupplyStateCode" IS DISTINCT FROM OLD."placeOfSupplyStateCode" OR
    NEW."taxableTotal" IS DISTINCT FROM OLD."taxableTotal" OR
    NEW."cgstTotal" IS DISTINCT FROM OLD."cgstTotal" OR
    NEW."sgstTotal" IS DISTINCT FROM OLD."sgstTotal" OR
    NEW."igstTotal" IS DISTINCT FROM OLD."igstTotal" OR
    NEW."grandTotal" IS DISTINCT FROM OLD."grandTotal" OR
    NEW."snapshot" IS DISTINCT FROM OLD."snapshot" OR
    NEW."snapshotHash" IS DISTINCT FROM OLD."snapshotHash") THEN
    RAISE EXCEPTION 'Issued invoices are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER invoice_issued_immutable BEFORE UPDATE OR DELETE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION protect_issued_invoice();

CREATE OR REPLACE FUNCTION protect_issued_invoice_line() RETURNS trigger AS $$
DECLARE invoice_status TEXT;
BEGIN
  SELECT "status" INTO invoice_status FROM "Invoice" WHERE "id" = OLD."invoiceId";
  IF invoice_status = 'ISSUED' THEN
    RAISE EXCEPTION 'Line items of issued invoices are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER invoice_line_issued_immutable BEFORE UPDATE OR DELETE ON "InvoiceLineItem"
FOR EACH ROW EXECUTE FUNCTION protect_issued_invoice_line();
