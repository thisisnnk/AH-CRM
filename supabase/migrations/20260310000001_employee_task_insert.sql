-- Allow employees to create tasks (for their own leads)
CREATE POLICY "Employees can create tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
