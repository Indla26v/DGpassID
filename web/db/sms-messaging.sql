-- SMS duty messages (Fast2SMS, DLT): zone briefings, send campaigns and per-officer recipients.
-- Apply after bandobast-deployment.sql. Safe to re-run.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Briefing per zone, with optional per-sector override (sector NULL = whole zone).
CREATE TABLE IF NOT EXISTS zone_briefings (
    id serial PRIMARY KEY,
    zone varchar(128) NOT NULL,
    sector varchar(64),
    briefing_date date,
    briefing_time time,
    venue varchar(255),
    updated_by varchar(254),
    updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_zone_briefings_zone_sector ON zone_briefings (zone, COALESCE(sector, ''));

CREATE TABLE IF NOT EXISTS message_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by varchar(254) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    filters jsonb NOT NULL DEFAULT '{}'::jsonb,
    dlt_message_id varchar(128) NOT NULL,
    sender_id varchar(16) NOT NULL DEFAULT '',
    body_snapshot text NOT NULL,
    param_order jsonb NOT NULL DEFAULT '[]'::jsonb,
    dry_run boolean NOT NULL DEFAULT true,
    status varchar(16) NOT NULL DEFAULT 'SENDING' CHECK (status IN ('SENDING', 'DONE', 'CANCELLED')),
    finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS message_recipients (
    id bigserial PRIMARY KEY,
    campaign_id uuid NOT NULL REFERENCES message_campaigns(id) ON DELETE CASCADE,
    pass_id uuid REFERENCES passes(id) ON DELETE SET NULL,
    full_name varchar(255) NOT NULL,
    mobile_e164 varchar(20),
    params jsonb NOT NULL DEFAULT '{}'::jsonb,
    status varchar(16) NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED', 'SIMULATED')),
    provider_message_id varchar(128),
    error text,
    sent_at timestamptz,
    status_at timestamptz
);

-- Databases that ran the earlier WhatsApp draft of this migration: rename its columns.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'message_recipients' AND column_name = 'wa_message_id') THEN
    ALTER TABLE message_recipients RENAME COLUMN wa_message_id TO provider_message_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'message_campaigns' AND column_name = 'template_name') THEN
    ALTER TABLE message_campaigns RENAME COLUMN template_name TO dlt_message_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'message_campaigns' AND column_name = 'template_lang') THEN
    ALTER TABLE message_campaigns DROP COLUMN template_lang;
  END IF;
END $$;
ALTER TABLE message_campaigns ADD COLUMN IF NOT EXISTS sender_id varchar(16) NOT NULL DEFAULT '';

DROP INDEX IF EXISTS idx_message_recipients_wa_id;
CREATE INDEX IF NOT EXISTS idx_message_recipients_campaign_status ON message_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_message_recipients_provider_id ON message_recipients (provider_message_id);

COMMIT;
