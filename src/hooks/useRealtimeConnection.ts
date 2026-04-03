import { useState, useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RealtimeStatus = "connecting" | "connected" | "disconnected";

/**
 * Manages a single global Supabase realtime channel for the logged-in user.
 *
 * Handles all the ways a WebSocket connection can die silently:
 *   - CHANNEL_ERROR / TIMED_OUT  → exponential-backoff reconnect (2s → 4s → 8s … max 30s)
 *   - Tab hidden then visible     → reconnect on visibilitychange
 *   - Network offline then online → reconnect on window online event
 *
 * On any change it invalidates the relevant React Query keys so every page
 * that uses those keys automatically re-fetches fresh data.
 *
 * Returns a status string the UI can use to show a connection indicator.
 */
export function useRealtimeConnection(userId: string | undefined): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  // Use refs so the inner `connect` closure always sees the latest values
  // without needing them as effect dependencies (which would cause reconnect loops).
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!userId) {
      setStatus("disconnected");
      return;
    }

    const clearRetry = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const connect = () => {
      if (!mountedRef.current) return;
      clearRetry();

      // Tear down any existing channel before creating a new one.
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      setStatus("connecting");

      const channel = supabase
        .channel(`global-rt-${userId}`)
        // Lead changes — invalidate all lead list/dashboard queries
        .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
          queryClient.invalidateQueries({ queryKey: ["leads"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-leads"] });
        })
        // Notifications for THIS user only — server-side filter keeps other users'
        // events off the wire entirely (more efficient than client-side filtering).
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        }, () => {
          // Invalidate both keys so NotificationsPage AND TopNav badge both update.
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
        })
        // Task changes — invalidate task lists
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
          queryClient.invalidateQueries({ queryKey: ["tasks-incomplete"] });
          queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
        })
        .subscribe((s, err) => {
          if (!mountedRef.current) return;

          if (s === "SUBSCRIBED") {
            setStatus("connected");
            retryCountRef.current = 0; // reset backoff on successful connect
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
            console.error(`Realtime ${s}:`, err);
            setStatus("disconnected");
            // Exponential backoff: 2 s → 4 s → 8 s → 16 s → 30 s (capped)
            const delay = Math.min(2000 * 2 ** retryCountRef.current, 30_000);
            retryCountRef.current += 1;
            retryTimerRef.current = setTimeout(connect, delay);
          } else if (s === "CLOSED") {
            setStatus("disconnected");
            // CLOSED can fire after a network drop; attempt one reconnect.
            retryTimerRef.current = setTimeout(connect, 3_000);
          }
        });

      channelRef.current = channel;
    };

    connect();

    // Reconnect when the user returns to the tab (handles phone sleep/wake,
    // browser tab switching, screen lock, etc.).
    const onVisibility = () => {
      if (document.visibilityState === "visible") connect();
    };

    // Reconnect when the device regains network access.
    const onOnline = () => connect();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      mountedRef.current = false;
      clearRetry();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [userId]); // Re-run only when the logged-in user changes

  return status;
}
