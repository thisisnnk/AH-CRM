import { supabase } from "@/integrations/supabase/client";

/**
 * Sends a WhatsApp message via the `send-whatsapp` Supabase Edge Function.
 * The function uses Meta WhatsApp Cloud API with sender +91 96004 79189.
 *
 * `to` should be the full phone number including country code (e.g. "+919876543210" or "919876543210").
 */
export async function sendWhatsAppMessage(to: string, message: string): Promise<void> {
  if (!to) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const { error } = await supabase.functions.invoke("send-whatsapp", {
      body: { to, message },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (error) {
      console.error("sendWhatsAppMessage error:", error);
    }
  } catch (err) {
    console.error("sendWhatsAppMessage unexpected error:", err);
  }
}

/**
 * Looks up an employee's WhatsApp number from the profiles table,
 * then sends a WhatsApp message.
 */
export async function sendWhatsAppToEmployee(employeeId: string, message: string): Promise<void> {
  if (!employeeId) return;

  try {
    const { data } = await supabase
      .from("profiles")
      .select("whatsapp")
      .eq("user_id", employeeId)
      .maybeSingle();

    const phone = data?.whatsapp;
    if (!phone) {
      console.warn(`No WhatsApp number found for employee ${employeeId}`);
      return;
    }

    await sendWhatsAppMessage(phone, message);
  } catch (err) {
    console.error("sendWhatsAppToEmployee error:", err);
  }
}
