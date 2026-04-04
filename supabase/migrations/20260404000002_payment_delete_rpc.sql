-- RPC: delete a client transaction (revenue payment)
-- Runs as SECURITY DEFINER so it bypasses RLS; we enforce role checks inside.
CREATE OR REPLACE FUNCTION public.delete_client_transaction(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'employee') OR
    has_role(auth.uid(), 'execution')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admin, employee, or execution can delete payments';
  END IF;

  DELETE FROM public.client_transactions WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_transaction(uuid) TO authenticated;

-- RPC: delete a vendor transaction (expense payment)
CREATE OR REPLACE FUNCTION public.delete_vendor_transaction(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'execution')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admin or execution can delete expenses';
  END IF;

  DELETE FROM public.vendor_transactions WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_vendor_transaction(uuid) TO authenticated;
