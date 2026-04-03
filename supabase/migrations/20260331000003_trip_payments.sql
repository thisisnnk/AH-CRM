-- Phase 3: Trip Payments System

-- Client-side transactions (Revenue Ledger)
CREATE TABLE public.client_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other')),
  proof_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.client_transactions ENABLE ROW LEVEL SECURITY;

-- Cost categories per lead (initialized on conversion)
CREATE TABLE public.cost_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  category_name TEXT NOT NULL CHECK (category_name IN ('Transport', 'Accommodation', 'Food', 'Activities', 'Extras')),
  planned_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, category_name)
);
ALTER TABLE public.cost_categories ENABLE ROW LEVEL SECURITY;

-- Vendor-side transactions (Expense Ledger)
CREATE TABLE public.vendor_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.cost_categories(id) ON DELETE CASCADE NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other')),
  proof_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.vendor_transactions ENABLE ROW LEVEL SECURITY;

-- Add total_expected column to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS total_expected NUMERIC(12,2) DEFAULT 0;

-- RLS: client_transactions
CREATE POLICY "Sales and admin can manage client transactions" ON public.client_transactions
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee')
  );
CREATE POLICY "Accounts can read client transactions" ON public.client_transactions
  FOR SELECT USING (public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "Execution can read client transactions" ON public.client_transactions
  FOR SELECT USING (public.has_role(auth.uid(), 'execution'));

-- RLS: cost_categories
CREATE POLICY "Execution and admin can manage cost categories" ON public.cost_categories
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'execution')
  );
CREATE POLICY "Accounts can read cost categories" ON public.cost_categories
  FOR SELECT USING (public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "Employees can read cost categories" ON public.cost_categories
  FOR SELECT USING (public.has_role(auth.uid(), 'employee'));

-- RLS: vendor_transactions
CREATE POLICY "Execution and admin can manage vendor transactions" ON public.vendor_transactions
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'execution')
  );
CREATE POLICY "Accounts can read vendor transactions" ON public.vendor_transactions
  FOR SELECT USING (public.has_role(auth.uid(), 'accounts'));
CREATE POLICY "Employees can read vendor transactions" ON public.vendor_transactions
  FOR SELECT USING (public.has_role(auth.uid(), 'employee'));

-- Indexes
CREATE INDEX idx_client_transactions_lead_id ON public.client_transactions(lead_id);
CREATE INDEX idx_cost_categories_lead_id ON public.cost_categories(lead_id);
CREATE INDEX idx_vendor_transactions_lead_id ON public.vendor_transactions(lead_id);
CREATE INDEX idx_vendor_transactions_category_id ON public.vendor_transactions(category_id);
