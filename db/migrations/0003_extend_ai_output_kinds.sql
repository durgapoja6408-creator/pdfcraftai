-- 0003_extend_ai_output_kinds.sql
-- Extend ai_outputs.kind enum for 5 new AI tools shipping in Phase 5.6:
--   rewrite    — ai-rewrite:   tone/style rewrite of extracted text, returns markdown
--   table      — ai-table:     table extraction, returns markdown + CSV/XLSX blobs in meta
--   redaction  — ai-redact:    PII detection + redacted PDF, markdown is audit log
--   generation — ai-generate:  prompt -> PDF, markdown is the generated prose
--   signing    — ai-sign:      form field detection + signature placement, markdown is audit log
--
-- MySQL ENUM ALTER: adding new values to an ENUM is a metadata-only
-- change on MySQL 5.7+ / 8.x (no row rewrite), so this is cheap even on
-- a large ai_outputs table. Existing rows keep their current kind.
--
-- Safe to re-run: the ALTER is idempotent in effect — running it again
-- with the same enum list is a no-op (MySQL detects no change).

ALTER TABLE `ai_outputs`
  MODIFY COLUMN `kind` ENUM(
    'summary',
    'translation',
    'ocr',
    'comparison',
    'rewrite',
    'table',
    'redaction',
    'generation',
    'signing'
  ) NOT NULL;
