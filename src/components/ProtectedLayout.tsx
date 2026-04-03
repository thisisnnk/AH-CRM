import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TopNav } from "@/components/TopNav";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, endOfDay, format } from "date-fns";
import { useRealtimeConnection } from "@/hooks/useRealtimeConnection";

export function ProtectedLayout() {
  const { user, role, loading } = useAuth();
  const queryClient = useQueryClient();

  // All hooks must be called before any early returns (React rules of hooks).
  // The useEffect guards with `if (!user || !role) return` internally.

  const realtimeStatus = useRealtimeConnection(user?.id);

  // Prefetch commonly-used queries as soon as both user and role are resolved.
  // By the time the user navigates to any page the data is already in cache.
  useEffect(() => {
    if (!user || !role) return;

    const isAdmin = role === "admin";
    const canSeeAllLeads = role === "admin" || role === "execution" || role === "accounts";

    // Employees list (used on almost every page)
    queryClient.prefetchQuery({
      queryKey: ["employees-list"],
      queryFn: async () => {
        const { data, error } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 5 * 60_000,
    });

    // Contacts
    queryClient.prefetchQuery({
      queryKey: ["contacts"],
      queryFn: async () => {
        const { data, error } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return data ?? [];
      },
    });

    // Leads (last 90 days — matches LeadsPage default)
    const from = subDays(new Date(), 90);
    const to = new Date();
    queryClient.prefetchQuery({
      queryKey: ["leads", format(from, "yyyy-MM-dd"), format(to, "yyyy-MM-dd"), user.id, role],
      queryFn: async () => {
        let query = supabase
          .from("leads")
          .select("*")
          .gte("created_at", from.toISOString())
          .lte("created_at", endOfDay(to).toISOString())
          .order("created_at", { ascending: false });
        if (!canSeeAllLeads) query = query.eq("assigned_employee_id", user.id);
        const { data, error } = await query;
        if (error) throw error;
        return data ?? [];
      },
    });

    // Admin-only prefetches
    if (isAdmin) {
      // Dashboard leads (last 30 days — matches AdminDashboard default date range)
      const dashFrom = subDays(new Date(), 30);
      const dashTo = new Date();
      queryClient.prefetchQuery({
        queryKey: ["dashboard-leads", format(dashFrom, "yyyy-MM-dd"), format(dashTo, "yyyy-MM-dd")],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("leads")
            .select("id,status,tour_category,assigned_employee_id,name,lead_source,created_at")
            .gte("created_at", dashFrom.toISOString())
            .lte("created_at", endOfDay(dashTo).toISOString());
          if (error) throw error;
          return data ?? [];
        },
      });

      queryClient.prefetchQuery({
        queryKey: ["all-employees"],
        queryFn: async () => {
          const { data: profiles, error: profilesErr } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
          if (profilesErr) throw profilesErr;
          if (!profiles) return [];
          const { data: roles, error: rolesErr } = await supabase.from("user_roles").select("user_id, role");
          if (rolesErr) throw rolesErr;
          const roleMap = Object.fromEntries((roles ?? []).map((r) => [r.user_id, r.role]));
          return profiles.map((p) => ({ ...p, role: roleMap[p.user_id] ?? "employee" }));
        },
        staleTime: 30_000,
      });

      queryClient.prefetchQuery({
        queryKey: ["tasks-incomplete"],
        queryFn: async () => {
          const { data, error } = await supabase.from("tasks").select("*").neq("status", "Completed").order("created_at", { ascending: false });
          if (error) throw error;
          return data ?? [];
        },
      });
    }
  }, [user?.id, role]);

  // Wait for BOTH user and role to be resolved before mounting children.
  // Without this, pages mount with role=null, fire queries with a null-role
  // key, and the prefetcher's data (keyed with the real role) never matches.
  if (loading || (user && role === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopNav realtimeStatus={realtimeStatus} />
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function AdminRoute() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function SalesRoute() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "admin" && role !== "employee") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function ExecutionRoute() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "admin" && role !== "execution") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function AccountsRoute() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "admin" && role !== "accounts") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function ItineraryRoute() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "admin" && role !== "itinerary") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
