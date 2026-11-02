-- Defence in depth (SQLite): issued invoices are immutable at the database level.
-- The application layer enforces the same rule; these triggers stop any code path
-- (including ad-hoc scripts) from silently altering issued financial values.
-- For PostgreSQL, port these as BEFORE UPDATE/DELETE triggers in PL/pgSQL.

CREATE TRIGGER "invoice_issued_immutable"
BEFORE UPDATE ON "Invoice"
FOR EACH ROW
WHEN OLD."status" = 'ISSUED' AND (
  NEW."status" IS NOT OLD."status" OR
  NEW."invoiceNumber" IS NOT OLD."invoiceNumber" OR
  NEW."invoiceDate" IS NOT OLD."invoiceDate" OR
  NEW."customerId" IS NOT OLD."customerId" OR
  NEW."placeOfSupplyStateCode" IS NOT OLD."placeOfSupplyStateCode" OR
  NEW."taxableTotal" IS NOT OLD."taxableTotal" OR
  NEW."cgstTotal" IS NOT OLD."cgstTotal" OR
  NEW."sgstTotal" IS NOT OLD."sgstTotal" OR
  NEW."igstTotal" IS NOT OLD."igstTotal" OR
  NEW."grandTotal" IS NOT OLD."grandTotal" OR
  NEW."snapshot" IS NOT OLD."snapshot" OR
  NEW."snapshotHash" IS NOT OLD."snapshotHash"
)
BEGIN
  SELECT RAISE(ABORT, 'Issued invoices are immutable');
END;

CREATE TRIGGER "invoice_issued_no_delete"
BEFORE DELETE ON "Invoice"
FOR EACH ROW
WHEN OLD."status" = 'ISSUED'
BEGIN
  SELECT RAISE(ABORT, 'Issued invoices cannot be deleted');
END;

CREATE TRIGGER "invoice_line_issued_immutable"
BEFORE UPDATE ON "InvoiceLineItem"
FOR EACH ROW
WHEN (SELECT "status" FROM "Invoice" WHERE "id" = OLD."invoiceId") = 'ISSUED'
BEGIN
  SELECT RAISE(ABORT, 'Line items of issued invoices are immutable');
END;

CREATE TRIGGER "invoice_line_issued_no_delete"
BEFORE DELETE ON "InvoiceLineItem"
FOR EACH ROW
WHEN (SELECT "status" FROM "Invoice" WHERE "id" = OLD."invoiceId") = 'ISSUED'
BEGIN
  SELECT RAISE(ABORT, 'Line items of issued invoices cannot be deleted');
END;
