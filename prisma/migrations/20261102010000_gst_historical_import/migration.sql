CREATE TABLE "GstHistoricalImport" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "returnType" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "records" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GstHistoricalImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GstHistoricalImport_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GstHistoricalImport_businessId_sourceHash_key" ON "GstHistoricalImport"("businessId","sourceHash");
CREATE INDEX "GstHistoricalImport_businessId_periodKey_idx" ON "GstHistoricalImport"("businessId","periodKey");
