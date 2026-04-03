-- RPC that lets an admin set a user's role and profile after signup.
-- Runs as SECURITY DEFINER so it bypasses RLS entirely.
-- Only callable by admins.
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id UUID,
  p_role    TEXT,
  p_name    TEXT,
  p_whatsapp TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Update profile
  UPDATE public.profiles
     SET name = p_name,
         whatsapp = p_whatsapp
   WHERE user_id = p_user_id;

  -- Set role — insert or update
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role::app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;
