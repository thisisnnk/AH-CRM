-- Ensure all activity_logs columns exist on production.
-- These were supposed to be added in 20260331000005 but may not have been pushed.

ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS user_role TEXT;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS proof_url TEXT;
