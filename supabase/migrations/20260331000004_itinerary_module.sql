-- Phase 4: Itinerary Module
CREATE TABLE public.itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  version INT NOT NULL DEFAULT 1,
  file_url TEXT,
  file_type TEXT CHECK (file_type IN ('pdf', 'url', 'design')),
  external_link TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

-- Itinerary team and admin have full control
CREATE POLICY "Itinerary team can manage itineraries" ON public.itineraries
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'itinerary')
  );

-- All other authenticated users can read
CREATE POLICY "Authenticated can read itineraries" ON public.itineraries
  FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_itineraries_lead_id ON public.itineraries(lead_id);
