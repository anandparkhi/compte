-- Retain issued invoice numbers and immutable snapshots, but allow a narrowly
-- scoped ISSUED -> CANCELLED status transition. Never physically delete either.
CREATE OR REPLACE FUNCTION protect_issued_invoice() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('ISSUED','CANCELLED') THEN
      RAISE EXCEPTION 'Issued/cancelled invoices must remain in the audit ledger';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cancelled invoices are immutable';
  END IF;

  IF OLD."status" = 'ISSUED' THEN
    IF NEW."status" = 'CANCELLED'
       AND (to_jsonb(NEW) - 'status' - 'updatedAt') = (to_jsonb(OLD) - 'status' - 'updatedAt') THEN
      IF EXISTS (SELECT 1 FROM "InvoicePayment" WHERE "invoiceId" = OLD."id") THEN
        RAISE EXCEPTION 'Invoice with payments cannot be cancelled';
      END IF;
      IF EXISTS (SELECT 1 FROM "EmailDelivery" WHERE "invoiceId" = OLD."id" AND "status" = 'SENT') THEN
        RAISE EXCEPTION 'Invoice already sent to customer cannot be silently cancelled';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Issued invoices are immutable except safe cancellation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_issued_invoice_line() RETURNS trigger AS $$
DECLARE invoice_status TEXT;
BEGIN
  SELECT "status" INTO invoice_status FROM "Invoice" WHERE "id" = OLD."invoiceId";
  IF invoice_status IN ('ISSUED','CANCELLED') THEN
    RAISE EXCEPTION 'Line items of issued/cancelled invoices are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
