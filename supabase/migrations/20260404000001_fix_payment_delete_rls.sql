-- Allow execution to delete client_transactions (revenue payments)
CREATE POLICY "Execution can delete client transactions"
  ON public.client_transactions
  FOR DELETE
  USING (public.has_role(auth.uid(), 'execution'));
