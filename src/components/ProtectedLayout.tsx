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

// Fires all commonly-used queries in the background as soon as auth is ready.
// By the time the user navigates to any page the data is already in cache.
function DataPrefetcher() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const isAdmin = role === "admin";

    // Employees list (used on almost every page)
    queryClient.prefetchQuery({
      queryKey: ["employees-list"],
      queryFn: async () => {
        const { data } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
        return data ?? [];
      },
      staleTime: 5 * 60_000,
    });

    // Contacts
    queryClient.prefetchQuery({
      queryKey: ["contacts"],
      queryFn: async () => {
        const { data } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });
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
        if (!isAdmin) query = query.eq("assigned_employee_id", user.id);
        const { data } = await query;
        return data ?? [];
      },
    });

    // Admin-only prefetches
    if (isAdmin) {
      queryClient.prefetchQuery({
        queryKey: ["all-employees"],
        queryFn: async () => {
          const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
          if (!profiles) return [];
          const { data: roles } = await supabase.from("user_roles").select("user_id, role");
          const roleMap = Object.fromEntries((roles ?? []).map((r) => [r.user_id, r.role]));
          return profiles.map((p) => ({ ...p, role: roleMap[p.user_id] ?? "employee" }));
        },
        staleTime: 30_000,
      });

      queryClient.prefetchQuery({
        queryKey: ["tasks-incomplete"],
        queryFn: async () => {
          const { data } = await supabase.from("tasks").select("*").neq("status", "Completed").order("created_at", { ascending: false });
          return data ?? [];
        },
      });
    }
  }, [user?.id, role]);  // run once when user/role is known

  return null;
}

export function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
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
      <DataPrefetcher />
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopNav />
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
