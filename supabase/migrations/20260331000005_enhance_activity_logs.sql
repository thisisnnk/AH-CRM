-- Phase 6: Enhance activity_logs with role tracking and entity references

ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS user_role TEXT;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
