import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import type { RealtimeStatus } from "@/hooks/useRealtimeConnection";

interface TopNavProps {
  realtimeStatus: RealtimeStatus;
}

const STATUS_DOT: Record<RealtimeStatus, { className: string; title: string }> = {
  connected:    { className: "bg-green-500",               title: "Live updates active" },
  connecting:   { className: "bg-yellow-400 animate-pulse", title: "Connecting to live updates…" },
  disconnected: { className: "bg-red-500",                 title: "Live updates disconnected — reconnecting" },
};

export function TopNav({ realtimeStatus }: TopNavProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-notifications", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("is_read", false)
        .eq("is_dismissed", false);
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const dot = STATUS_DOT[realtimeStatus];

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-40">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <img
          src="https://www.adventureholidays.co/logo.png"
          alt="Adventure Holidays"
          className="h-8 object-contain md:hidden"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground hidden md:block">
          {profile?.name}
        </span>

        {/* Realtime connection status indicator */}
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${dot.className}`}
          title={dot.title}
        />

        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => navigate("/notifications")}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </div>
    </header>
  );
}
