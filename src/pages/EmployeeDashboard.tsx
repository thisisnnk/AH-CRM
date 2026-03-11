import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users, TrendingUp, TrendingDown, Clock, FolderOpen, Upload, CalendarIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, subDays, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { uploadToR2 } from "@/utils/uploadToR2";

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [proofTaskId, setProofTaskId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUploaded, setProofUploaded] = useState(false);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofProgress, setProofProgress] = useState(0);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetProofDialog = () => {
    setProofTaskId(null);
    setProofFile(null);
    setProofUploaded(false);
    setProofUploading(false);
    setProofProgress(0);
    setProofUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 30));
  const [toDate, setToDate] = useState<Date>(new Date());

  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["my-leads", user?.id, format(fromDate, "yyyy-MM-dd"), format(toDate, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("assigned_employee_id", user.id)
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", endOfDay(toDate).toISOString());
      return data ?? [];
    },
    enabled: !!user,
    refetchOnMount: "always",
    staleTime: 30_000,
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
    refetchOnMount: "always",
    staleTime: 30_000,
  });

  const submitProof = useMutation({
    mutationFn: async ({ taskId, leadId }: { taskId: string; leadId: string }) => {
      if (!proofFile) throw new Error("No file selected");
      setProofUploading(true);
      setProofProgress(0);
      let url: string;
      try {
        url = await uploadToR2(proofFile, "task-proofs", setProofProgress);
        setProofUrl(url);
        setProofUploaded(true);
      } finally {
        setProofUploading(false);
      }
      const { error } = await supabase.from("tasks").update({
        proof_url: url,
        proof_submitted: true,
        status: "Completed",
        completed_at: new Date().toISOString(),
      }).eq("id", taskId);
      if (error) throw error;
      try {
        await supabase.from("activity_logs").insert({
          lead_id: leadId, user_id: user!.id, action: "Task proof uploaded", details: url,
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
      console.error("Submit proof error:", err);
      setProofUploading(false);
      toast({ title: "Error submitting proof", description: err.message, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["my-tasks", user?.id] });
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
      <PageLoadingBar loading={leadsLoading} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">My Dashboard</h1>
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
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
        <Card className="metric-card">
          <CardContent className="p-4 md:p-6 flex items-center gap-3 md:gap-4">
            <div className="rounded-xl p-2 md:p-3 bg-info/10 text-info shrink-0"><Users className="h-5 w-5 md:h-6 md:w-6" /></div>
            <div><p className="text-xs md:text-sm text-muted-foreground">Total</p><p className="text-xl md:text-2xl font-bold">{total}</p></div>
          </CardContent>
        </Card>
        <Card className="metric-card">
          <CardContent className="p-4 md:p-6 flex items-center gap-3 md:gap-4">
            <div className="rounded-xl p-2 md:p-3 bg-success/10 text-success shrink-0"><TrendingUp className="h-5 w-5 md:h-6 md:w-6" /></div>
            <div><p className="text-xs md:text-sm text-muted-foreground">Converted</p><p className="text-xl md:text-2xl font-bold">{converted}</p></div>
          </CardContent>
        </Card>
        <Card className="metric-card">
          <CardContent className="p-4 md:p-6 flex items-center gap-3 md:gap-4">
            <div className="rounded-xl p-2 md:p-3 bg-destructive/10 text-destructive shrink-0"><TrendingDown className="h-5 w-5 md:h-6 md:w-6" /></div>
            <div><p className="text-xs md:text-sm text-muted-foreground">Lost</p><p className="text-xl md:text-2xl font-bold">{lost}</p></div>
          </CardContent>
        </Card>
        <Card className="metric-card">
          <CardContent className="p-4 md:p-6 flex items-center gap-3 md:gap-4">
            <div className="rounded-xl p-2 md:p-3 bg-warning/10 text-warning shrink-0"><Clock className="h-5 w-5 md:h-6 md:w-6" /></div>
            <div><p className="text-xs md:text-sm text-muted-foreground">On Progress</p><p className="text-xl md:text-2xl font-bold">{onProgress}</p></div>
          </CardContent>
        </Card>
        <Card className="metric-card col-span-2 sm:col-span-1">
          <CardContent className="p-4 md:p-6 flex items-center gap-3 md:gap-4">
            <div className="rounded-xl p-2 md:p-3 bg-primary/10 text-foreground shrink-0"><FolderOpen className="h-5 w-5 md:h-6 md:w-6" /></div>
            <div><p className="text-xs md:text-sm text-muted-foreground">Open</p><p className="text-xl md:text-2xl font-bold">{open}</p></div>
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
                    {!proofUploading && !proofUploaded && (
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
                      <p className="text-xs text-muted-foreground mt-1">{proofProgress}% uploading...</p>
                    </div>
                  )}
                </div>
              ) : (
                <label className="cursor-pointer w-full block">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx"
                    className="sr-only"
                    onChange={(e) => {
                      setProofFile(e.target.files?.[0] ?? null);
                      setProofUploaded(false);
                      setProofUrl(null);
                      setProofProgress(0);
                    }}
                  />
                  <div className="w-full flex flex-col items-center justify-center gap-1 border border-dashed rounded-md h-16 hover:bg-muted/50 transition-colors">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Choose File</span>
                  </div>
                </label>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!proofFile || submitProof.isPending}
              onClick={() => {
                const task = tasks.find((t) => t.id === proofTaskId);
                if (proofTaskId && task) {
                  submitProof.mutate({ taskId: proofTaskId, leadId: task.lead_id });
                }
              }}
            >
              {submitProof.isPending
                ? (proofUploading ? `Uploading... ${proofProgress}%` : "Submitting...")
                : "Submit Proof & Complete Task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
