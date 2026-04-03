-- Phase 2: Quotation System

-- Quotation Requests (created by employee/sales)
CREATE TABLE public.quotation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  version INT NOT NULL DEFAULT 1,
  trip_details JSONB NOT NULL DEFAULT '{}',
  client_preferences TEXT,
  required_services TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'responded', 'revised')),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quotation_requests ENABLE ROW LEVEL SECURITY;

-- Quotation Responses (created by execution team)
CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES public.quotation_requests(id) ON DELETE CASCADE NOT NULL,
  version INT NOT NULL DEFAULT 1,
  pricing_data JSONB NOT NULL DEFAULT '{}',
  total_cost NUMERIC(12,2),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

-- RLS for quotation_requests
CREATE POLICY "Sales can create quotation requests" ON public.quotation_requests
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee')
  );
CREATE POLICY "Authenticated can read quotation requests" ON public.quotation_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage quotation requests" ON public.quotation_requests
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS for quotations
CREATE POLICY "Execution can create quotations" ON public.quotations
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'execution')
  );
CREATE POLICY "Authenticated can read quotations" ON public.quotations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage quotations" ON public.quotations
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Update leads status check to include 'Quoted'
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('Open', 'On Progress', 'Quoted', 'Lost', 'Converted'));

-- Indexes
CREATE INDEX idx_quotation_requests_lead_id ON public.quotation_requests(lead_id);
CREATE INDEX idx_quotation_requests_status ON public.quotation_requests(status);
CREATE INDEX idx_quotations_request_id ON public.quotations(request_id);
