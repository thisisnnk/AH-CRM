
-- Fix overly permissive INSERT policies

-- Revisions: only allow insert if user is the creator
DROP POLICY "Authenticated can create revisions" ON public.revisions;
CREATE POLICY "Users can create revisions" ON public.revisions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Proof of activities: only allow insert if user is the submitter
DROP POLICY "Authenticated can create proof" ON public.proof_of_activities;
CREATE POLICY "Users can create proof" ON public.proof_of_activities FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());

-- Activity logs: only allow insert if user is the actor
DROP POLICY "Authenticated can create logs" ON public.activity_logs;
CREATE POLICY "Users can create logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Notifications: only admins or system can create notifications
DROP POLICY "Authenticated can create notifications" ON public.notifications;
CREATE POLICY "Admins can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR recipient_id = auth.uid());
