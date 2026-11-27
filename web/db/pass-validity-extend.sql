-- Extend duty pass validity from 30 Nov 2026 to 2 Dec 2026.
-- Idempotent: sets the default for new passes and moves passes that still end on 30 Nov.
BEGIN;
ALTER TABLE passes ALTER COLUMN valid_to SET DEFAULT '2026-12-02';
UPDATE passes SET valid_to = '2026-12-02', updated_at = NOW() WHERE valid_to = '2026-11-30';
COMMIT;
