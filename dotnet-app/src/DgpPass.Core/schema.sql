-- 61st All India DGPs / IGPs Conference 2026 Pass Management Schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    department_type VARCHAR(64) NOT NULL DEFAULT 'EXTERNAL',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(128) DEFAULT 'System'
);

CREATE TABLE IF NOT EXISTS staff_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    applicable_to VARCHAR(64) NOT NULL DEFAULT 'INTERNAL',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(128) DEFAULT 'System'
);

CREATE TABLE IF NOT EXISTS passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pass_number VARCHAR(64) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    father_or_spouse_name VARCHAR(255) NOT NULL,
    personnel_type VARCHAR(32) NOT NULL DEFAULT 'INTERNAL', -- 'INTERNAL' or 'EXTERNAL'
    institution VARCHAR(64) NOT NULL DEFAULT 'IISER',
    institution_other VARCHAR(255),
    category VARCHAR(64) NOT NULL DEFAULT 'Student',
    category_other VARCHAR(255),
    department VARCHAR(255) NOT NULL,
    designation_or_trade VARCHAR(255),
    dept_hostel_quarter VARCHAR(255),
    mobile_number VARCHAR(32) NOT NULL,
    govt_id_type VARCHAR(64) NOT NULL DEFAULT 'Aadhaar',
    govt_id_number VARCHAR(128) NOT NULL,
    zone_a BOOLEAN NOT NULL DEFAULT false,
    gate_zone_a VARCHAR(255),
    zone_b BOOLEAN NOT NULL DEFAULT false,
    gate_zone_b VARCHAR(255),
    zone_c BOOLEAN NOT NULL DEFAULT false,
    gate_zone_c VARCHAR(255),
    valid_from VARCHAR(32) NOT NULL DEFAULT '2026-11-27',
    valid_to VARCHAR(32) NOT NULL DEFAULT '2026-12-02',
    photo_url TEXT,
    cardholder_signature_url TEXT,
    authority_signature_url TEXT,
    has_hologram BOOLEAN NOT NULL DEFAULT true,
    has_official_seal BOOLEAN NOT NULL DEFAULT true,
    verification_token VARCHAR(64) UNIQUE NOT NULL,
    qr_payload TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'READY_TO_PRINT',
    printed_count INTEGER NOT NULL DEFAULT 0,
    last_printed_at TIMESTAMPTZ,
    last_printed_by VARCHAR(128),
    approved_by VARCHAR(128) DEFAULT 'Security Nodal Officer',
    approved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_passes_pass_number ON passes(pass_number);
CREATE INDEX IF NOT EXISTS idx_passes_verification_token ON passes(verification_token);
CREATE INDEX IF NOT EXISTS idx_passes_status ON passes(status);
CREATE INDEX IF NOT EXISTS idx_passes_institution ON passes(institution);
CREATE INDEX IF NOT EXISTS idx_passes_category ON passes(category);
CREATE INDEX IF NOT EXISTS idx_passes_personnel_type ON passes(personnel_type);
CREATE INDEX IF NOT EXISTS idx_passes_duplicate_check ON passes(LOWER(TRIM(full_name)), mobile_number, LOWER(TRIM(govt_id_number)));

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    pass_id UUID REFERENCES passes(id) ON DELETE SET NULL,
    pass_number VARCHAR(64),
    action VARCHAR(64) NOT NULL,
    performed_by VARCHAR(128) NOT NULL,
    user_role VARCHAR(64) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_pass_id ON audit_logs(pass_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS conference_configs (
    id SERIAL PRIMARY KEY,
    key VARCHAR(64) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT
);

-- .NET authentication tables; pass and department tables remain compatible with the web version.
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(254) UNIQUE NOT NULL CHECK (email = lower(email)),
    name VARCHAR(100) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('ADMIN', 'PRINT_TEAM')),
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expiry ON app_sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_login_attempts (
    email VARCHAR(254) PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE passes ADD COLUMN IF NOT EXISTS personnel_type VARCHAR(32) NOT NULL DEFAULT 'INTERNAL';
INSERT INTO departments (name) SELECT unnest(ARRAY['Police department','Intelligence Bureau','State intelligence','Dist Spl Branch','IISER','IIT','Revenue','Tourism','Electricity','R&B','RTO','ITDC','MANN','BSNL','Fire/ NDRF/ SDRF','Medical & Health','TMC','Sanitary & Health','Food safety','PIB','I&PR','NIC/ APTS','Airport','Other Telecom services']) ON CONFLICT (name) DO NOTHING;
INSERT INTO staff_roles (name) SELECT unnest(ARRAY['Administration','Faculty Members','Non Teaching Staff','Engineering Dept staff','Students','Boarders','Hostel staff','Hostel Workers','Security staff','Temporary/ Contract workers','Contingency workers','Outsourcing staff']) ON CONFLICT (name) DO NOTHING;
