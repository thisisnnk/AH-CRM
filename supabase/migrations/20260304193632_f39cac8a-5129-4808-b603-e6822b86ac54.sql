
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'employee',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Contacts table
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Leads table
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  destination TEXT,
  travelers INT,
  trip_duration TEXT,
  enquiry_date TIMESTAMPTZ DEFAULT now(),
  lead_source TEXT,
  itinerary_code TEXT,
  status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'On Progress', 'Lost', 'Converted')),
  badge_stage TEXT DEFAULT 'Open' CHECK (badge_stage IN ('Open', 'Follow Up', 'Converted', 'Lost')),
  assigned_employee_id UUID REFERENCES auth.users(id),
  contact_id UUID REFERENCES public.contacts(id),
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Revisions table
CREATE TABLE public.revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_number INT NOT NULL,
  call_recording_url TEXT NOT NULL,
  notes TEXT NOT NULL,
  itinerary_link TEXT NOT NULL,
  date_sent TIMESTAMPTZ,
  send_status TEXT DEFAULT 'Pending' CHECK (send_status IN ('Sent', 'Pending')),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.revisions ENABLE ROW LEVEL SECURITY;

-- Proof of activity
CREATE TABLE public.proof_of_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  submitted_by UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.proof_of_activities ENABLE ROW LEVEL SECURITY;

-- Tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  follow_up_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed')),
  proof_submitted BOOLEAN DEFAULT false,
  proof_url TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  assigned_employee_id UUID REFERENCES auth.users(id) NOT NULL,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Activity logs
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  recipient_id UUID REFERENCES auth.users(id) NOT NULL,
  lead_id UUID REFERENCES public.leads(id),
  message TEXT NOT NULL,
  sent_via TEXT DEFAULT 'in_app',
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  is_task BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Incoming leads (from bots)
CREATE TABLE public.incoming_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  source TEXT NOT NULL,
  raw_data TEXT,
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Assigned')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.incoming_leads ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- user_roles
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "Authenticated can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- contacts
CREATE POLICY "Authenticated can read contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage contacts" ON public.contacts FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- leads
CREATE POLICY "Admins can manage all leads" ON public.leads FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees can read assigned leads" ON public.leads FOR SELECT USING (assigned_employee_id = auth.uid());
CREATE POLICY "Employees can update assigned leads" ON public.leads FOR UPDATE USING (assigned_employee_id = auth.uid());

-- revisions
CREATE POLICY "Authenticated can read revisions" ON public.revisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create revisions" ON public.revisions FOR INSERT TO authenticated WITH CHECK (true);

-- proof_of_activities
CREATE POLICY "Authenticated can read proof" ON public.proof_of_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create proof" ON public.proof_of_activities FOR INSERT TO authenticated WITH CHECK (true);

-- tasks
CREATE POLICY "Admins can manage all tasks" ON public.tasks FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Employees can read assigned tasks" ON public.tasks FOR SELECT USING (assigned_employee_id = auth.uid());
CREATE POLICY "Employees can update assigned tasks" ON public.tasks FOR UPDATE USING (assigned_employee_id = auth.uid());

-- activity_logs
CREATE POLICY "Authenticated can read logs" ON public.activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- notifications
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (recipient_id = auth.uid());
CREATE POLICY "Authenticated can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- incoming_leads
CREATE POLICY "Admins can manage incoming leads" ON public.incoming_leads FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('crm-files', 'crm-files', true);
CREATE POLICY "Authenticated can upload files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'crm-files');
CREATE POLICY "Anyone can read crm files" ON storage.objects FOR SELECT USING (bucket_id = 'crm-files');

-- Contact ID sequence helper
CREATE OR REPLACE FUNCTION public.generate_contact_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_part TEXT;
  month_part TEXT;
  seq_num INT;
BEGIN
  year_part := to_char(now(), 'YY');
  month_part := to_char(now(), 'MM');
  SELECT COALESCE(MAX(
    CAST(RIGHT(contact_id, 3) AS INT)
  ), 0) + 1 INTO seq_num
  FROM public.contacts
  WHERE contact_id LIKE 'AH' || year_part || month_part || '%';
  RETURN 'AH' || year_part || month_part || LPAD(seq_num::TEXT, 3, '0');
END;
$$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Profile creation trigger on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
