-- ============================================================
-- RUN THIS IN: Supabase Dashboard → SQL Editor → New Query
-- These indexes make queries INSTANT instead of full table scan
-- ============================================================

-- Contacts: fast sort by created_at (main list query)
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts (created_at DESC);

-- Contacts: fast text search on name, phone, contact_id
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm ON contacts USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_id_trgm ON contacts USING gin (contact_id gin_trgm_ops);

-- Leads: fast sort + date range filter
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);

-- Leads: fast filter by assigned employee
CREATE INDEX IF NOT EXISTS idx_leads_assigned_employee ON leads (assigned_employee_id);

-- Leads: fast text search
CREATE INDEX IF NOT EXISTS idx_leads_name_trgm ON leads USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm ON leads USING gin (phone gin_trgm_ops);

-- Leads: fast filter by status
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);

-- Enable trigram extension if not already (required for gin_trgm_ops)
-- Run this FIRST if you get an error on the trgm indexes:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
