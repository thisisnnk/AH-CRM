import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import {
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  Clock,
  RotateCcw,
  Bell,
  CalendarIcon,
} from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { cn } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const PIE_COLORS = [
  "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

// ─── DateRangePicker ──────────────────────────────────────────────────────────

interface DateRange {
  from: Date;
  to: Date;
}

function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<"from" | "to">("from");
  const [temp, setTemp] = useState<Partial<DateRange>>(value);

  function handleDayClick(day: Date) {
    if (selecting === "from") {
      setTemp({ from: day });
      setSelecting("to");
    } else {
      const from = temp.from!;
      const to = day;
      const ordered = from <= to ? { from, to } : { from: to, to: from };
      setTemp(ordered);
      onChange(ordered);
      setOpen(false);
      setSelecting("from");
    }
  }

  const label = `${format(value.from, "MMM d, yyyy")} – ${format(value.to, "MMM d, yyyy")}`;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelecting("from"); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center gap-2 text-sm font-normal h-9"
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto" align="start">
        <div className="p-3 border-b text-xs text-muted-foreground text-center">
          {selecting === "from" ? "Select start date" : "Select end date"}
        </div>
        <Calendar
          mode="single"
          selected={selecting === "to" && temp.from ? temp.from : value.from}
          onSelect={(day) => day && handleDayClick(day)}
          modifiers={
            temp.from && temp.to
              ? { range: { from: temp.from, to: temp.to } }
              : {}
          }
          modifiersClassNames={{ range: "bg-primary/10 rounded-none" }}
          initialFocus
        />
        <div className="p-2 border-t flex gap-2">
          {[
            { label: "Today", days: 0 },
            { label: "Last 7d", days: 7 },
            { label: "Last 30d", days: 30 },
          ].map(({ label: l, days }) => (
            <Button
              key={l}
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                const to = new Date();
                const from = days === 0 ? startOfDay(to) : subDays(to, days);
                onChange({ from, to });
                setOpen(false);
              }}
            >
              {l}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── ExecutionPage ────────────────────────────────────────────────────────────

export default function ExecutionPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");

  // ── Switch to completed tab + force refetch when returning from respond page ──
  useEffect(() => {
    const state = location.state as { tab?: string } | null;
    if (state?.tab === "completed") {
      setActiveTab("completed");
      queryClient.refetchQueries({ queryKey: ["exec-analytics-pending"] });
      queryClient.refetchQueries({ queryKey: ["exec-analytics-completed"] });
      queryClient.refetchQueries({ queryKey: queryKeys.allQuotationRequests() });
      // Clear the state so a manual back-navigation doesn't re-trigger this
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state]);

  // ── Real-time: auto-refresh when new requests arrive ─────────────────────────

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("exec-qr-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quotation_requests" },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.allQuotationRequests() });
          toast({
            title: "New quotation request",
            description: "A new request has just come in.",
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quotation_requests" },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.allQuotationRequests() });
          queryClient.invalidateQueries({ queryKey: ["responded-quotation-requests"] });
          queryClient.invalidateQueries({ queryKey: ["exec-analytics-pending"] });
          queryClient.invalidateQueries({ queryKey: ["exec-analytics-completed"] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  // ── Live pending/revision requests (no date filter — always show all) ────────

  const { data: requests = [], isLoading } = useQuery({
    queryKey: queryKeys.allQuotationRequests(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_requests")
        .select("*, leads(id, name, destination, status, assigned_employee_id)")
        .in("status", ["pending", "revised"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // ── Analytics queries (date-filtered) ────────────────────────────────────────

  const fromISO = startOfDay(dateRange.from).toISOString();
  const toISO = endOfDay(dateRange.to).toISOString();

  // Pending requests created within date range
  const { data: filteredPending = [], isLoading: loadingAnalytics } = useQuery({
    queryKey: ["exec-analytics-pending", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_requests")
        .select("*, leads(id, name, destination, status, assigned_employee_id)")
        .in("status", ["pending", "revised"])
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Completed responses: find quotations (responses) created within date range,
  // then fetch the parent requests. This works because quotation_requests has no
  // updated_at, but the quotations table records when the response was submitted.
  const { data: filteredCompleted = [], isLoading: loadingCompleted } = useQuery({
    queryKey: ["exec-analytics-completed", fromISO, toISO],
    queryFn: async () => {
      // Step 1: get request_ids where a quotation was submitted in the date range
      const { data: quotations, error: qErr } = await supabase
        .from("quotations")
        .select("id, request_id, created_at, created_by, pricing_data, notes, version")
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (qErr) throw qErr;

      const requestIds = [...new Set((quotations ?? []).map((q: any) => q.request_id))];
      if (requestIds.length === 0) return [];

      // Step 2: fetch those requests with their lead info
      const { data, error } = await supabase
        .from("quotation_requests")
        .select("*, leads(id, name, destination, status, assigned_employee_id)")
        .in("id", requestIds)
        .eq("status", "responded");
      if (error) throw error;

      // Group quotations by request_id (there may be multiple versions)
      const quotationsByRequest: Record<string, any[]> = {};
      for (const q of quotations ?? []) {
        if (!quotationsByRequest[q.request_id]) quotationsByRequest[q.request_id] = [];
        quotationsByRequest[q.request_id].push(q);
      }

      // Attach the responded_at timestamp + quotation list for display
      return (data ?? []).map((r: any) => {
        const reqQuots = quotationsByRequest[r.id] ?? [];
        const latest = reqQuots[reqQuots.length - 1];
        return {
          ...r,
          responded_at: latest?.created_at ?? null,
          responded_by: latest?.created_by ?? null,
          quotations: reqQuots,
        };
      });
    },
    enabled: !!user,
  });

  // Fetch profiles for name resolution
  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of profiles) m[p.user_id] = p.name;
    return m;
  }, [profiles]);

  // Build pie data: group by created_by (the sales employee who requested)
  function buildPieData(rows: any[]) {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const name = profileMap[r.created_by] ?? "Unknown";
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }

  const pendingPieData = useMemo(() => buildPieData(filteredPending), [filteredPending, profileMap]);
  const completedPieData = useMemo(() => buildPieData(filteredCompleted), [filteredCompleted, profileMap]);


  function openRespond(reqId: string) {
    navigate(`/execution/respond/${reqId}`);
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={isLoading || loadingAnalytics || loadingCompleted} />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Execution</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {requests.length} pending request{requests.length !== 1 ? "s" : ""}
            {filteredCompleted.length > 0 && ` · ${filteredCompleted.length} responded`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          {requests.length > 0 && (
            <Badge className="text-xs bg-amber-500 text-white border-amber-500 animate-pulse">
              <Bell className="h-3 w-3 mr-1" />
              {requests.length} pending
            </Badge>
          )}
        </div>
      </div>

      {/* ── Pie Charts ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pending by employee */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Pending Requests · By Employee
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {pendingPieData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                No pending requests in this range
              </div>
            ) : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pendingPieData}
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pendingPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, name) => [`${val} request${Number(val) !== 1 ? "s" : ""}`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ paddingBottom: 40 }}>
                  <span className="text-2xl font-bold leading-none">{filteredPending.length}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">requests</span>
                </div>
                {/* Employee breakdown */}
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
                  {pendingPieData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                      <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-semibold">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed by employee */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Completed Responses · By Employee
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {completedPieData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                No responses in this range
              </div>
            ) : (
              <div className="relative">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={completedPieData}
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {completedPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, name) => [`${val} response${Number(val) !== 1 ? "s" : ""}`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ paddingBottom: 40 }}>
                  <span className="text-2xl font-bold leading-none">{filteredCompleted.length}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">responded</span>
                </div>
                {/* Employee breakdown */}
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1">
                  {completedPieData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                      <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-semibold">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Pills + Tables ───────────────────────────────────────────────────── */}
      <div>
        {/* Pills */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <button
            onClick={() => setActiveTab("pending")}
            className={cn("badge-pill inline-flex items-center gap-1.5", activeTab === "pending" ? "badge-pill-active" : "badge-pill-inactive")}
          >
            <Clock className="h-3.5 w-3.5" />
            Pending
            <span className="inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 min-w-[20px] h-5 leading-none bg-black text-white">
              {filteredPending.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("completed")}
            className={cn("badge-pill inline-flex items-center gap-1.5", activeTab === "completed" ? "badge-pill-active" : "badge-pill-inactive")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completed
            <span className="inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 min-w-[20px] h-5 leading-none bg-black text-white">
              {filteredCompleted.length}
            </span>
          </button>
        </div>

        {/* Tables */}
        {activeTab === "pending" && (
          <Card>
            <CardContent className="p-0">
              {filteredPending.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="h-7 w-7 mx-auto mb-2 opacity-25" />
                  No pending requests in this date range
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Lead</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Destination</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Requested By</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPending.map((req: any) => {
                      const lead = req.leads as any;
                      const td = (req.trip_details as any) ?? {};
                      const isRevision = req.status === "revised";
                      const isPendingLive = requests.some((r) => r.id === req.id);
                      return (
                        <tr key={req.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium">{lead?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{td.destination ?? lead?.destination ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{profileMap[req.created_by] ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {req.created_at ? format(new Date(req.created_at), "MMM d, yyyy") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {isRevision ? (
                              <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                                <RotateCcw className="h-2.5 w-2.5 mr-1" /> Revision
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Pending</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => navigate(`/leads/${lead?.id}`)}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" /> Lead
                              </Button>
                              {isPendingLive && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => openRespond(req.id)}
                                >
                                  Respond <ChevronRight className="h-3 w-3 ml-1" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "completed" && (
          <Card>
            <CardContent className="p-0">
              {filteredCompleted.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No completed responses in this date range
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Lead</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Destination</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Requested By</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompleted.map((req: any) => {
                      const lead = req.leads as any;
                      const td = (req.trip_details as any) ?? {};

                      return (
                        <tr key={req.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium">{lead?.name ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{td.destination ?? lead?.destination ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{profileMap[req.created_by] ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {req.responded_at ? format(new Date(req.responded_at), "MMM d, yyyy") : req.created_at ? format(new Date(req.created_at), "MMM d, yyyy") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="text-xs bg-green-600 text-white border-green-600">
                              ✓ Responded
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => navigate(`/leads/${lead?.id}`)}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" /> Lead
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => navigate(`/execution/respond/${req.id}`)}
                              >
                                View Response <ChevronRight className="h-3 w-3 ml-1" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
