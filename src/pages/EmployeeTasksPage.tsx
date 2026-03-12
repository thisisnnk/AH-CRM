import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { uploadToR2 } from "@/utils/uploadToR2";

export default function EmployeeTasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [proofTaskId, setProofTaskId] = useState<string | null>(null);
  const [proofLeadId, setProofLeadId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUploaded, setProofUploaded] = useState(false);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofProgress, setProofProgress] = useState(0);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const proofUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-upload as soon as a file is selected — no separate "Upload File" step needed
  const handleAutoUpload = async (f: File) => {
    setProofUploading(true);
    setProofProgress(0);
    setSubmitError(null);
    try {
      const url = await uploadToR2(f, "task-proofs", setProofProgress);
      proofUrlRef.current = url;
      setProofUrl(url);
      setProofUploaded(true);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setProofFile(null);
    }
    setProofUploading(false);
  };

  const resetProofDialog = () => {
    setProofTaskId(null);
    setProofFile(null);
    setProofUploaded(false);
    setProofUploading(false);
    setProofProgress(0);
    setProofUrl(null);
    setProofLeadId(null);
    setSubmitError(null);
    proofUrlRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Reset mutation state so re-opening the dialog never shows a stale
    // "Submitting..." state from a previous (possibly still-pending) attempt.
    submitProof.reset();
  };

  const { data: tasks = [], isLoading } = useQuery({
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
    refetchOnMount: "always",
    staleTime: 30_000,
  });

  const submitProof = useMutation({
    mutationFn: async ({ taskId, url, leadId }: { taskId: string; url: string; leadId: string }) => {
      if (!user) throw new Error("Session expired. Please sign out and sign in again.");

      const { data: updated, error } = await supabase.from("tasks").update({
        proof_url: url,
        proof_submitted: true,
        status: "Completed",
        completed_at: new Date().toISOString(),
      }).eq("id", taskId).select();
      if (error) throw error;
      // If 0 rows returned, RLS blocked the write (employee lacks UPDATE permission)
      if (!updated || updated.length === 0) throw new Error("Permission denied: your account does not have access to update this task. Please contact admin.");

      try {
        await supabase.from("activity_logs").insert({
          lead_id: leadId, user_id: user.id, action: "Task proof uploaded", details: url,
        });
      } catch {
        // non-fatal — task is already marked complete
      }
    },
    onSuccess: () => {
      toast({ title: "Proof submitted", description: "Task marked as completed." });
      resetProofDialog();
      queryClient.invalidateQueries({ queryKey: ["my-tasks", user?.id] });
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Submission failed. Please try again.";
      setSubmitError(msg);
      toast({ title: "Error submitting proof", description: msg, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["my-tasks", user?.id] });
    },
  });

  const now = new Date();
  const activeTask = tasks.find((t) => t.id === proofTaskId);

  const pendingTasks = tasks.filter((t) => t.status !== "Completed");
  const completedTasks = tasks.filter((t) => t.status === "Completed");

  const renderTask = (task: any) => {
    const isOverdue = new Date(task.follow_up_date) < now && task.status !== "Completed";
    const leadInfo = task.leads;
    return (
      <div
        key={task.id}
        className={cn(
          "p-4 rounded-lg border hover:shadow-sm transition-shadow cursor-pointer",
          isOverdue && "border-destructive/50 bg-destructive/5",
          task.status === "Completed" && "bg-success/5 border-success/20"
        )}
        onClick={() => navigate(`/leads/${task.lead_id}`)}
      >
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
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
                onClick={(e) => { e.stopPropagation(); setProofTaskId(task.id); setProofLeadId(task.lead_id); setProofFile(null); }}
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
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={isLoading} />
      <h1 className="text-2xl font-bold">My Tasks</h1>

      <Tabs defaultValue="pending">
        <div className="flex justify-center border-b mb-4">
          <TabsList className="bg-transparent rounded-none gap-0 p-0 h-auto">
            <TabsTrigger
              value="pending"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 pb-2 pt-1 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
            >
              Pending / In Progress
              {pendingTasks.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-1.5 min-w-[20px] h-5">
                  {pendingTasks.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-6 pb-2 pt-1 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
            >
              Completed
              {completedTasks.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold px-1.5 min-w-[20px] h-5">
                  {completedTasks.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pending">
          <Card>
            <CardContent className="p-4">
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading tasks...</p>
              ) : pendingTasks.length === 0 ? (
                <p className="text-muted-foreground text-sm">No pending tasks</p>
              ) : (
                <div className="space-y-3">{pendingTasks.map(renderTask)}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardContent className="p-4">
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Loading tasks...</p>
              ) : completedTasks.length === 0 ? (
                <p className="text-muted-foreground text-sm">No completed tasks</p>
              ) : (
                <div className="space-y-3">{completedTasks.map(renderTask)}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Submit Proof Dialog */}
      <Dialog open={!!proofTaskId} onOpenChange={(open) => { if (!open) resetProofDialog(); }}>
        <DialogContent
          className="w-[calc(100%-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
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

            <div>
              <Label className="text-sm font-medium">Proof File *</Label>
              <p className="text-xs text-muted-foreground mb-2">Screenshot, document, or photo of task completion</p>
              {proofFile ? (
                <div className="rounded-lg border bg-muted/20 overflow-hidden">
                  <div className="flex items-center gap-2 p-3">
                    <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate flex-1 text-foreground">{proofFile.name}</span>
                    {!proofUploaded && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0"
                        onClick={() => { setProofFile(null); setProofUploaded(false); setProofUrl(null); setProofProgress(0); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                        Remove
                      </Button>
                    )}
                    {proofUploaded && <span className="text-xs text-success font-medium shrink-0">Uploaded</span>}
                  </div>
                  {proofUploading && (
                    <div className="px-3 pb-3">
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-200 rounded-full" style={{ width: `${proofProgress}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{proofProgress}% uploaded</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative w-full">
                  <div className="w-full flex flex-col items-center justify-center gap-1 border border-dashed rounded-md h-16 hover:bg-muted/50 transition-colors pointer-events-none">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Choose File</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx"
                    className="absolute inset-0 w-full h-full cursor-pointer"
                    style={{ opacity: 0.001 }}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!f) return;
                      setProofFile(f);
                      setProofUploaded(false);
                      setProofUrl(null);
                      setProofProgress(0);
                      handleAutoUpload(f);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Button
                className="w-full"
                disabled={!proofUploaded || submitProof.isPending}
                onClick={() => {
                  const url = proofUrlRef.current;
                  if (!proofTaskId || !url || !proofLeadId) {
                    setSubmitError("File not ready yet, please wait.");
                    return;
                  }
                  setSubmitError(null);
                  submitProof.mutate({ taskId: proofTaskId, url, leadId: proofLeadId });
                }}
              >
                {submitProof.isPending ? "Submitting..." : "Submit Proof & Complete Task"}
              </Button>
              {submitError && <p className="text-sm text-destructive text-center">{submitError}</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
