-- RPC: mark_quotation_request_responded
-- Runs as SECURITY DEFINER (DB-owner rights) so it bypasses RLS.
-- Only callable by authenticated users with the 'execution' or 'admin' role.
CREATE OR REPLACE FUNCTION public.mark_quotation_request_responded(p_request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'execution') OR
    public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.quotation_requests
    SET status = 'responded'
  WHERE id = p_request_id;
END;
$$;

-- Revoke direct execute from public, grant only to authenticated
REVOKE ALL ON FUNCTION public.mark_quotation_request_responded(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_quotation_request_responded(UUID) TO authenticated;
