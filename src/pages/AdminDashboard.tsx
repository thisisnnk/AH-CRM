import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, TrendingDown, Clock, FolderOpen } from "lucide-react";
import { format, subDays } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const MetricCard = ({ title, value, icon: Icon, variant }: { title: string; value: number; icon: React.ElementType; variant: string }) => (
  <Card className="metric-card">
    <CardContent className="p-6 flex items-center gap-4">
      <div className={cn("rounded-xl p-3", variant)}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </CardContent>
  </Card>
);

export default function AdminDashboard() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState<"whole" | "employee">("whole");

  const { data: leads = [] } = useQuery({
    queryKey: ["dashboard-leads", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*");
      return data ?? [];
    },
  });

  const { data: inactiveLeads = [] } = useQuery({
    queryKey: ["inactive-leads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*, profiles:assigned_employee_id(name)")
        .eq("status", "On Progress");
      return data ?? [];
    },
  });

  const total = leads.length;
  const converted = leads.filter((l) => l.status === "Converted").length;
  const lost = leads.filter((l) => l.status === "Lost").length;
  const onProgress = leads.filter((l) => l.status === "On Progress").length;
  const open = leads.filter((l) => l.status === "Open").length;

  const now = new Date();
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-fit">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                if (range?.from && range?.to) setDateRange({ from: range.from, to: range.to });
              }}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex gap-2 justify-center">
        <button
          onClick={() => setActiveTab("whole")}
          className={cn("badge-pill", activeTab === "whole" ? "badge-pill-active" : "badge-pill-inactive")}
        >
          Whole Dashboard
        </button>
        <button
          onClick={() => setActiveTab("employee")}
          className={cn("badge-pill", activeTab === "employee" ? "badge-pill-active" : "badge-pill-inactive")}
        >
          Employee Performance
        </button>
      </div>

      {activeTab === "whole" ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard title="Total Leads" value={total} icon={Users} variant="bg-info/10 text-info" />
            <MetricCard title="Converted" value={converted} icon={TrendingUp} variant="bg-success/10 text-success" />
            <MetricCard title="Lost" value={lost} icon={TrendingDown} variant="bg-destructive/10 text-destructive" />
            <MetricCard title="On Progress" value={onProgress} icon={Clock} variant="bg-warning/10 text-warning" />
            <MetricCard title="Open" value={open} icon={FolderOpen} variant="bg-primary/10 text-foreground" />
          </div>

          {/* Inactivity Tracker */}
          <Card>
            <CardHeader>
              <CardTitle>On-Progress Inactivity Tracker</CardTitle>
            </CardHeader>
            <CardContent>
              {categorizedInactive.length === 0 ? (
                <p className="text-muted-foreground text-sm">No inactive leads 🎉</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Lead</th>
                        <th className="text-left py-2 px-3">Employee</th>
                        <th className="text-left py-2 px-3">Destination</th>
                        <th className="text-left py-2 px-3">Last Activity</th>
                        <th className="text-left py-2 px-3">Days</th>
                        <th className="text-left py-2 px-3">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categorizedInactive.map((lead) => (
                        <tr key={lead.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3 font-medium">{lead.name}</td>
                          <td className="py-2 px-3">{(lead as any).profiles?.name ?? "—"}</td>
                          <td className="py-2 px-3">{lead.destination ?? "—"}</td>
                          <td className="py-2 px-3">
                            {lead.last_activity_at ? format(new Date(lead.last_activity_at), "MMM d, yyyy") : "Never"}
                          </td>
                          <td className="py-2 px-3 font-bold">{lead.daysInactive}</td>
                          <td className="py-2 px-3">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                              lead.category === "critical" && "inactivity-critical",
                              lead.category === "warning" && "inactivity-warning",
                              lead.category === "watch" && "inactivity-watch"
                            )}>
                              {lead.category === "critical" && "🔴 Critical"}
                              {lead.category === "warning" && "🟠 Warning"}
                              {lead.category === "watch" && "🟡 Watch"}
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
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp) => {
            const empLeads = leads.filter((l) => l.assigned_employee_id === emp.user_id);
            const eOpen = empLeads.filter((l) => l.status === "Open").length;
            const eProgress = empLeads.filter((l) => l.status === "On Progress").length;
            const eConverted = empLeads.filter((l) => l.status === "Converted").length;
            const eLost = empLeads.filter((l) => l.status === "Lost").length;
            return (
              <Card key={emp.id} className="metric-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{emp.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{empLeads.length} leads assigned</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-info" /> Open: {eOpen}</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-warning" /> Progress: {eProgress}</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-success" /> Converted: {eConverted}</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-destructive" /> Lost: {eLost}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
