-- =====================================================================
-- Backoff do relay do outbox.
--
-- Sem isto, o relay (que roda a cada 1 s) gastava as 5 tentativas em ~5
-- segundos: qualquer indisponibilidade curta do barramento mandava os
-- eventos para a DLQ. Agora cada falha adia a próxima tentativa.
-- =====================================================================

ALTER TABLE template.outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

DROP INDEX IF EXISTS template_outbox_pending_idx;
CREATE INDEX IF NOT EXISTS template_outbox_pending_idx
  ON template.outbox (next_attempt_at NULLS FIRST, created_at)
  WHERE published_at IS NULL;
