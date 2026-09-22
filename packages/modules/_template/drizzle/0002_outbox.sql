-- =====================================================================
-- Outbox do módulo (CLAUDE.md §4.5): o evento é gravado na MESMA transação
-- da mudança de estado; quem publica é o relay do worker.
-- =====================================================================

CREATE TABLE IF NOT EXISTS template.outbox (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text
);

-- o relay varre só o que falta publicar
CREATE INDEX IF NOT EXISTS template_outbox_pending_idx
  ON template.outbox (created_at) WHERE published_at IS NULL;

ALTER TABLE template.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE template.outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON template.outbox;
CREATE POLICY tenant_isolation ON template.outbox
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- o relay roda com o role platform (BYPASSRLS): lê e marca como publicado
GRANT SELECT, UPDATE ON template.outbox TO platform;
