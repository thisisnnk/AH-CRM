import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function LeadsActivityPage() {
  const navigate = useNavigate();
  const now = new Date();

  const { data: inactiveLeads = [], isLoading } = useQuery({
    queryKey: ["inactive-leads-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*, profiles:assigned_employee_id(name)")
        .eq("status", "On Progress");
      return data ?? [];
    },
    refetchOnMount: "always",
  });

  const getInactivityCategory = (lastActivity: string | null) => {
    if (!lastActivity) return "critical";
    const days = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
    if (days >= 7) return "critical";
    if (days >= 4) return "warning";
    if (days >= 1) return "watch";
    return null;
  };

  const categorizedInactive = inactiveLeads
    .map((l) => ({
      ...l,
      category: getInactivityCategory(l.last_activity_at),
      daysInactive: l.last_activity_at
        ? Math.floor((now.getTime() - new Date(l.last_activity_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999,
    }))
    .filter((l) => l.category)
    .sort((a, b) => b.daysInactive - a.daysInactive);

  const critical = categorizedInactive.filter((l) => l.category === "critical");
  const warning = categorizedInactive.filter((l) => l.category === "warning");
  const watch = categorizedInactive.filter((l) => l.category === "watch");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leads Activity</h1>
        <div className="flex gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-destructive inline-block" /> Critical ({critical.length})</span>
          <span className="flex items-center gap-1 ml-3"><span className="w-3 h-3 rounded-full bg-warning inline-block" /> Warning ({warning.length})</span>
          <span className="flex items-center gap-1 ml-3"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Watch ({watch.length})</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>On-Progress Inactivity Tracker</CardTitle>
          <p className="text-sm text-muted-foreground">Leads in "On Progress" status that haven't had activity recently</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : categorizedInactive.length === 0 ? (
            <p className="text-muted-foreground text-sm">No inactive leads 🎉</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-3 px-4">Lead</th>
                    <th className="text-left py-3 px-4">Employee</th>
                    <th className="text-left py-3 px-4">Destination</th>
                    <th className="text-left py-3 px-4">Tour Category</th>
                    <th className="text-left py-3 px-4">Last Activity</th>
                    <th className="text-left py-3 px-4">Days Inactive</th>
                    <th className="text-left py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {categorizedInactive.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      <td className="py-3 px-4 font-medium">{lead.name}</td>
                      <td className="py-3 px-4">{(lead as any).profiles?.name ?? "—"}</td>
                      <td className="py-3 px-4">{lead.destination ?? "—"}</td>
                      <td className="py-3 px-4">{(lead as any).tour_category ?? "—"}</td>
                      <td className="py-3 px-4">
                        {lead.last_activity_at ? format(new Date(lead.last_activity_at), "MMM d, yyyy") : "Never"}
                      </td>
                      <td className="py-3 px-4 font-bold">{lead.daysInactive}</td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                          lead.category === "critical" && "inactivity-critical",
                          lead.category === "warning" && "inactivity-warning",
                          lead.category === "watch" && "inactivity-watch"
                        )}>
                          {lead.category === "critical" && "🔴 Critical (7+ days)"}
                          {lead.category === "warning" && "🟠 Warning (4–6 days)"}
                          {lead.category === "watch" && "🟡 Watch (1–3 days)"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
