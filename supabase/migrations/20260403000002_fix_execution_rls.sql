-- Fix: execution_can_update_quotation_status was never applied because
-- 20260401000001 was a duplicate timestamp (collided with employee_insert_rls).
-- Re-create the policy here with a unique timestamp so it gets applied.

DROP POLICY IF EXISTS "Execution can update quotation request status" ON public.quotation_requests;

CREATE POLICY "Execution can update quotation request status"
  ON public.quotation_requests
  FOR UPDATE TO authenticated
  USING  (public.has_role(auth.uid(), 'execution'))
  WITH CHECK (public.has_role(auth.uid(), 'execution'));

-- Fix: execution team needs to send notifications (e.g. quotation_response).
-- The previous policy only allowed admins or self-notifications.
DROP POLICY IF EXISTS "Admins can create notifications" ON public.notifications;

CREATE POLICY "Admins and execution can create notifications"
  ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'execution')
    OR recipient_id = auth.uid()
  );

-- Fix: execution team needs to insert activity_logs (currently blocked by
-- "Users can create logs" which requires user_id = auth.uid() — that is fine,
-- but the 400 suggests the policy was not the issue; make sure the INSERT
-- policy covers execution explicitly just in case.
DROP POLICY IF EXISTS "Users can create logs" ON public.activity_logs;

CREATE POLICY "Users can create logs" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
