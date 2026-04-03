-- Allow employees to delete quotation requests they created (only while still pending)
CREATE POLICY "Employees can delete their own pending quotation requests"
  ON public.quotation_requests
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND status = 'pending'
    AND (public.has_role(auth.uid(), 'employee') OR public.has_role(auth.uid(), 'admin'))
  );
