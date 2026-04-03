import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check, X, Eye } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function NotificationsPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = role === "admin";

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", user.id)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_dismissed: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Feature 4: Check for leads with no activity in the last 24 hours
  useEffect(() => {
    if (!user) return;
    const checkStaleLeads = async () => {
      const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: staleLeads } = await supabase
        .from("leads")
        .select("id, name, last_activity_at")
        .eq("assigned_employee_id", user.id)
        .not("status", "in", '("Converted","Lost")')
        .or(`last_activity_at.lt.${threshold},last_activity_at.is.null`);

      if (!staleLeads || staleLeads.length === 0) return;

      for (const lead of staleLeads) {
        // Skip if a reminder was already sent for this lead in the last 24h
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("recipient_id", user.id)
          .eq("lead_id", lead.id)
          .eq("type", "inactivity_reminder")
          .gte("created_at", threshold)
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from("notifications").insert({
          recipient_id: user.id,
          lead_id: lead.id,
          type: "inactivity_reminder",
          message: `No activity on Lead "${lead.name}" for the last 24 hours.`,
          is_read: false,
          is_dismissed: false,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
    };
    checkStaleLeads();
  }, [user?.id]);

  const unread = notifications.filter((n) => !n.is_read);
  const read = notifications.filter((n) => n.is_read);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Bell className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Notifications</h1>
        <span className="text-sm text-muted-foreground">({unread.length} unread)</span>
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No notifications
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card key={n.id} className={cn("transition-colors", !n.is_read && "border-primary/30 bg-primary/5")}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">{n.type}</span>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <p className="text-sm">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(n.created_at!), "MMM d, yyyy HH:mm")}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {n.lead_id && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/leads/${n.lead_id}`)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {!n.is_read && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => markRead.mutate(n.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  {!(n.is_task && !n.is_read) && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => dismiss.mutate(n.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
