import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, TrendingDown, Clock, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: leads = [] } = useQuery({
    queryKey: ["my-leads", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("leads").select("*").eq("assigned_employee_id", user.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["my-tasks", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("tasks")
        .select("*, leads(name)")
        .eq("assigned_employee_id", user.id)
        .order("follow_up_date", { ascending: true });
      return data ?? [];
    },
    enabled: !!user,
  });

  const total = leads.length;
  const converted = leads.filter((l) => l.status === "Converted").length;
  const lost = leads.filter((l) => l.status === "Lost").length;
  const onProgress = leads.filter((l) => l.status === "On Progress").length;
  const open = leads.filter((l) => l.status === "Open").length;

  const now = new Date();

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">My Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="metric-card">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-xl p-3 bg-info/10 text-info"><Users className="h-6 w-6" /></div>
            <div><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{total}</p></div>
          </CardContent>
        </Card>
        <Card className="metric-card">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-xl p-3 bg-success/10 text-success"><TrendingUp className="h-6 w-6" /></div>
            <div><p className="text-sm text-muted-foreground">Converted</p><p className="text-2xl font-bold">{converted}</p></div>
          </CardContent>
        </Card>
        <Card className="metric-card">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-xl p-3 bg-destructive/10 text-destructive"><TrendingDown className="h-6 w-6" /></div>
            <div><p className="text-sm text-muted-foreground">Lost</p><p className="text-2xl font-bold">{lost}</p></div>
          </CardContent>
        </Card>
        <Card className="metric-card">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-xl p-3 bg-warning/10 text-warning"><Clock className="h-6 w-6" /></div>
            <div><p className="text-sm text-muted-foreground">On Progress</p><p className="text-2xl font-bold">{onProgress}</p></div>
          </CardContent>
        </Card>
        <Card className="metric-card">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="rounded-xl p-3 bg-primary/10 text-foreground"><FolderOpen className="h-6 w-6" /></div>
            <div><p className="text-sm text-muted-foreground">Open</p><p className="text-2xl font-bold">{open}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Task Panel */}
      <Card>
        <CardHeader>
          <CardTitle>My Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tasks assigned</p>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => {
                const isOverdue = new Date(task.follow_up_date) < now && task.status === "Pending";
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "p-4 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow",
                      isOverdue && "border-destructive/50 bg-destructive/5"
                    )}
                    onClick={() => navigate(`/leads/${task.lead_id}`)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{(task as any).leads?.name ?? "Lead"}</p>
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        {task.notes && <p className="text-xs text-muted-foreground mt-1">{task.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p className={cn("text-xs font-medium", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                          {format(new Date(task.follow_up_date), "MMM d, yyyy")}
                        </p>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          task.status === "Completed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                        )}>
                          {task.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
