-- Employees have INSERT on leads and contacts, but the original schema only gave
-- them SELECT and UPDATE.  Without these policies, non-admin users get a silent
-- RLS denial (Supabase returns zero rows / no error) instead of an actual insert.

-- Allow any authenticated user to create leads.
-- Admins are already covered by their FOR ALL policy; this adds the missing path
-- for employees and any other role that needs to submit a new enquiry.
CREATE POLICY "Authenticated can create leads" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow any authenticated user to create contacts.
-- Same gap as above — "Admins can manage contacts" covers FOR ALL for admins,
-- but employees had no INSERT path.
CREATE POLICY "Authenticated can create contacts" ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (true);
