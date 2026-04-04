-- RPCs for accounts to update/remove bill_url on transactions
-- Runs as SECURITY DEFINER to bypass RLS; role check enforced inside.

CREATE OR REPLACE FUNCTION public.update_client_tx_bill(p_id uuid, p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'accounts') THEN
    RAISE EXCEPTION 'Unauthorized: only accounts can update bill';
  END IF;
  UPDATE public.client_transactions SET bill_url = p_url WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_client_tx_bill(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_client_tx_bill(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'accounts') THEN
    RAISE EXCEPTION 'Unauthorized: only accounts can remove bill';
  END IF;
  UPDATE public.client_transactions SET bill_url = NULL WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.remove_client_tx_bill(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_vendor_tx_bill(p_id uuid, p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'accounts') THEN
    RAISE EXCEPTION 'Unauthorized: only accounts can update bill';
  END IF;
  UPDATE public.vendor_transactions SET bill_url = p_url WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_vendor_tx_bill(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_vendor_tx_bill(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'accounts') THEN
    RAISE EXCEPTION 'Unauthorized: only accounts can remove bill';
  END IF;
  UPDATE public.vendor_transactions SET bill_url = NULL WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.remove_vendor_tx_bill(uuid) TO authenticated;
