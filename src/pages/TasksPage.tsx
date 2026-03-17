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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, ExternalLink, Filter } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { sendNotification } from "@/utils/notificationHelper";

export default function TasksPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ── Create Task form state ──
  const [taskForm, setTaskForm] = useState({
    followUpDate: undefined as Date | undefined,
    notes: "",
    assignedTo: "",
    leadId: "",
  });

  // ── Task History tab state ──
  const [historyPill, setHistoryPill] = useState<"completed" | "incomplete">("completed");
  const [filterAssignedCompleted, setFilterAssignedCompleted] = useState<string[]>([]);
  const [filterAssignedIncomplete, setFilterAssignedIncomplete] = useState<string[]>([]);

  // ── Data queries ──
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
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
    staleTime: 60_000,
  });

  const { data: completedTasks = [], isLoading: completedLoading } = useQuery({
    queryKey: ["tasks-completed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*, leads(name)")
        .eq("status", "Completed")
        .order("completed_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
    refetchOnMount: "always",
  });

  const { data: incompleteTasks = [], isLoading: incompleteLoading } = useQuery({
    queryKey: ["tasks-incomplete"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*, leads(name)")
        .neq("status", "Completed")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
    refetchOnMount: "always",
  });

  const selectedLead = leads.find((l) => l.id === taskForm.leadId);
  const empMap = Object.fromEntries(employees.map((e) => [e.user_id, e.name]));

  // ── Filtered task lists ──
  const visibleCompleted = completedTasks.filter(
    (t) => filterAssignedCompleted.length === 0 || filterAssignedCompleted.includes(t.assigned_employee_id)
  );
  const visibleIncomplete = incompleteTasks.filter(
    (t) => filterAssignedIncomplete.length === 0 || filterAssignedIncomplete.includes(t.assigned_employee_id)
  );

  // ── Create task mutation ──
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
      const notes = taskForm.notes;
      const followUpDate = taskForm.followUpDate;
      setTaskForm({ followUpDate: undefined, notes: "", assignedTo: "", leadId: "" });

      if (assignedEmp && lead) {
        const taskDescription = notes.trim() || `Task for ${lead.name}`;
        await sendNotification({
          recipientId: assignedEmp,
          type: "task_assigned",
          message: `New task assigned to you for "${lead.name}" (${lead.client_id ?? lead.id})`,
          leadId: taskForm.leadId,
          isTask: true,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["tasks-incomplete"] });
      queryClient.invalidateQueries({ queryKey: ["tasks-completed"] });
    },
    onError: (err: any) => {
      console.error("Create task error:", err);
      toast({ title: "Error creating task", description: err.message, variant: "destructive" });
    },
  });

  // ── Assigned-To filter popover ──
  function AssignedToFilter({
    selected,
    onChange,
  }: {
    selected: string[];
    onChange: (v: string[]) => void;
  }) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center justify-center rounded p-0.5 hover:bg-black/10",
              selected.length > 0 ? "text-primary" : "text-muted-foreground"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Filter className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2" align="start" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by Employee</p>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {employees.map((emp) => (
              <label
                key={emp.user_id}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm font-normal"
              >
                <Checkbox
                  checked={selected.includes(emp.user_id)}
                  onCheckedChange={(checked) =>
                    onChange(checked ? [...selected, emp.user_id] : selected.filter((v) => v !== emp.user_id))
                  }
                />
                <span className="flex-1">{emp.name}</span>
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t"
            >
              Clear
            </button>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Tasks</h1>

      <Tabs defaultValue="create">
        {/* Tab header */}
        <div className="flex justify-center border-b mb-4">
          <TabsList className="bg-transparent rounded-none gap-0 p-0 h-auto">
            <TabsTrigger
              value="create"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 pb-2 pt-1 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
            >
              Create New Task
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 pb-2 pt-1 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
            >
              Task History
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ═══ TAB 1: Create New Task ═══ */}
        <TabsContent value="create">
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

                {/* Client ID (auto-filled) */}
                <div>
                  <Label>Client ID</Label>
                  <Input
                    value={selectedLead?.client_id ?? ""}
                    readOnly
                    placeholder="Auto-filled from lead"
                    className={cn("bg-muted/40 cursor-default", !selectedLead?.client_id && "text-muted-foreground")}
                  />
                </div>

                {/* Name (auto-filled) */}
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
                      <Calendar
                        mode="single"
                        selected={taskForm.followUpDate}
                        onSelect={(d) => setTaskForm({ ...taskForm, followUpDate: d })}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <Label>Task Description</Label>
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
                {createTask.isPending ? "Creating..." : "Create Task"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 2: Task History ═══ */}
        <TabsContent value="history" className="space-y-4">
          {/* Pills */}
          <div className="flex gap-2">
            <button
              onClick={() => setHistoryPill("completed")}
              className={cn(
                "badge-pill inline-flex items-center gap-1.5",
                historyPill === "completed" ? "badge-pill-active" : "badge-pill-inactive"
              )}
            >
              ✅ Completed Tasks
              <span className={cn("inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 min-w-[20px] h-5 leading-none bg-black", historyPill === "completed" ? "text-primary" : "text-white")}>
                {completedTasks.length}
              </span>
            </button>
            <button
              onClick={() => setHistoryPill("incomplete")}
              className={cn(
                "badge-pill inline-flex items-center gap-1.5",
                historyPill === "incomplete" ? "badge-pill-active" : "badge-pill-inactive"
              )}
            >
              🔄 Incomplete Tasks
              <span className={cn("inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 min-w-[20px] h-5 leading-none bg-black", historyPill === "incomplete" ? "text-primary" : "text-white")}>
                {incompleteTasks.length}
              </span>
            </button>
          </div>

          {/* ── Completed Tasks table ── */}
          {historyPill === "completed" && (
            <div className="overflow-auto rounded-lg border" style={{ maxHeight: "70vh" }}>
              <table className="w-full text-sm" style={{ minWidth: "1100px" }}>
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-3 px-4 whitespace-nowrap">Created Date</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap">Time</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap min-w-[160px]">Lead Name</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap min-w-[220px]">Task Description</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        Assigned To
                        <AssignedToFilter
                          selected={filterAssignedCompleted}
                          onChange={setFilterAssignedCompleted}
                        />
                      </span>
                    </th>
                    <th className="text-left py-3 px-4 whitespace-nowrap">Completed Date</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap">Completed Time</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap">Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {completedLoading ? (
                    <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : visibleCompleted.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No completed tasks found</td></tr>
                  ) : (
                    visibleCompleted.map((t) => (
                      <tr key={t.id} className="border-b hover:bg-muted/30">
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                          {t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                          {t.created_at ? format(new Date(t.created_at), "hh:mm a") : "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">{(t as any).leads?.name ?? "—"}</td>
                        <td className="py-3 px-4">{t.description || t.notes || "—"}</td>
                        <td className="py-3 px-4 whitespace-nowrap">{empMap[t.assigned_employee_id] ?? "—"}</td>
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                          {t.completed_at ? format(new Date(t.completed_at), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                          {t.completed_at ? format(new Date(t.completed_at), "hh:mm a") : "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {t.proof_url ? (
                            <a
                              href={t.proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" /> View Proof
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Incomplete Tasks table ── */}
          {historyPill === "incomplete" && (
            <div className="overflow-auto rounded-lg border" style={{ maxHeight: "70vh" }}>
              <table className="w-full text-sm" style={{ minWidth: "860px" }}>
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-3 px-4 whitespace-nowrap">Created Date & Time</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap min-w-[160px]">Lead Name</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap min-w-[240px]">Task Description</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        Assigned To
                        <AssignedToFilter
                          selected={filterAssignedIncomplete}
                          onChange={setFilterAssignedIncomplete}
                        />
                      </span>
                    </th>
                    <th className="text-left py-3 px-4 whitespace-nowrap">Follow-up Date</th>
                    <th className="text-left py-3 px-4 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {incompleteLoading ? (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Loading...</td></tr>
                  ) : visibleIncomplete.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No incomplete tasks found</td></tr>
                  ) : (
                    visibleIncomplete.map((t) => {
                      const isOverdue = new Date(t.follow_up_date) < new Date();
                      return (
                        <tr key={t.id} className="border-b hover:bg-muted/30">
                          <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                            {t.created_at
                              ? `${format(new Date(t.created_at), "MMM d, yyyy")} ${format(new Date(t.created_at), "hh:mm a")}`
                              : "—"}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">{(t as any).leads?.name ?? "—"}</td>
                          <td className="py-3 px-4">{t.description || t.notes || "—"}</td>
                          <td className="py-3 px-4 whitespace-nowrap">{empMap[t.assigned_employee_id] ?? "—"}</td>
                          <td className={cn("py-3 px-4 whitespace-nowrap", isOverdue && "text-destructive font-medium")}>
                            {format(new Date(t.follow_up_date), "MMM d, yyyy")}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-medium",
                              isOverdue ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                            )}>
                              {isOverdue ? "Overdue" : (t.status ?? "Pending")}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
