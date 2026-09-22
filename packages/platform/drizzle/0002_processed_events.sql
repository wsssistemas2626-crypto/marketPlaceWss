-- =====================================================================
-- Idempotência dos consumidores de evento (US-005).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Idempotência de consumidores: chave = id do evento + handler
-- (CLAUDE.md §4.5). Gravado na MESMA transação do efeito do handler.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.processed_events (
  event_id uuid NOT NULL,
  handler text NOT NULL,
  tenant_id uuid NOT NULL,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, handler)
);

ALTER TABLE platform.processed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.processed_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON platform.processed_events;
CREATE POLICY tenant_isolation ON platform.processed_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON platform.processed_events TO app;
