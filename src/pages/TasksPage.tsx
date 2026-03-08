import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { sendNotification } from "@/utils/notificationHelper";

export default function TasksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [taskForm, setTaskForm] = useState({
    followUpDate: undefined as Date | undefined,
    notes: "",
    assignedTo: "",
    leadId: "",
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
      const { data } = await supabase
        .from("leads")
        .select("id, name, client_id, itinerary_code")
        .order("created_at", { ascending: false })
        .limit(200);
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

  const selectedLead = leads.find((l) => l.id === taskForm.leadId);

  const createTask = useMutation({
    mutationFn: async () => {
      if (!user || !taskForm.followUpDate || !taskForm.leadId || !taskForm.assignedTo) {
        throw new Error("Please fill in all required fields");
      }
      const taskDescription = taskForm.notes.trim() || `Task for ${selectedLead?.name ?? "lead"}`;
      const { error } = await supabase.from("tasks").insert({
        description: taskDescription,
        follow_up_date: taskForm.followUpDate.toISOString(),
        notes: taskForm.notes || null,
        lead_id: taskForm.leadId,
        assigned_employee_id: taskForm.assignedTo,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Task created" });
      const assignedEmp = taskForm.assignedTo;
      const lead = selectedLead;
      setTaskForm({ followUpDate: undefined, notes: "", assignedTo: "", leadId: "" });

      if (assignedEmp && lead) {
        await sendNotification({
          recipientId: assignedEmp,
          type: "task_assigned",
          message: `New task assigned to you for "${lead.name}" (${lead.client_id ?? lead.id})`,
          leadId: taskForm.leadId,
          isTask: true,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["completed-tasks-by-employee"] });
    },
    onError: (err: any) => {
      console.error("Create task error:", err);
      toast({ title: "Error creating task", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Tasks</h1>

      {/* Section 1: Create New Task */}
      <Card>
        <CardHeader><CardTitle>Create New Task</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Employee */}
            <div>
              <Label>Employee *</Label>
              <Select value={taskForm.assignedTo} onValueChange={(v) => setTaskForm({ ...taskForm, assignedTo: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Lead */}
            <div>
              <Label>Lead *</Label>
              <Select value={taskForm.leadId} onValueChange={(v) => setTaskForm({ ...taskForm, leadId: v })}>
                <SelectTrigger><SelectValue placeholder="Select lead" /></SelectTrigger>
                <SelectContent>{leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Client ID (auto-filled, read-only) */}
            <div>
              <Label>Client ID</Label>
              <Input
                value={selectedLead?.client_id ?? ""}
                readOnly
                placeholder="Auto-filled from lead"
                className={cn("bg-muted/40 cursor-default", !selectedLead?.client_id && "text-muted-foreground")}
              />
            </div>

            {/* Name (auto-filled, read-only) */}
            <div>
              <Label>Name</Label>
              <Input
                value={selectedLead?.name ?? ""}
                readOnly
                placeholder="Auto-filled from lead"
                className={cn("bg-muted/40 cursor-default", !selectedLead?.name && "text-muted-foreground")}
              />
            </div>

            {/* Follow Up Date */}
            <div>
              <Label>Follow Up Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {taskForm.followUpDate ? format(taskForm.followUpDate, "PPP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={taskForm.followUpDate} onSelect={(d) => setTaskForm({ ...taskForm, followUpDate: d })} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes — full width, big */}
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={taskForm.notes}
                onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
                placeholder="Describe what needs to be done..."
                className="min-h-[120px] resize-y"
              />
            </div>
          </div>

          <Button
            onClick={() => createTask.mutate()}
            disabled={!taskForm.followUpDate || !taskForm.assignedTo || !taskForm.leadId || createTask.isPending}
          >
            Create Task
          </Button>
        </CardContent>
      </Card>

      {/* Section 2: Completed Tasks by Employee */}
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
    </div>
  );
}
