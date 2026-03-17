import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Globe, MapPin, Anchor, Download } from "lucide-react";
import { format, subDays, endOfDay } from "date-fns";
import * as XLSX from "xlsx";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { PageLoadingBar } from "@/components/PageLoadingBar";

const STATUS_LIST = ["Open", "On Progress", "Converted", "Lost"] as const;

const CHART_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#84cc16", "#14b8a6",
];

const MetricCard = ({
  title, value, icon: Icon, variant,
}: {
  title: string; value: number; icon: React.ElementType; variant: string;
}) => (
  <Card className="metric-card">
    <CardContent className="p-5 flex items-center gap-4">
      <div className={cn("rounded-xl p-3 shrink-0", variant)}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </CardContent>
  </Card>
);

const StatusPieChart = ({
  title, data, total,
}: {
  title: string; data: { name: string; value: number }[]; total: number;
}) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">{title}</CardTitle>
      <p className="text-xs text-muted-foreground">{total} leads</p>
    </CardHeader>
    <CardContent>
      {total === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No data</div>
      ) : (
        <>
          {/* Donut chart — no built-in legend */}
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(val: number, name: string) => [`${val} leads`, name]} />
            </PieChart>
          </ResponsiveContainer>

          {/* Custom legend rows: dot | name | % | count */}
          <div className="mt-3 space-y-2">
            {data.map((entry, i) => {
              const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
              return (
                <div key={entry.name} className="flex items-center gap-2">
                  <span
                    className="shrink-0 w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  <span className="flex-1 text-sm text-foreground truncate">{entry.name}</span>
                  <span className="text-sm text-muted-foreground w-10 text-right">{pct}%</span>
                  <span className="text-sm font-bold w-8 text-right">{entry.value}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </CardContent>
  </Card>
);

export default function AdminDashboard() {
  const { user } = useAuth();
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 30));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["dashboard-leads", format(fromDate, "yyyy-MM-dd"), format(toDate, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id,status,tour_category,assigned_employee_id,name,lead_source,created_at")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", endOfDay(toDate).toISOString());
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*");
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // Stat card counts
  const totalLeads = leads.length;
  const domesticCount = leads.filter((l) => l.tour_category === "Domestic Tour").length;
  const internationalCount = leads.filter((l) => l.tour_category === "International Tour").length;
  const cruiseCount = leads.filter((l) => l.tour_category === "Cruise").length;

  // Leads filtered by category pill
  const filteredLeads = categoryFilter === "all"
    ? leads
    : leads.filter((l) => l.tour_category === categoryFilter);

  // Build per-status employee breakdown for pie charts
  const buildChartData = (statusFilter: string | null) => {
    const pool = statusFilter
      ? filteredLeads.filter((l) => l.status === statusFilter)
      : filteredLeads;

    return employees
      .map((emp) => ({
        name: emp.name,
        value: pool.filter((l) => l.assigned_employee_id === emp.user_id).length,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  const pillOptions = [
    { label: "All", value: "all" },
    { label: "Domestic Tour", value: "Domestic Tour" },
    { label: "International Tour", value: "International Tour" },
  ];

  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const dateRange = `${format(fromDate, "MMM d, yyyy")} — ${format(toDate, "MMM d, yyyy")}`;

    // Helpers
    const count = (pool: typeof leads, status: string) =>
      pool.filter((l) => l.status === status).length;

    const grandTotal = leads.length;

    const categories = [
      { label: "All", pool: leads },
      { label: "Domestic Tour", pool: leads.filter((l) => (l as any).tour_category === "Domestic Tour") },
      { label: "International Tour", pool: leads.filter((l) => (l as any).tour_category === "International Tour") },
      { label: "Cruise", pool: leads.filter((l) => (l as any).tour_category === "Cruise") },
    ];

    // ── Sheet 1: Dashboard ────────────────────────────────────
    const aoa: any[][] = [];

    // Title block
    aoa.push(["ADVENTURE HOLIDAYS CRM — DASHBOARD REPORT"]);
    aoa.push([`Date Range: ${dateRange}`]);
    aoa.push([`Generated: ${format(new Date(), "MMM d, yyyy HH:mm")}`]);
    aoa.push([]);

    // ── Section A: Lead Summary by Category ──
    aoa.push(["LEAD SUMMARY BY CATEGORY"]);
    aoa.push(["Category", "All Leads", "Open", "On Progress", "Converted", "Lost"]);
    categories.forEach(({ label, pool }) => {
      aoa.push([
        label,
        pool.length,
        count(pool, "Open"),
        count(pool, "On Progress"),
        count(pool, "Converted"),
        count(pool, "Lost"),
      ]);
    });

    aoa.push([]);
    aoa.push([]);

    // ── Section B: Employee-wise Breakdown ──
    aoa.push(["EMPLOYEE-WISE BREAKDOWN"]);
    aoa.push(["Employee", "Total Leads", "Open", "On Progress", "Converted", "Lost"]);

    const activeEmployees = employees
      .map((emp) => ({
        emp,
        empLeads: leads.filter((l) => l.assigned_employee_id === emp.user_id),
      }))
      .filter(({ empLeads }) => empLeads.length > 0);

    activeEmployees.forEach(({ emp, empLeads }) => {
      aoa.push([
        emp.name,
        empLeads.length,
        count(empLeads, "Open"),
        count(empLeads, "On Progress"),
        count(empLeads, "Converted"),
        count(empLeads, "Lost"),
      ]);
    });

    // Totals row
    aoa.push([
      "TOTAL",
      grandTotal,
      count(leads, "Open"),
      count(leads, "On Progress"),
      count(leads, "Converted"),
      count(leads, "Lost"),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
      { wch: 14 }, { wch: 20 }, { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard");

    // ── Sheet 2: Full Lead Details ────────────────────────────
    const leadRows = leads.map((l) => ({
      "Client ID": l.client_id ?? "",
      "Enquiry Date": l.enquiry_date ? format(new Date(l.enquiry_date), "MMM d, yyyy") : "",
      "Name": l.name,
      "Phone": l.phone,
      "WhatsApp": l.whatsapp ?? "",
      "Email": l.email ?? "",
      "City": l.city ?? "",
      "State": l.state ?? "",
      "Country": l.country ?? "",
      "Destination": l.destination ?? "",
      "Duration": l.trip_duration ?? "",
      "Travelers": l.travelers ?? "",
      "Tour Category": (l as any).tour_category ?? "",
      "Source": l.lead_source ?? "",
      "Status": l.status ?? "",
      "Assigned To": employees.find((e) => e.user_id === l.assigned_employee_id)?.name ?? "",
      "Itinerary Code": l.itinerary_code ?? "",
      "Last Activity": l.last_activity_at ? format(new Date(l.last_activity_at), "MMM d, yyyy") : "",
    }));
    const leadsSheet = XLSX.utils.json_to_sheet(leadRows);
    leadsSheet["!cols"] = [
      { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
      { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
      { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
      { wch: 20 }, { wch: 18 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, leadsSheet, "Lead Details");

    XLSX.writeFile(wb, `dashboard-${format(fromDate, "yyyy-MM-dd")}-to-${format(toDate, "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={leadsLoading} />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* Separate From / To date pickers + Export */}
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                From: {format(fromDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={(d) => { if (d) setFromDate(d); }}
                disabled={(d) => d > toDate}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground text-sm">—</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                To: {format(toDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={(d) => { if (d) setToDate(d); }}
                disabled={(d) => d < fromDate}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredLeads.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Total Leads" value={totalLeads} icon={Users} variant="bg-info/10 text-info" />
        <MetricCard title="Domestic Tour" value={domesticCount} icon={MapPin} variant="bg-success/10 text-success" />
        <MetricCard title="International Tour" value={internationalCount} icon={Globe} variant="bg-warning/10 text-warning" />
        <MetricCard title="Cruise" value={cruiseCount} icon={Anchor} variant="bg-primary/10 text-primary" />
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        {pillOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setCategoryFilter(opt.value)}
            className={cn("badge-pill", categoryFilter === opt.value ? "badge-pill-active" : "badge-pill-inactive")}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 5 Pie Charts by Status × Employee */}
      <div>
        <h2 className="text-base font-semibold mb-3 text-muted-foreground">
          Lead Status Breakdown by Employee
          {categoryFilter !== "all" && <span className="ml-2 text-primary">— {categoryFilter}</span>}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <StatusPieChart
            title="All Leads"
            data={buildChartData(null)}
            total={filteredLeads.length}
          />
          {STATUS_LIST.map((status) => (
            <StatusPieChart
              key={status}
              title={status}
              data={buildChartData(status)}
              total={filteredLeads.filter((l) => l.status === status).length}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
