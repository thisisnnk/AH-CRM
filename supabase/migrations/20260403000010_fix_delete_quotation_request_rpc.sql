-- Fix: allow deleting quotation requests in 'pending' OR 'revised' status.
-- Only 'responded' requests should be protected from deletion.
CREATE OR REPLACE FUNCTION public.delete_quotation_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by UUID;
  v_status     TEXT;
BEGIN
  SELECT created_by, status
    INTO v_created_by, v_status
    FROM public.quotation_requests
   WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_created_by <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: you can only delete your own requests';
  END IF;

  IF v_status NOT IN ('pending', 'revised') THEN
    RAISE EXCEPTION 'Cannot delete a request that has already been responded to';
  END IF;

  DELETE FROM public.quotation_requests WHERE id = p_request_id;
END;
$$;
