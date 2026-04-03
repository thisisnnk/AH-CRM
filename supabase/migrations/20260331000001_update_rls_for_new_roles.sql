-- Phase 1.6: Update RLS policies to give new roles appropriate access

-- leads: execution, accounts, and itinerary roles get read-only SELECT access
CREATE POLICY "Execution can read leads" ON public.leads
  FOR SELECT USING (public.has_role(auth.uid(), 'execution'));

CREATE POLICY "Accounts can read leads" ON public.leads
  FOR SELECT USING (public.has_role(auth.uid(), 'accounts'));

CREATE POLICY "Itinerary can read leads" ON public.leads
  FOR SELECT USING (public.has_role(auth.uid(), 'itinerary'));

-- incoming_leads: execution team can read (needed for execution dashboard later)
CREATE POLICY "Execution can read incoming leads" ON public.incoming_leads
  FOR SELECT USING (public.has_role(auth.uid(), 'execution'));
