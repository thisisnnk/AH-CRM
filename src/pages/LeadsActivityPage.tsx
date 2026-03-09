import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Search, CalendarIcon, Clock } from "lucide-react";
import { PageLoadingBar } from "@/components/PageLoadingBar";

const isRelevantAction = (action: string) =>
  action === "Submitted itinerary" ||
  action === "Created task" ||
  action.startsWith("Added Revision") ||
  action.startsWith("Changed status to");

export default function LeadsActivityPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const now = new Date();

  // ── Activity Tracker state ──
  const [search, setSearch] = useState("");
  const [filterAssignees, setFilterAssignees] = useState<string[]>([]);

  // ── Date / Time filter state (Activity Tracker) ──
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");

  // ── Inactivity Tracker state ──
  const [inactivityFilter, setInactivityFilter] = useState<"all" | "critical" | "warning" | "watch">("all");
  const [filterInactivityAssignees, setFilterInactivityAssignees] = useState<string[]>([]);

  // ── Queries ──
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  // Raw activity logs + lead data — fetched independently, no employee dependency
  const { data: rawActivities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["all-activity-logs"],
    queryFn: async () => {
      const { data: logs } = await supabase
        .from("activity_logs")
        .select("*")
        .order("timestamp", { ascending: false });
      if (!logs) return [];

      const leadIds = [...new Set(logs.map((l) => l.lead_id).filter(Boolean))];
      if (leadIds.length === 0) return [];

      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, client_id, assigned_employee_id")
        .in("id", leadIds);

      const leadMap = Object.fromEntries((leads ?? []).map((l) => [l.id, l]));

      return logs
        .filter((a) => isRelevantAction(a.action ?? ""))
        .map((a) => {
          const lead = leadMap[a.lead_id];
          return {
            ...a,
            leadName: lead?.name ?? "—",
            clientId: lead?.client_id ?? "—",
            assignedEmployeeId: lead?.assigned_employee_id ?? null,
            performedById: a.user_id ?? null,
          };
        });
    },
    staleTime: 60_000,
  });

  // Enrich with employee names once employees are loaded (names show "—" until then)
  const activities = useMemo(() => {
    const empMap = Object.fromEntries(employees.map((e) => [e.user_id, e.name]));
    return rawActivities.map((a) => ({
      ...a,
      assignedTo: empMap[a.assignedEmployeeId ?? ""] ?? "—",
      performedBy: empMap[a.performedById ?? ""] ?? "—",
    }));
  }, [rawActivities, employees]);

  const { data: inactiveLeads = [], isLoading: inactiveLoading } = useQuery({
    queryKey: ["inactive-leads-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name, client_id, phone, itinerary_code, assigned_employee_id, last_activity_at")
        .eq("status", "On Progress");
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // ── Realtime subscription: refresh activity table on any insert ──
  useEffect(() => {
    const channel = supabase
      .channel("activity-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["all-activity-logs"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // ── Inactivity categorization ──
  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.user_id, e.name])), [employees]);

  const categorizedInactive = inactiveLeads
    .map((l) => {
      const days = l.last_activity_at
        ? Math.floor((now.getTime() - new Date(l.last_activity_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      const category = days >= 7 ? "critical" : days >= 4 ? "warning" : days >= 1 ? "watch" : null;
      return { ...l, days, category, assignedTo: empMap[l.assigned_employee_id ?? ""] ?? "—" };
    })
    .filter((l) => l.category)
    .sort((a, b) => b.days - a.days);

  const counts = {
    critical: categorizedInactive.filter((l) => l.category === "critical").length,
    warning: categorizedInactive.filter((l) => l.category === "warning").length,
    watch: categorizedInactive.filter((l) => l.category === "watch").length,
  };

  const visibleInactive = categorizedInactive
    .filter((l) => inactivityFilter === "all" || l.category === inactivityFilter)
    .filter((l) =>
      filterInactivityAssignees.length === 0 || filterInactivityAssignees.includes(l.assigned_employee_id ?? "")
    );

  // ── Activity Tracker filtering ──
  const filteredActivities = activities.filter((a) => {
    if (filterAssignees.length > 0 && !filterAssignees.includes(a.performedById ?? "")) return false;

    if (dateFrom || dateTo) {
      if (!a.timestamp) return false;
      const d = format(new Date(a.timestamp), "yyyy-MM-dd");
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
    }

    if (timeFrom || timeTo) {
      if (!a.timestamp) return false;
      const t = format(new Date(a.timestamp), "HH:mm");
      if (timeFrom && t < timeFrom) return false;
      if (timeTo && t > timeTo) return false;
    }

    if (search) {
      const s = search.toLowerCase();
      return (
        a.leadName.toLowerCase().includes(s) ||
        a.clientId.toLowerCase().includes(s) ||
        (a.action ?? "").toLowerCase().includes(s) ||
        a.assignedTo.toLowerCase().includes(s) ||
        a.performedBy.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const inactivityPills = [
    { key: "critical" as const, label: "Critical", color: "text-red-500" },
    { key: "warning" as const, label: "Warning", color: "text-orange-500" },
    { key: "watch" as const, label: "Watch", color: "text-yellow-500" },
  ];

  const hasDateFilter = dateFrom || dateTo;
  const hasTimeFilter = timeFrom || timeTo;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={activitiesLoading || inactiveLoading} />
      <h1 className="text-2xl font-bold">Leads Activity</h1>

      <Tabs defaultValue="activity">
        {/* Centered tab list with underline-style active indicator */}
        <div className="flex justify-center border-b mb-4">
          <TabsList className="bg-transparent rounded-none gap-0 p-0 h-auto">
            <TabsTrigger
              value="activity"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 pb-2 pt-1 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
            >
              Activity Tracker
            </TabsTrigger>
            <TabsTrigger
              value="inactivity"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 pb-2 pt-1 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
            >
              Inactivity Tracker
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ═══ ACTIVITY TRACKER ═══ */}
        <TabsContent value="activity" className="space-y-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by lead, client ID, activity..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Table */}
          <div className="overflow-auto rounded-lg border" style={{ maxHeight: "70vh" }}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  {/* Date column with date-range filter */}
                  <th className="text-left py-3 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      Date
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className={cn(
                              "inline-flex items-center justify-center rounded p-0.5 hover:bg-black/10",
                              hasDateFilter ? "text-primary" : "text-muted-foreground"
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CalendarIcon className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs font-semibold text-muted-foreground mb-3">Filter by Date Range</p>
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">From</label>
                              <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">To</label>
                              <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </div>
                          </div>
                          {hasDateFilter && (
                            <button
                              onClick={() => { setDateFrom(""); setDateTo(""); }}
                              className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t"
                            >
                              Clear
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </span>
                  </th>

                  {/* Time column with time-range filter */}
                  <th className="text-left py-3 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      Time
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className={cn(
                              "inline-flex items-center justify-center rounded p-0.5 hover:bg-black/10",
                              hasTimeFilter ? "text-primary" : "text-muted-foreground"
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs font-semibold text-muted-foreground mb-3">Filter by Time Range</p>
                          <div className="space-y-2">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">From</label>
                              <input
                                type="time"
                                value={timeFrom}
                                onChange={(e) => setTimeFrom(e.target.value)}
                                className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">To</label>
                              <input
                                type="time"
                                value={timeTo}
                                onChange={(e) => setTimeTo(e.target.value)}
                                className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </div>
                          </div>
                          {hasTimeFilter && (
                            <button
                              onClick={() => { setTimeFrom(""); setTimeTo(""); }}
                              className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t"
                            >
                              Clear
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </span>
                  </th>

                  <th className="text-left py-3 px-4 whitespace-nowrap">Activity</th>
                  <th className="text-left py-3 px-4 whitespace-nowrap">Lead Name</th>
                  <th className="text-left py-3 px-4 whitespace-nowrap">Client ID</th>
                  <th className="text-left py-3 px-4 whitespace-nowrap">Assigned To</th>

                  {/* Performed By with employee filter */}
                  <th className="text-left py-3 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      Performed By
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className={cn(
                              "inline-flex items-center justify-center rounded p-0.5 hover:bg-black/10",
                              filterAssignees.length > 0 ? "text-primary" : "text-muted-foreground"
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by Employee</p>
                          <div className="space-y-0.5 max-h-48 overflow-y-auto">
                            {employees.map((emp) => (
                              <label key={emp.user_id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm font-normal">
                                <Checkbox
                                  checked={filterAssignees.includes(emp.user_id)}
                                  onCheckedChange={(checked) =>
                                    setFilterAssignees(checked
                                      ? [...filterAssignees, emp.user_id]
                                      : filterAssignees.filter((v) => v !== emp.user_id)
                                    )
                                  }
                                />
                                <span className="flex-1">{emp.name}</span>
                              </label>
                            ))}
                          </div>
                          {filterAssignees.length > 0 && (
                            <button onClick={() => setFilterAssignees([])} className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t">
                              Clear
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {activitiesLoading ? (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : filteredActivities.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No activities found</td></tr>
                ) : (
                  filteredActivities.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => a.lead_id && navigate(`/leads/${a.lead_id}`)}
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                        {a.timestamp ? format(new Date(a.timestamp), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                        {a.timestamp ? format(new Date(a.timestamp), "hh:mm a") : "—"}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-medium">{a.action}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{a.leadName}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">{a.clientId}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">{a.assignedTo}</td>
                      <td className="py-3 px-4 whitespace-nowrap font-medium">{a.performedBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ═══ INACTIVITY TRACKER ═══ */}
        <TabsContent value="inactivity" className="space-y-4">
          {/* Category Pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setInactivityFilter("all")}
              className={cn("badge-pill inline-flex items-center gap-1.5", inactivityFilter === "all" ? "badge-pill-active" : "badge-pill-inactive")}
            >
              All
              <span className={cn("inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 min-w-[20px] h-5 leading-none bg-black", inactivityFilter === "all" ? "text-primary" : "text-white")}>
                {categorizedInactive.length}
              </span>
            </button>
            {inactivityPills.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setInactivityFilter(key)}
                className={cn("badge-pill inline-flex items-center gap-1.5", inactivityFilter === key ? "badge-pill-active" : "badge-pill-inactive")}
              >
                <span className={color}>●</span> {label}
                <span className={cn("inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 min-w-[20px] h-5 leading-none bg-black", inactivityFilter === key ? "text-primary" : "text-white")}>
                  {counts[key]}
                </span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-auto rounded-lg border" style={{ maxHeight: "70vh" }}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="text-left py-3 px-4 whitespace-nowrap">Itinerary Code</th>
                  <th className="text-left py-3 px-4 whitespace-nowrap">Client ID</th>
                  <th className="text-left py-3 px-4 whitespace-nowrap">Name</th>
                  <th className="text-left py-3 px-4 whitespace-nowrap">Phone Number</th>
                  {/* Assigned To with employee filter */}
                  <th className="text-left py-3 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      Assigned To
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className={cn(
                              "inline-flex items-center justify-center rounded p-0.5 hover:bg-black/10",
                              filterInactivityAssignees.length > 0 ? "text-primary" : "text-muted-foreground"
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by Employee</p>
                          <div className="space-y-0.5 max-h-48 overflow-y-auto">
                            {employees.map((emp) => (
                              <label key={emp.user_id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm font-normal">
                                <Checkbox
                                  checked={filterInactivityAssignees.includes(emp.user_id)}
                                  onCheckedChange={(checked) =>
                                    setFilterInactivityAssignees(checked
                                      ? [...filterInactivityAssignees, emp.user_id]
                                      : filterInactivityAssignees.filter((v) => v !== emp.user_id)
                                    )
                                  }
                                />
                                <span className="flex-1">{emp.name}</span>
                              </label>
                            ))}
                          </div>
                          {filterInactivityAssignees.length > 0 && (
                            <button onClick={() => setFilterInactivityAssignees([])} className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t">
                              Clear
                            </button>
                          )}
                        </PopoverContent>
                      </Popover>
                    </span>
                  </th>
                  <th className="text-left py-3 px-4 whitespace-nowrap">Days Inactive</th>
                </tr>
              </thead>
              <tbody>
                {inactiveLoading ? (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : visibleInactive.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No inactive leads</td></tr>
                ) : (
                  visibleInactive.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">{lead.itinerary_code ?? "—"}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">{lead.client_id ?? "—"}</td>
                      <td className="py-3 px-4 whitespace-nowrap font-medium">{lead.name}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{lead.phone ?? "—"}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{lead.assignedTo}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                          lead.category === "critical" && "inactivity-critical",
                          lead.category === "warning" && "inactivity-warning",
                          lead.category === "watch" && "inactivity-watch"
                        )}>
                          {lead.category === "critical" && `${lead.days} days — Critical`}
                          {lead.category === "warning" && `${lead.days} days — Warning`}
                          {lead.category === "watch" && `${lead.days} days — Watch`}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
