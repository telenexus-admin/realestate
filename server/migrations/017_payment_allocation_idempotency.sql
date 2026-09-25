CREATE UNIQUE INDEX IF NOT EXISTS payment_allocations_payment_invoice_uidx
  ON payment_allocations(payment_id,invoice_id);
