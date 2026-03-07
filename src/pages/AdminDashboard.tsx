import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Globe, MapPin, Anchor } from "lucide-react";
import { format, subDays, endOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 30));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: leads = [] } = useQuery({
    queryKey: ["dashboard-leads", fromDate, toDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", endOfDay(toDate).toISOString());
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
      .filter((d) => d.value > 0);
  };

  const pillOptions = [
    { label: "All", value: "all" },
    { label: "Domestic Tour", value: "Domestic Tour" },
    { label: "International Tour", value: "International Tour" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* Separate From / To date pickers */}
        <div className="flex items-center gap-2">
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
