-- Phase 1.1: Add new roles to the app_role enum
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
-- This file must be executed as a standalone migration.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'execution';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accounts';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'itinerary';
