-- Allow execution team to update quotation_requests status (e.g. pending → responded)
CREATE POLICY "Execution can update quotation request status" ON public.quotation_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'execution'))
  WITH CHECK (public.has_role(auth.uid(), 'execution'));
