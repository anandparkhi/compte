-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeBusinessId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "phoneDeclarationAt" DATETIME,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuthorizedBusinessUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
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
    "taxEffectiveFrom" DATETIME,
    "taxSource" TEXT NOT NULL DEFAULT 'USER_ENTERED',
    "taxConfirmedAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoiceNumber" TEXT,
    "financialYear" TEXT,
    "invoiceDate" DATETIME NOT NULL,
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
    "issuedAt" DATETIME,
    "issuedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
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
    "updatedAt" DATETIME NOT NULL,
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
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "exportedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReturnBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InwardSupply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierGstin" TEXT,
    "documentNumber" TEXT NOT NULL,
    "documentDate" DATETIME NOT NULL,
    "taxableValue" TEXT NOT NULL,
    "taxAmount" TEXT NOT NULL,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "declarationAt" DATETIME,
    "irreversibleAckAt" DATETIME,
    "initiationReportedAt" DATETIME,
    "confirmationReportedAt" DATETIME,
    "arn" TEXT,
    "arnVerificationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "arnRecordedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
