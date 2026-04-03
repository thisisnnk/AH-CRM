import { supabase } from "@/integrations/supabase/client";

interface LogParams {
  leadId: string;
  userId: string;
  userRole: string | null;
  action: string;
  details?: string | null;
  proofUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Inserts a row into activity_logs with full Phase-6 fields.
 * Non-fatal — errors are only console-logged so they never block mutations.
 */
export async function logActivity(params: LogParams): Promise<void> {
  try {
    const { error } = await supabase.from("activity_logs").insert({
      lead_id: params.leadId,
      user_id: params.userId,
      user_role: params.userRole ?? null,
      action: params.action,
      details: params.details ?? null,
      proof_url: params.proofUrl ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
    });
    if (error) console.error("logActivity error:", error.message);
  } catch (err) {
    console.error("logActivity unexpected error:", err);
  }
}
