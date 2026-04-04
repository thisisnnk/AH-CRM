-- Make category_id optional on vendor_transactions so expenses can be recorded
-- without being tied to a specific cost category.
ALTER TABLE public.vendor_transactions ALTER COLUMN category_id DROP NOT NULL;
