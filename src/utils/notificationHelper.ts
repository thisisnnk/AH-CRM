import { supabase } from "@/integrations/supabase/client";

interface NotificationParams {
    recipientId: string;
    type: string;
    message: string;
    leadId?: string;
    isTask?: boolean;
}

export async function sendNotification({ recipientId, type, message, leadId, isTask }: NotificationParams) {
    const { error } = await supabase.from("notifications").insert({
        recipient_id: recipientId,
        type,
        message,
        lead_id: leadId ?? null,
        is_task: isTask ?? false,
    });
    if (error) {
        console.error("Failed to send notification:", error);
    }
}
