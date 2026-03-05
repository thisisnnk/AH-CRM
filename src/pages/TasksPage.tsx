import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, CheckCircle, Inbox } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Separator } from "@/components/ui/separator";

export default function TasksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Create task form
  const [taskForm, setTaskForm] = useState({ description: "", followUpDate: undefined as Date | undefined, notes: "", assignedTo: "", leadId: "" });

  const { data: incomingLeads = [] } = useQuery({
    queryKey: ["incoming-leads"],
    queryFn: async () => {
      const { data } = await supabase.from("incoming_leads").select("*").eq("status", "Pending").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["all-leads-select"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("id, name").order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  const { data: completedByEmployee = [] } = useQuery({
    queryKey: ["completed-tasks-by-employee"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("assigned_employee_id, status")
        .eq("status", "Completed");
      // Group by employee
      const map: Record<string, number> = {};
      (data ?? []).forEach((t) => { map[t.assigned_employee_id] = (map[t.assigned_employee_id] || 0) + 1; });
      return Object.entries(map).map(([empId, count]) => ({
        empId,
        count,
        name: employees.find((e) => e.user_id === empId)?.name ?? "Unknown",
      }));
    },
    enabled: employees.length > 0,
  });

  const assignIncoming = useMutation({
    mutationFn: async ({ incomingId, employeeId, name, phone }: { incomingId: string; employeeId: string; name: string; phone: string }) => {
      // Create official lead
      await supabase.from("leads").insert({
        name,
        phone,
        assigned_employee_id: employeeId,
        lead_source: "Telegram Bot",
      });
      // Mark incoming as assigned
      await supabase.from("incoming_leads").update({ status: "Assigned" }).eq("id", incomingId);
    },
    onSuccess: () => {
      toast({ title: "Lead assigned" });
      queryClient.invalidateQueries({ queryKey: ["incoming-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const createTask = useMutation({
    mutationFn: async () => {
      if (!user || !taskForm.followUpDate || !taskForm.leadId || !taskForm.assignedTo) return;
      await supabase.from("tasks").insert({
        description: taskForm.description,
        follow_up_date: taskForm.followUpDate.toISOString(),
        notes: taskForm.notes || null,
        lead_id: taskForm.leadId,
        assigned_employee_id: taskForm.assignedTo,
        created_by: user.id,
      });
    },
    onSuccess: () => {
      toast({ title: "Task created" });
      setTaskForm({ description: "", followUpDate: undefined, notes: "", assignedTo: "", leadId: "" });
    },
  });

  const [assignMap, setAssignMap] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Tasks</h1>

      {/* Section 1: Incoming Leads */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" /> Incoming Leads Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          {incomingLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending incoming leads</p>
          ) : (
            <div className="space-y-3">
              {incomingLeads.map((il) => (
                <div key={il.id} className="p-4 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{il.name}</p>
                    <p className="text-sm text-muted-foreground">{il.phone} · {il.source}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(il.created_at!), "MMM d, yyyy HH:mm")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={assignMap[il.id] ?? ""} onValueChange={(v) => setAssignMap({ ...assignMap, [il.id]: v })}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Assign to" /></SelectTrigger>
                      <SelectContent>{employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!assignMap[il.id]}
                      onClick={() => assignIncoming.mutate({ incomingId: il.id, employeeId: assignMap[il.id], name: il.name, phone: il.phone })}
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Completed Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5" /> Completed Tasks by Employee</CardTitle>
        </CardHeader>
        <CardContent>
          {completedByEmployee.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed tasks yet</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {completedByEmployee.map((item) => (
                <div key={item.empId} className="p-4 rounded-lg border text-center">
                  <p className="text-2xl font-bold">{item.count}</p>
                  <p className="text-sm text-muted-foreground">{item.name}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Create Task */}
      <Card>
        <CardHeader><CardTitle>Create New Task</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Employee</Label>
              <Select value={taskForm.assignedTo} onValueChange={(v) => setTaskForm({ ...taskForm, assignedTo: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lead</Label>
              <Select value={taskForm.leadId} onValueChange={(v) => setTaskForm({ ...taskForm, leadId: v })}>
                <SelectTrigger><SelectValue placeholder="Select lead" /></SelectTrigger>
                <SelectContent>{leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Description</Label><Input value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} /></div>
            <div>
              <Label>Follow Up Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {taskForm.followUpDate ? format(taskForm.followUpDate, "PPP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={taskForm.followUpDate} onSelect={(d) => setTaskForm({ ...taskForm, followUpDate: d })} className="p-3 pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
            <div><Label>Notes</Label><Textarea value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} /></div>
          </div>
          <Button onClick={() => createTask.mutate()} disabled={!taskForm.description || !taskForm.followUpDate || !taskForm.assignedTo || !taskForm.leadId || createTask.isPending}>
            Create Task
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
