import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, TrendingUp, TrendingDown, Clock, FolderOpen, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [proofTaskId, setProofTaskId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        .select("*, leads(name, client_id, itinerary_code)")
        .eq("assigned_employee_id", user.id)
        .order("follow_up_date", { ascending: true });
      return data ?? [];
    },
    enabled: !!user,
  });

  const submitProof = useMutation({
    mutationFn: async ({ taskId, file }: { taskId: string; file: File }) => {
      const filePath = `task-proofs/${taskId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("crm-files")
        .upload(filePath, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("crm-files").getPublicUrl(filePath);

      const { error } = await supabase.from("tasks").update({
        proof_url: publicUrl,
        proof_submitted: true,
        status: "Completed",
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Proof submitted", description: "Task marked as completed." });
      setProofTaskId(null);
      setProofFile(null);
      queryClient.invalidateQueries({ queryKey: ["my-tasks", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["completed-tasks-by-employee"] });
    },
    onError: (err: any) => {
      console.error("Submit proof error:", err);
      toast({ title: "Error submitting proof", description: err.message, variant: "destructive" });
    },
  });

  const total = leads.length;
  const converted = leads.filter((l) => l.status === "Converted").length;
  const lost = leads.filter((l) => l.status === "Lost").length;
  const onProgress = leads.filter((l) => l.status === "On Progress").length;
  const open = leads.filter((l) => l.status === "Open").length;

  const now = new Date();
  const activeTask = tasks.find((t) => t.id === proofTaskId);

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
                const isOverdue = new Date(task.follow_up_date) < now && task.status !== "Completed";
                const leadInfo = (task as any).leads;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "p-4 rounded-lg border hover:shadow-sm transition-shadow",
                      isOverdue && "border-destructive/50 bg-destructive/5",
                      task.status === "Completed" && "bg-success/5 border-success/20"
                    )}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => navigate(`/leads/${task.lead_id}`)}
                      >
                        <p className="font-medium">{leadInfo?.name ?? "Lead"}</p>
                        {(leadInfo?.client_id || leadInfo?.itinerary_code) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {leadInfo?.client_id && <span>ID: {leadInfo.client_id}</span>}
                            {leadInfo?.client_id && leadInfo?.itinerary_code && <span className="mx-1">·</span>}
                            {leadInfo?.itinerary_code && <span>Itin: {leadInfo.itinerary_code}</span>}
                          </p>
                        )}
                        {task.notes && <p className="text-sm text-muted-foreground mt-1">{task.notes}</p>}
                      </div>
                      <div className="text-right shrink-0 space-y-1.5">
                        <p className={cn("text-xs font-medium", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                          {format(new Date(task.follow_up_date), "MMM d, yyyy")}
                        </p>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full block text-center",
                          task.status === "Completed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                        )}>
                          {task.status}
                        </span>
                        {task.status !== "Completed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 w-full"
                            onClick={(e) => { e.stopPropagation(); setProofTaskId(task.id); setProofFile(null); }}
                          >
                            <Upload className="h-3 w-3 mr-1" /> Submit Proof
                          </Button>
                        )}
                        {task.status === "Completed" && task.proof_url && (
                          <a
                            href={task.proof_url}
                            target="_blank"
                            rel="noopener"
                            className="text-xs text-primary hover:underline block text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View Proof
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Proof Dialog */}
      <Dialog
        open={!!proofTaskId}
        onOpenChange={(open) => { if (!open) { setProofTaskId(null); setProofFile(null); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Task Proof</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {activeTask && (
              <div className="p-3 rounded-lg bg-muted/40 text-sm space-y-1">
                <p className="font-medium">{(activeTask as any).leads?.name ?? "Lead"}</p>
                {(activeTask as any).leads?.client_id && (
                  <p className="text-xs text-muted-foreground">Client ID: {(activeTask as any).leads.client_id}</p>
                )}
                {activeTask.notes && <p className="text-xs text-muted-foreground">{activeTask.notes}</p>}
                <p className="text-xs text-muted-foreground">Follow-up: {format(new Date(activeTask.follow_up_date), "MMM d, yyyy")}</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">Upload proof of task completion (screenshot, document, photo, etc.)</p>
            <div>
              <Label>Proof File *</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
              {proofFile ? (
                <div className="flex items-center gap-2 mt-1 p-3 rounded-lg border bg-muted/20">
                  <span className="text-sm truncate flex-1">{proofFile.name}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setProofFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full mt-1 border-dashed justify-start gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Choose File</span>
                </Button>
              )}
            </div>
            <Button
              className="w-full"
              disabled={!proofFile || submitProof.isPending}
              onClick={() => proofTaskId && proofFile && submitProof.mutate({ taskId: proofTaskId, file: proofFile })}
            >
              {submitProof.isPending ? "Submitting..." : "Submit Proof & Complete Task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
