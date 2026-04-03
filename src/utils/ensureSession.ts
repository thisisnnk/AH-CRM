import { supabase } from "@/integrations/supabase/client";

/**
 * Call this at the top of any critical mutation before touching Supabase.
 * If the session is missing or expired it attempts a refresh; throws if that fails.
 * This prevents silent 401/RLS errors when a user fills a form for 30–60 seconds
 * and the JWT quietly expires in the background.
 */
export async function ensureSession(): Promise<void> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (!error && session) return;

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    throw new Error("Session expired. Please log in again.");
  }
}
