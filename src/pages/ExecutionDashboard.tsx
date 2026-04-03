import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, subDays } from "date-fns";
import { Briefcase, ClipboardList, IndianRupee, ChevronRight, TrendingDown } from "lucide-react";
import { PageLoadingBar } from "@/components/PageLoadingBar";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function ExecutionDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: pendingRequests = [], isLoading: loadingReqs } = useQuery({
    queryKey: ["exec-dash-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_requests")
        .select("*, leads(id, name, destination, status)")
        .in("status", ["pending", "revised"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  const { data: activeTrips = [], isLoading: loadingTrips } = useQuery({
    queryKey: ["exec-dash-trips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, destination, status, total_expected")
        .eq("status", "Converted")
        .order("updated_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  const { data: recentExpenses = [], isLoading: loadingExp } = useQuery({
    queryKey: ["exec-dash-expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_transactions")
        .select("*, leads(name)")
        .gte("created_at", subDays(new Date(), 30).toISOString())
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  const totalRecentExpense = recentExpenses.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const isLoading = loadingReqs || loadingTrips || loadingExp;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={isLoading} />
      <div>
        <h1 className="text-2xl font-bold">Execution Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your work overview</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-amber-100 dark:bg-amber-900/30 shrink-0">
              <ClipboardList className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending Requests</p>
              <p className="text-2xl font-bold">{pendingRequests.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-green-100 dark:bg-green-900/30 shrink-0">
              <Briefcase className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Trips</p>
              <p className="text-2xl font-bold">{activeTrips.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-red-100 dark:bg-red-900/30 shrink-0">
              <TrendingDown className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expenses (30d)</p>
              <p className="text-xl font-bold text-red-500">₹{fmt(totalRecentExpense)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Quotation Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Pending Quotation Requests</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/execution")}>
                View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {pendingRequests.slice(0, 5).map((req: any) => {
              const lead = req.leads;
              return (
                <div key={req.id} className="flex items-center justify-between px-6 py-3 border-t hover:bg-muted/20 transition-colors">
                  <div>
                    <p className="font-medium text-sm">{lead?.name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      {lead?.destination ?? ""} · {req.created_at ? format(new Date(req.created_at), "MMM d") : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={req.status === "revised" ? "secondary" : "outline"} className="text-xs">
                      {req.status}
                    </Badge>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate("/execution")}>
                      Respond
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Active Trips */}
      {activeTrips.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Trips</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activeTrips.map((lead: any) => (
              <div
                key={lead.id}
                className="flex items-center justify-between px-6 py-3 border-t hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => navigate(`/leads/${lead.id}`)}
              >
                <div>
                  <p className="font-medium text-sm">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">{lead.destination ?? "No destination"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {lead.total_expected && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <IndianRupee className="h-3 w-3" />{fmt(Number(lead.total_expected))}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
