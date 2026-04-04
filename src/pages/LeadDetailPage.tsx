import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Phone, Mail, MapPin, ExternalLink, FileText, MessageSquare, Mic, RefreshCw, X, Loader2, CheckCircle, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { sendNotification } from "@/utils/notificationHelper";
import { logActivity } from "@/utils/activityLogger";
import { uploadToR2 } from "@/utils/uploadToR2";
import { QuotationTab } from "@/components/quotation/QuotationTab";
import { TripPaymentsTab } from "@/components/payments/TripPaymentsTab";
import { ConversionDialog } from "@/components/payments/ConversionDialog";
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";

// ── File Upload Widget ─────────────────────────────────────────
function FileUploadWidget({
  accept,
  label,
  file,
  onSelect,
  onRemove,
  uploading,
  progress,
  uploaded,
}: {
  accept: string;
  label: string;
  file: File | null;
  onSelect: (f: File | null) => void;
  onRemove: () => void;
  uploading: boolean;
  progress: number;
  uploaded: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // State: Uploaded successfully — show green bar with filename + remove
  if (uploaded && file) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400 truncate flex-1">{file.name}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:bg-red-100 dark:hover:bg-red-900/30" onClick={onRemove} title="Remove file">
            <X className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>
    );
  }

  // State: Uploading — show progress bar
  if (uploading) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground truncate">Uploading {file?.name}...</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div className="bg-primary h-2.5 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs font-medium text-primary">{progress}%</span>
        </div>
      </div>
    );
  }

  // State: File selected but not yet uploaded — show filename + remove
  if (file) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/20">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm truncate flex-1">{file.name}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 hover:bg-red-100 dark:hover:bg-red-900/30" onClick={onRemove} title="Remove file">
            <X className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>
    );
  }

  // State: No file — show styled Choose File button
  // Uses overlay input (not sr-only) for reliable mobile/iOS Safari touch support
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative w-full">
        <div className="w-full flex items-center justify-start gap-2 px-3 py-2 border border-dashed rounded-md hover:bg-muted/50 transition-colors min-h-[40px] pointer-events-none">
          <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">Choose File</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="absolute inset-0 w-full h-full cursor-pointer"
          style={{ opacity: 0.001 }}
          onChange={(e) => {
            onSelect(e.target.files?.[0] ?? null);
            e.target.value = ""; // Reset so re-selecting same file works
          }}
        />
      </div>
    </div>
  );
}


// ── Main Component ─────────────────────────────────────────────
export default function LeadDetailPage() {
  const { id } = useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";

  // Itinerary state
  const [itineraryFile, setItineraryFile] = useState<File | null>(null);
  const [itineraryUploading, setItineraryUploading] = useState(false);
  const [itineraryProgress, setItineraryProgress] = useState(0);
  const [itineraryUploaded, setItineraryUploaded] = useState(false);
  const [itineraryUrl, setItineraryUrl] = useState<string | null>(null);

  // Revision state
  const [revForm, setRevForm] = useState({ type: "" as string, notes: "", itineraryLink: "" });
  const [revFile, setRevFile] = useState<File | null>(null);
  const [revUploading, setRevUploading] = useState(false);
  const [revProgress, setRevProgress] = useState(0);
  const [revUploaded, setRevUploaded] = useState(false);
  const [revFileUrl, setRevFileUrl] = useState<string | null>(null);

  // Task form state — assignedTo pre-populated from lead once data loads
  const [taskForm, setTaskForm] = useState({ followUpDate: undefined as Date | undefined, notes: "", assignedTo: "" });
  const [taskFormInitialized, setTaskFormInitialized] = useState(false);

  // Task proof upload state
  const [proofTaskId, setProofTaskId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofProgress, setProofProgress] = useState(0);
  const [proofUploaded, setProofUploaded] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  // Refs so submit handlers always read the latest uploaded URL
  // (avoids React stale-closure issues on mobile)
  const itineraryUrlRef = useRef<string | null>(null);
  const revFileUrlRef = useRef<string | null>(null);
  const proofUrlRef = useRef<string | null>(null);

  // Inline submission error states (toasts can be missed on mobile)
  const [itinerarySubmitError, setItinerarySubmitError] = useState<string | null>(null);
  const [revSubmitError, setRevSubmitError] = useState<string | null>(null);
  const [taskSubmitError, setTaskSubmitError] = useState<string | null>(null);

  // Conversion dialog state
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false);
  const [pendingConvertUpdates, setPendingConvertUpdates] = useState<Record<string, any> | null>(null);

  // Edit mode state
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({ name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "" });
  const [isEditingLeadInfo, setIsEditingLeadInfo] = useState(false);
  const [isSavingLeadInfo, setIsSavingLeadInfo] = useState(false);
  const [leadInfoForm, setLeadInfoForm] = useState({ lead_source: "", status: "", itinerary_code: "", destination: "", travelers: "", trip_duration: "", tour_category: "", travel_date: "", budget: "" });
  const [noteForm, setNoteForm] = useState({ note_to_user: "", note_message: "" });

  // ── Upload helper — sends to Cloudflare R2 ──
  const uploadFile = (file: File, folder: string, setProgress: (n: number) => void): Promise<string> =>
    uploadToR2(file, folder, setProgress);

  // ── Queries ──
  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
    retry: 2,
    // Show partial data from the leads-list cache immediately so the page
    // renders at once while the full detail fetch runs in the background.
    placeholderData: () => {
      const cached = queryClient.getQueriesData<any[]>({ queryKey: ["leads"] });
      for (const [, list] of cached) {
        if (!Array.isArray(list)) continue;
        const found = list.find((l: any) => l.id === id);
        if (found) return found;
      }
      return undefined;
    },
  });

  const { data: revisions = [] } = useQuery({
    queryKey: ["revisions", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("revisions").select("*").eq("lead_id", id!).order("revision_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    retry: 2,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["activities", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_logs").select("*").eq("lead_id", id!).order("timestamp", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    retry: 2,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["lead-tasks", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("lead_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
    retry: 2,
  });

  const { data: leadNotes = [] } = useQuery({
    queryKey: ["lead-notes", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("lead_notes").select("*").eq("lead_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!id && !!user,
    retry: 2,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  // True only when an actual itinerary file has been uploaded and sent — NOT just because a code was typed
  const hasActualItinerary = revisions.some((r) => r.itinerary_link && r.send_status === "Sent");
  const hasItinerary = hasActualItinerary;
  const availableStatuses = hasItinerary
    ? ["Open", "On Progress", "Quoted", "Lost", "Converted"]
    : ["Open", "Quoted", "Lost", "Converted"];


  // ── Pre-populate task assignee from lead's assigned employee ──
  useEffect(() => {
    if (lead?.assigned_employee_id && !taskFormInitialized) {
      setTaskForm((prev) => ({ ...prev, assignedTo: lead.assigned_employee_id! }));
      setTaskFormInitialized(true);
    }
  }, [lead?.assigned_employee_id, taskFormInitialized]);

  // ── Mutations ──
  const updateLead = useMutation({
    mutationFn: async (updates: Record<string, any> & { _logAction?: string }) => {
      const { _logAction, ...dbUpdates } = updates;
      const { error } = await supabase.from("leads").update(dbUpdates).eq("id", id!);
      if (error) throw error;
      if (_logAction && user) {
        await logActivity({
          leadId: id!, userId: user.id, userRole: role,
          action: _logAction, entityType: "leads", entityId: id!,
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Changes saved" });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Update lead error:", err);
      toast({ title: "Error updating lead", description: err.message, variant: "destructive" });
    },
  });

  // Itinerary Submit
  const submitItinerary = useMutation({
    mutationFn: async ({ url }: { url: string }) => {
      if (!url || !user) throw new Error("Upload file first");

      const nextNum = revisions.length + 1;
      const { data: inserted, error: revErr } = await supabase.from("revisions").insert({
        revision_number: nextNum,
        call_recording_url: "",
        itinerary_link: url,
        notes: "Initial itinerary submitted",
        send_status: "Sent",
        date_sent: new Date().toISOString(),
        lead_id: id!,
        created_by: user.id,
      }).select();
      if (revErr) throw revErr;
      if (!inserted || inserted.length === 0) throw new Error("Permission denied: your account cannot submit itineraries. Please contact admin.");

      let extractedCode = lead.itinerary_code || "";
      if (itineraryFile && (!lead.itinerary_code || lead.itinerary_code.startsWith("http"))) {
        const match = itineraryFile.name.match(/^([A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)?)/i);
        if (match) {
          extractedCode = match[1].toUpperCase();
        } else {
          extractedCode = itineraryFile.name.split(/[\s._]/)[0].toUpperCase();
        }
      }

      await supabase.from("leads").update({
        status: lead.status === "Open" ? "On Progress" : lead.status,
        badge_stage: lead.badge_stage === "Open" ? "Follow Up" : lead.badge_stage,
        itinerary_code: extractedCode,
        last_activity_at: new Date().toISOString(),
      }).eq("id", id!);

      await logActivity({
        leadId: id!, userId: user.id, userRole: role,
        action: "Itinerary submitted",
        details: `Itinerary file uploaded`,
        proofUrl: url,
        entityType: "revisions",
      });
    },
    onSuccess: () => {
      setItinerarySubmitError(null);
      toast({ title: "Itinerary submitted", description: "Lead status updated to On Progress" });
      itineraryUrlRef.current = null;
      setItineraryFile(null); setItineraryUploaded(false); setItineraryUrl(null); setItineraryProgress(0);
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Submit itinerary error:", err);
      const msg = err?.message ?? "Submission failed. Please try again.";
      setItinerarySubmitError(msg);
      toast({ title: "Error submitting itinerary", description: msg, variant: "destructive" });
    },
  });

  // Revision Submit
  const addRevision = useMutation({
    mutationFn: async ({ url }: { url: string }) => {
      if (!user || !revForm.type) throw new Error("Select type");

      const fileUrl = url;
      const nextNum = revisions.length + 1;

      const { data: inserted, error: revErr } = await supabase.from("revisions").insert({
        revision_number: nextNum,
        call_recording_url: revForm.type === "Call Recording" ? fileUrl : "",
        itinerary_link: (revForm.type === "Revised Itinerary" || revForm.type === "Chat Screenshot") ? fileUrl : "",
        notes: `[${revForm.type}] ${revForm.notes}`,
        send_status: revForm.type === "Revised Itinerary" ? "Sent" : "Pending",
        date_sent: revForm.type === "Revised Itinerary" ? new Date().toISOString() : null,
        lead_id: id!,
        created_by: user.id,
      }).select();
      if (revErr) throw revErr;
      if (!inserted || inserted.length === 0) throw new Error("Permission denied: your account cannot submit revisions. Please contact admin.");

      await supabase.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", id!);

      const details = revForm.type === "Chat Screenshot" ? "Screenshot uploaded"
        : revForm.type === "Call Recording" ? "Call recording uploaded"
          : `Revised itinerary uploaded`;

      await logActivity({
        leadId: id!, userId: user.id, userRole: role,
        action: `Revision ${nextNum} added — ${revForm.type}`,
        details: details,
        proofUrl: fileUrl,
        entityType: "revisions",
      });
    },
    onSuccess: () => {
      setRevSubmitError(null);
      toast({ title: "Revision submitted successfully", description: `${revForm.type} has been recorded.` });
      setRevForm({ type: "", notes: "", itineraryLink: "" });
      revFileUrlRef.current = null;
      setRevFile(null); setRevUploaded(false); setRevFileUrl(null); setRevProgress(0);
      queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Add revision error:", err);
      const msg = err?.message ?? "Failed to submit revision. Please try again.";
      setRevSubmitError(msg);
      toast({ title: "Error adding revision", description: msg, variant: "destructive" });
    },
  });

  // Task Create
  const createTask = useMutation({
    mutationFn: async () => {
      if (!user || !taskForm.followUpDate) throw new Error("Missing required fields");
      if (isAdmin && !taskForm.assignedTo) throw new Error("Please select an employee to assign this task to");

      const assignedTo = taskForm.assignedTo || user.id;
      const taskDescription = taskForm.notes.trim() || `Task for ${lead?.name ?? "lead"}`;
      const senderName = employees.find((e) => e.user_id === user.id)?.name ?? "Someone";
      const receiverName = employees.find((e) => e.user_id === assignedTo)?.name ?? "a user";

      const { data: inserted, error } = await supabase.from("tasks").insert({
        description: taskDescription, follow_up_date: taskForm.followUpDate.toISOString(),
        notes: taskForm.notes || null, lead_id: id!, assigned_employee_id: assignedTo, created_by: user.id,
      }).select();
      if (error) throw error;
      if (!inserted || inserted.length === 0) throw new Error("Permission denied: your account cannot create tasks. Please contact admin.");

      await logActivity({
        leadId: id!, userId: user.id, userRole: role,
        action: "Task created",
        details: `${senderName} created a task for ${receiverName}: ${taskDescription}`,
        entityType: "tasks",
        entityId: inserted[0]?.id ?? undefined,
      });

      if (assignedTo !== user.id) {
        try {
          await sendNotification({
            recipientId: assignedTo, type: "task_assigned",
            message: `New task for "${lead?.name ?? ""}" (${lead?.client_id ?? id}): ${taskForm.notes || taskDescription}`,
            leadId: id, isTask: true,
          });
        } catch { /* non-fatal */ }
      }
    },
    onSuccess: () => {
      setTaskSubmitError(null);
      toast({ title: "Task created" });
      setTaskForm({ followUpDate: undefined, notes: "", assignedTo: "" });
      queryClient.invalidateQueries({ queryKey: ["lead-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Create task error:", err);
      const msg = err?.message ?? "Failed to create task. Please try again.";
      setTaskSubmitError(msg);
      toast({ title: "Error creating task", description: msg, variant: "destructive" });
    },
  });

  // Task Proof Submit — upload already done by handleProofUpload on file select
  const submitTaskProof = useMutation({
    mutationFn: async () => {
      const url = proofUrlRef.current;
      if (!url || !proofTaskId || !user) throw new Error("File not ready yet, please wait.");
      const { error } = await supabase.from("tasks").update({
        proof_url: url,
        proof_submitted: true,
        status: "Completed",
        completed_at: new Date().toISOString(),
      }).eq("id", proofTaskId);
      if (error) throw error;
      await logActivity({
        leadId: id!, userId: user.id, userRole: role,
        action: "Task proof submitted",
        details: "Task marked as completed with proof",
        proofUrl: url,
        entityType: "tasks",
        entityId: proofTaskId,
      });
    },
    onSuccess: () => {
      toast({ title: "Proof submitted", description: "Task marked as completed." });
      proofUrlRef.current = null;
      setProofTaskId(null); setProofFile(null); setProofUploaded(false); setProofUrl(null); setProofProgress(0);
      queryClient.invalidateQueries({ queryKey: ["lead-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Submit task proof error:", err);
      toast({ title: "Error submitting proof", description: err.message, variant: "destructive" });
    },
  });

  const deleteRevision = useMutation({
    mutationFn: async ({ revId, revisionNumber, revisionType }: { revId: string; revisionNumber: number; revisionType: string }) => {
      const { error, count } = await supabase
        .from("revisions")
        .delete({ count: "exact" })
        .eq("id", revId);
      if (error) throw error;
      if (count === 0) throw new Error("Could not delete revision. Check Supabase RLS policies.");
      if (user && id) {
        const userName = employees.find((e) => e.user_id === user.id)?.name ?? "Admin";
        await logActivity({
          leadId: id, userId: user.id, userRole: role,
          action: `Revision ${revisionNumber} deleted`,
          details: `${userName} deleted ${revisionType || "revision"}`,
          entityType: "revisions",
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Revision deleted" });
      queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => toast({ title: "Error deleting revision", description: err.message, variant: "destructive" }),
  });

  const deleteTask = useMutation({
    mutationFn: async ({ taskId, taskDescription }: { taskId: string; taskDescription: string }) => {
      const { error, count } = await supabase
        .from("tasks")
        .delete({ count: "exact" })
        .eq("id", taskId);
      if (error) throw error;
      if (count === 0) throw new Error("Could not delete task. Check Supabase RLS policies.");
      if (user && id) {
        const userName = employees.find((e) => e.user_id === user.id)?.name ?? "Admin";
        await logActivity({
          leadId: id, userId: user.id, userRole: role,
          action: "Task deleted",
          details: `${userName} deleted task: ${taskDescription || "—"}`,
          entityType: "tasks",
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Task deleted" });
      queryClient.invalidateQueries({ queryKey: ["lead-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => toast({ title: "Error deleting task", description: err.message, variant: "destructive" }),
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error, count } = await (supabase as any)
        .from("lead_notes")
        .delete({ count: "exact" })
        .eq("id", noteId);
      if (error) throw error;
      if (count === 0) throw new Error("Could not delete note. Check Supabase RLS policies.");
      if (user && id) {
        await logActivity({
          leadId: id, userId: user.id, userRole: role,
          action: "Note deleted",
          entityType: "lead_notes", entityId: noteId,
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Note deleted" });
      queryClient.invalidateQueries({ queryKey: ["lead-notes", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => toast({ title: "Error deleting note", description: err.message, variant: "destructive" }),
  });

  const createNote = useMutation({
    mutationFn: async () => {
      if (!user || !noteForm.note_to_user || !noteForm.note_message.trim()) throw new Error("Fill all required fields");

      // Step 1 — Insert note
      const { error } = await (supabase as any).from("lead_notes").insert({
        lead_id: id!,
        client_id: lead?.client_id ?? null,
        lead_name: lead?.name ?? null,
        note_to_user: noteForm.note_to_user,
        note_message: noteForm.note_message.trim(),
        created_by: user.id,
      });
      if (error) throw error;

      // Resolve names for notification and activity log
      const senderName = employees.find((e) => e.user_id === user.id)?.name ?? "Someone";
      const receiverName = employees.find((e) => e.user_id === noteForm.note_to_user)?.name ?? "a user";
      const leadName = lead?.name ?? "";

      // Step 2 — Send notification to the recipient
      try {
        await sendNotification({
          recipientId: noteForm.note_to_user,
          type: "note_assigned",
          message: `New note from ${senderName} for Lead "${leadName}"`,
          leadId: id,
        });
      } catch { /* non-fatal */ }

      // Step 3 — Log activity
      await logActivity({
        leadId: id!, userId: user.id, userRole: role,
        action: "Note added",
        details: `${senderName} sent a note to ${receiverName}`,
        entityType: "lead_notes",
      });

      await supabase.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", id!);
    },
    onSuccess: () => {
      toast({ title: "Note saved" });
      setNoteForm({ note_to_user: "", note_message: "" });
      queryClient.invalidateQueries({ queryKey: ["lead-notes", id] });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
    },
    onError: (err: any) => {
      toast({ title: "Error saving note", description: err.message, variant: "destructive" });
    },
  });

  if (!lead && leadLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  if (!lead) return <div className="py-8 text-center text-muted-foreground">Lead not found.</div>;

  // Permission check: only admin or assigned employee can delete
  const canDelete = isAdmin || lead.assigned_employee_id === user?.id;

  // ── Edit handlers ──
  const startEditPersonal = () => {
    setPersonalForm({ name: lead.name, phone: lead.phone, whatsapp: lead.whatsapp || "", email: lead.email || "", city: lead.city || "", state: lead.state || "", country: lead.country || "" });
    setIsEditingPersonal(true);
  };
  const savePersonal = () => {
    setIsSavingPersonal(true);
    updateLead.mutate(
      { name: personalForm.name, phone: personalForm.phone, whatsapp: personalForm.whatsapp || null, email: personalForm.email || null, city: personalForm.city || null, state: personalForm.state || null, country: personalForm.country || null, _logAction: "Contact details updated" },
      {
        onSuccess: () => { setIsEditingPersonal(false); setIsSavingPersonal(false); },
        onError: () => setIsSavingPersonal(false),
      }
    );
  };

  const startEditLeadInfo = () => {
    setLeadInfoForm({ lead_source: lead.lead_source || "", status: lead.status || "Open", itinerary_code: lead.itinerary_code || "", destination: lead.destination || "", travelers: String(lead.travelers || ""), trip_duration: lead.trip_duration || "", tour_category: lead.tour_category || "", travel_date: (lead as any).travel_date || "", budget: (lead as any).budget || "" });
    setIsEditingLeadInfo(true);
  };
  const saveLeadInfo = () => {
    setIsSavingLeadInfo(true);
    const updates: Record<string, any> = {
      lead_source: leadInfoForm.lead_source,
      status: leadInfoForm.status,
      itinerary_code: leadInfoForm.itinerary_code || null,
      destination: leadInfoForm.destination || null,
      travelers: leadInfoForm.travelers ? parseInt(leadInfoForm.travelers) : null,
      trip_duration: leadInfoForm.trip_duration || null,
      tour_category: leadInfoForm.tour_category || null,
      travel_date: leadInfoForm.travel_date || null,
      budget: leadInfoForm.budget || null,
    };
    if (leadInfoForm.status === "Lost" || leadInfoForm.status === "Converted") {
      updates.badge_stage = leadInfoForm.status;
    }
    updates.last_activity_at = new Date().toISOString();
    if (lead && leadInfoForm.status !== lead.status) {
      updates._logAction = `Status changed to ${leadInfoForm.status}`;
    } else {
      updates._logAction = "Lead info updated";
    }

    updateLead.mutate(updates, {
      onSuccess: () => { setIsEditingLeadInfo(false); setIsSavingLeadInfo(false); },
      onError: () => setIsSavingLeadInfo(false),
    });
  };

  // ── Handlers ──
  // Auto-upload the moment a file is chosen — no separate "Upload File" button tap needed
  const handleItineraryUpload = async (file: File) => {
    setItineraryUploading(true);
    setItineraryProgress(0);
    setItinerarySubmitError(null);
    try {
      const url = await uploadFile(file, "revisions", setItineraryProgress);
      itineraryUrlRef.current = url;   // ref always has the latest URL
      setItineraryUrl(url);
      setItineraryUploaded(true);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setItineraryFile(null);
    }
    setItineraryUploading(false);
  };

  const handleProofUpload = async (file: File) => {
    setProofUploading(true);
    setProofProgress(0);
    try {
      const url = await uploadFile(file, "task-proofs", setProofProgress);
      proofUrlRef.current = url;
      setProofUrl(url);
      setProofUploaded(true);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setProofFile(null);
    }
    setProofUploading(false);
  };

  const handleRevFileUpload = async (file: File, type: string) => {
    const folder = "revisions";
    setRevUploading(true);
    setRevProgress(0);
    setRevSubmitError(null);
    try {
      const url = await uploadFile(file, folder, setRevProgress);
      revFileUrlRef.current = url;     // ref always has the latest URL
      setRevFileUrl(url);
      setRevUploaded(true);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setRevFile(null);
    }
    setRevUploading(false);
  };

  const revisionTypeIcons: Record<string, any> = {
    "Chat Screenshot": <MessageSquare className="h-4 w-4" />,
    "Call Recording": <Mic className="h-4 w-4" />,
    "Revised Itinerary": <RefreshCw className="h-4 w-4" />,
  };

  const canSubmitRevision = !!(revForm.type && revUploaded);

  return (
    <div className="space-y-6 animate-fade-in">
      <Button variant="ghost" onClick={() => navigate("/leads")} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Leads
      </Button>

      {/* Personal Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Personal Details</CardTitle>
            {!isEditingPersonal ? (
              <Button variant="outline" size="sm" onClick={startEditPersonal}>Edit</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsEditingPersonal(false)} disabled={isSavingPersonal}>Cancel</Button>
                <Button size="sm" onClick={savePersonal} disabled={isSavingPersonal}>{isSavingPersonal ? "Saving..." : "Save"}</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground text-xs">Name</Label>
            {isEditingPersonal ? <Input value={personalForm.name} onChange={(e) => setPersonalForm({ ...personalForm, name: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{lead.name || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Phone</Label>
            {isEditingPersonal ? <Input value={personalForm.phone} onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{lead.phone || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">WhatsApp</Label>
            {isEditingPersonal ? <Input value={personalForm.whatsapp} onChange={(e) => setPersonalForm({ ...personalForm, whatsapp: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{lead.whatsapp || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Email</Label>
            {isEditingPersonal ? <Input value={personalForm.email} onChange={(e) => setPersonalForm({ ...personalForm, email: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{lead.email || "—"}</p>}
          </div>
          <div className="col-span-1 md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-muted-foreground text-xs">City</Label>
              {isEditingPersonal ? <Input value={personalForm.city} onChange={(e) => setPersonalForm({ ...personalForm, city: e.target.value })} className="h-8 mt-1" placeholder="City" /> : <p className="mt-1 text-sm">{lead.city || "—"}</p>}
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">State</Label>
              {isEditingPersonal ? <Input value={personalForm.state} onChange={(e) => setPersonalForm({ ...personalForm, state: e.target.value })} className="h-8 mt-1" placeholder="State" /> : <p className="mt-1 text-sm">{lead.state || "—"}</p>}
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Country</Label>
              {isEditingPersonal ? <Input value={personalForm.country} onChange={(e) => setPersonalForm({ ...personalForm, country: e.target.value })} className="h-8 mt-1" placeholder="Country" /> : <p className="mt-1 text-sm">{lead.country || "—"}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lead Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lead Information</CardTitle>
            {!isEditingLeadInfo ? (
              <Button variant="outline" size="sm" onClick={startEditLeadInfo}>Edit</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsEditingLeadInfo(false)} disabled={isSavingLeadInfo}>Cancel</Button>
                <Button size="sm" onClick={saveLeadInfo} disabled={isSavingLeadInfo}>{isSavingLeadInfo ? "Saving..." : "Save"}</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground text-xs">Lead Source</Label>
            {isEditingLeadInfo ? (
              <Select value={leadInfoForm.lead_source} onValueChange={(v) => setLeadInfoForm({ ...leadInfoForm, lead_source: v })}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {["Instagram", "Website", "Referral", "Office Direct Lead"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : <p className="mt-1 text-sm">{lead.lead_source || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Enquiry Date</Label>
            <p className="mt-1 text-sm">{lead.enquiry_date ? format(new Date(lead.enquiry_date), "MMM d, yyyy") : "—"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Status</Label>
            {isEditingLeadInfo ? (
              <>
                <Select
                  value={leadInfoForm.status}
                  onValueChange={(v) => {
                    if (v === "Converted" && lead?.status !== "Converted") {
                      setIsEditingLeadInfo(false);
                      setConversionDialogOpen(true);
                      return;
                    }
                    setLeadInfoForm({ ...leadInfoForm, status: v });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!hasItinerary && <p className="text-xs text-muted-foreground mt-1">Submit an itinerary to unlock "On Progress"</p>}
              </>
            ) : <p className="mt-1 text-sm">{lead.status || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Itinerary Code</Label>
            {isEditingLeadInfo ? (
              <>
                <Input
                  value={leadInfoForm.itinerary_code}
                  onChange={(e) => setLeadInfoForm({ ...leadInfoForm, itinerary_code: e.target.value })}
                  className="h-8 mt-1"
                  disabled={!hasActualItinerary}
                  placeholder={`AH${new Date().getFullYear()}-XXXX-YYY-ZZZ`}
                  title={!hasActualItinerary ? "Upload an itinerary file first to edit this field" : undefined}
                />
                {!hasActualItinerary && (
                  <p className="text-xs text-muted-foreground mt-1">Upload an itinerary to enable editing this field</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm">
                {lead.itinerary_code || (
                  <span className="text-muted-foreground/50 italic">{`AH${new Date().getFullYear()}-XXXX-YYY-ZZZ`}</span>
                )}
              </p>
            )}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Destination</Label>
            {isEditingLeadInfo ? <Input value={leadInfoForm.destination} onChange={(e) => setLeadInfoForm({ ...leadInfoForm, destination: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{lead.destination || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Travelers</Label>
            {isEditingLeadInfo ? <Input value={leadInfoForm.travelers} onChange={(e) => setLeadInfoForm({ ...leadInfoForm, travelers: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{lead.travelers ?? "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Duration</Label>
            {isEditingLeadInfo ? <Input value={leadInfoForm.trip_duration} onChange={(e) => setLeadInfoForm({ ...leadInfoForm, trip_duration: e.target.value })} className="h-8 mt-1" placeholder="e.g. 5 Days / 4 Nights" /> : <p className="mt-1 text-sm">{lead.trip_duration || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Tour Category</Label>
            {isEditingLeadInfo ? (
              <Select value={leadInfoForm.tour_category} onValueChange={(v) => setLeadInfoForm({ ...leadInfoForm, tour_category: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cruise">Cruise</SelectItem>
                  <SelectItem value="Domestic Tour">Domestic Tour</SelectItem>
                  <SelectItem value="International Tour">International Tour</SelectItem>
                </SelectContent>
              </Select>
            ) : <p className="mt-1 text-sm">{lead.tour_category || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Travel Date</Label>
            {isEditingLeadInfo
              ? <Input type="date" value={leadInfoForm.travel_date} onChange={(e) => setLeadInfoForm({ ...leadInfoForm, travel_date: e.target.value })} className="h-8 mt-1" />
              : <p className="mt-1 text-sm">{(lead as any).travel_date ? format(new Date((lead as any).travel_date), "MMM d, yyyy") : "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Budget</Label>
            {isEditingLeadInfo
              ? <Input value={leadInfoForm.budget} onChange={(e) => setLeadInfoForm({ ...leadInfoForm, budget: e.target.value })} className="h-8 mt-1" placeholder="e.g. ₹50,000" />
              : <p className="mt-1 text-sm">{(lead as any).budget || "—"}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Quotation Section */}
      {(role === "admin" || role === "employee" || role === "execution") && !!lead && (
        <Card>
          <CardHeader><CardTitle>Quotation</CardTitle></CardHeader>
          <CardContent>
            <QuotationTab leadId={id!} lead={lead} />
          </CardContent>
        </Card>
      )}

      {/* ═══ ITINERARY ═══ */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Itinerary</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {hasItinerary ? (
            <div className="p-4 rounded-lg border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">✅ Itinerary submitted</p>
              <p className="text-xs text-muted-foreground mt-1">Lead status is eligible for "On Progress"</p>
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">⚠ No itinerary submitted yet</p>
              <p className="text-xs text-muted-foreground mt-1">Upload an itinerary to move this lead to "On Progress"</p>
            </div>
          )}

          {!hasItinerary && (
            <>
              <Separator />
              <p className="font-medium text-sm">Submit Itinerary</p>

              <FileUploadWidget
                accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*"
                label="Itinerary File *"
                file={itineraryFile}
                onSelect={(f) => {
                  if (!f) return;
                  setItineraryFile(f);
                  setItineraryUploaded(false);
                  setItineraryUrl(null);
                  setItineraryProgress(0);
                  handleItineraryUpload(f);
                }}
                onRemove={() => { setItineraryFile(null); setItineraryUploaded(false); setItineraryUrl(null); setItineraryProgress(0); }}
                uploading={itineraryUploading}
                progress={itineraryProgress}
                uploaded={itineraryUploaded}
              />

              {itineraryUploaded && (
                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      const url = itineraryUrlRef.current;
                      if (!url) { setItinerarySubmitError("File not ready yet, please wait."); return; }
                      setItinerarySubmitError(null);
                      submitItinerary.mutate({ url });
                    }}
                    disabled={submitItinerary.isPending}
                  >
                    {submitItinerary.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting...</> : <><Upload className="h-4 w-4 mr-1" /> Submit Itinerary</>}
                  </Button>
                  {itinerarySubmitError && <p className="text-sm text-destructive">{itinerarySubmitError}</p>}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══ REVISIONS ═══ */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" /> Revisions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {revisions.map((rev) => {
            const typeMatch = rev.notes?.match(/^\[(.*?)\]/);
            const revType = typeMatch ? typeMatch[1] : "Revision";
            return (
              <div key={rev.id} className="p-4 rounded-lg border-l-4 border-primary bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {revisionTypeIcons[revType] ?? <FileText className="h-4 w-4" />}
                      <p className="font-medium">Rev {rev.revision_number} — {revType}</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{rev.notes?.replace(/^\[.*?\]\s*/, "")}</p>
                    {rev.itinerary_link && (
                      <a href={rev.itinerary_link} target="_blank" rel="noopener" className="text-xs text-info hover:underline mt-1 block">
                        <ExternalLink className="h-3 w-3 inline mr-1" />Itinerary / File Link
                      </a>
                    )}
                    {rev.call_recording_url && (
                      <a href={rev.call_recording_url} target="_blank" rel="noopener" className="text-xs text-info hover:underline mt-1 block">
                        🎙️ Call Recording
                      </a>
                    )}
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full",
                      rev.send_status === "Sent" ? "bg-success/10 text-success" :
                      "bg-info/10 text-info")}>
                      {rev.send_status === "Sent" ? "Sent" : "Submitted"}
                    </span>
                    <p className="text-xs text-muted-foreground">{format(new Date(rev.created_at!), "MMM d, yyyy")}</p>
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm("Delete this revision?")) deleteRevision.mutate({ revId: rev.id, revisionNumber: rev.revision_number, revisionType: rev.notes ?? "" }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <Separator />
          <p className="font-medium text-sm">Add New Revision</p>
          <div className="space-y-3">
            <div>
              <Label>Type *</Label>
              <Select value={revForm.type} onValueChange={(v) => {
                setRevForm({ ...revForm, type: v, itineraryLink: "" });
                setRevFile(null); setRevUploaded(false); setRevFileUrl(null); setRevProgress(0);
              }}>
                <SelectTrigger><SelectValue placeholder="Select revision type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Chat Screenshot">💬 Chat Screenshot</SelectItem>
                  <SelectItem value="Call Recording">🎙️ Call Recording</SelectItem>
                  <SelectItem value="Revised Itinerary">📋 Revised Itinerary</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(revForm.type === "Chat Screenshot" || revForm.type === "Call Recording" || revForm.type === "Revised Itinerary") && (
              <>
                <FileUploadWidget
                  accept={revForm.type === "Chat Screenshot" ? "image/*" : revForm.type === "Call Recording" ? "*/*" : "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"}
                  label={revForm.type === "Chat Screenshot" ? "Screenshot File *" : revForm.type === "Call Recording" ? "Recording File *" : "Itinerary File *"}
                  file={revFile}
                  onSelect={(f) => {
                    if (!f) return;
                    setRevFile(f);
                    setRevUploaded(false);
                    setRevFileUrl(null);
                    setRevProgress(0);
                    handleRevFileUpload(f, revForm.type);
                  }}
                  onRemove={() => { setRevFile(null); setRevUploaded(false); setRevFileUrl(null); setRevProgress(0); }}
                  uploading={revUploading}
                  progress={revProgress}
                  uploaded={revUploaded}
                />
              </>
            )}


            {revForm.type && (
              <div><Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label><Textarea value={revForm.notes} onChange={(e) => setRevForm({ ...revForm, notes: e.target.value })} placeholder="Describe the revision..." /></div>
            )}

            <div className="space-y-2">
              <Button
                onClick={() => {
                  const url = revFileUrlRef.current;
                  if (!url) { setRevSubmitError("File not ready yet, please wait."); return; }
                  setRevSubmitError(null);
                  addRevision.mutate({ url });
                }}
                disabled={!canSubmitRevision || addRevision.isPending}
              >
                {addRevision.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting...</> : "Submit Revision"}
              </Button>
              {revSubmitError && <p className="text-sm text-destructive">{revSubmitError}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes, Tasks & Quotation Tabs */}
      <Card>
        <Tabs defaultValue="tasks">
          <CardHeader>
            <TabsList className="flex justify-center bg-transparent p-0 h-auto gap-8 w-full flex-wrap">
              <TabsTrigger
                value="notes"
                className="text-lg font-semibold px-0 py-1 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none text-muted-foreground data-[state=active]:text-foreground"
              >
                Notes
              </TabsTrigger>
              <TabsTrigger
                value="tasks"
                className="text-lg font-semibold px-0 py-1 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none text-muted-foreground data-[state=active]:text-foreground"
              >
                Tasks
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent>

            {/* ── NOTES TAB ── */}
            <TabsContent value="notes" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Client ID</Label>
                  <Input value={lead.client_id ?? ""} readOnly className="bg-muted/40 cursor-default" placeholder="—" />
                </div>
                <div>
                  <Label>Lead Name</Label>
                  <Input value={lead.name ?? ""} readOnly className="bg-muted/40 cursor-default" />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <Label>Notes To *</Label>
                  <Select value={noteForm.note_to_user} onValueChange={(v) => setNoteForm({ ...noteForm, note_to_user: v })}>
                    <SelectTrigger><SelectValue placeholder="Select recipient" /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 md:col-span-2">
                  <Label>Note Message *</Label>
                  <Textarea
                    value={noteForm.note_message}
                    onChange={(e) => setNoteForm({ ...noteForm, note_message: e.target.value })}
                    placeholder="Type your note here..."
                    className="min-h-[100px] resize-y"
                  />
                </div>
              </div>
              <Button
                onClick={() => createNote.mutate()}
                disabled={!noteForm.note_to_user || !noteForm.note_message.trim() || createNote.isPending}
              >
                {createNote.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : "Save Note"}
              </Button>
              <Separator />
              {leadNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet</p>
              ) : (
                <div className="space-y-3">
                  {leadNotes.map((n: any) => (
                    <div key={n.id} className="p-3 rounded-lg border bg-muted/20">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{n.note_message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            From: <span className="font-medium">{employees.find((e) => e.user_id === n.created_by)?.name ?? "Unknown"}</span>
                            {" · "}
                            To: <span className="font-medium">{employees.find((e) => e.user_id === n.note_to_user)?.name ?? "Unknown"}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(n.created_at), "MMM d, yyyy HH:mm")}</p>
                        </div>
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => { if (confirm("Delete this note?")) deleteNote.mutate(n.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── TASKS TAB ── */}
            <TabsContent value="tasks" className="space-y-4">
              {/* Add Task Form — shown first */}
              <p className="font-medium text-sm">Add Task</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Client ID</Label>
                  <Input value={lead.client_id ?? ""} readOnly className="bg-muted/40 cursor-default" placeholder="—" />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input value={lead.name ?? ""} readOnly className="bg-muted/40 cursor-default" />
                </div>
                <div>
                  <Label>Follow Up Date *</Label>
                  <Input
                    type="date"
                    min={format(new Date(), "yyyy-MM-dd")}
                    value={taskForm.followUpDate ? format(taskForm.followUpDate, "yyyy-MM-dd") : ""}
                    onChange={(e) => {
                      const d = e.target.value ? new Date(e.target.value + "T00:00:00") : undefined;
                      setTaskForm({ ...taskForm, followUpDate: d });
                    }}
                    className="w-full"
                  />
                </div>
                {isAdmin && (
                  <div>
                    <Label>Assign To <span className="text-destructive">*</span></Label>
                    <Select value={taskForm.assignedTo} onValueChange={(v) => setTaskForm({ ...taskForm, assignedTo: v })}>
                      <SelectTrigger className={!taskForm.assignedTo ? "border-amber-400" : ""}><SelectValue placeholder="Select employee to assign" /></SelectTrigger>
                      <SelectContent>
                        {employees.length === 0 && <SelectItem value="_none" disabled>No active employees found</SelectItem>}
                        {employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {!taskForm.assignedTo && <p className="text-xs text-amber-600 mt-1">Please select an employee to assign this task to.</p>}
                  </div>
                )}
                <div className="col-span-1 md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={taskForm.notes}
                    onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
                    placeholder="Describe what needs to be done..."
                    className="min-h-[120px] resize-y"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={() => { setTaskSubmitError(null); createTask.mutate(); }}
                  disabled={!taskForm.followUpDate || (isAdmin && !taskForm.assignedTo) || createTask.isPending}
                >
                  {createTask.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding...</> : "Add Task"}
                </Button>
                {taskSubmitError && <p className="text-sm text-destructive">{taskSubmitError}</p>}
              </div>

              {/* Task List — shown below the form */}
              {tasks.length > 0 && <Separator />}
              {tasks.map((t) => (
                <div key={t.id} className={cn("p-3 rounded-lg border", t.status === "Completed" ? "bg-success/5" : new Date(t.follow_up_date) < new Date() ? "border-destructive/50 bg-destructive/5" : "")}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{format(new Date(t.follow_up_date), "MMM d, yyyy")} · {t.status}</p>
                      {t.notes && <p className="text-sm mt-1">{t.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.proof_submitted && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium whitespace-nowrap">Proof Submitted</span>
                      )}
                      {t.proof_url && (
                        <a href={t.proof_url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline whitespace-nowrap">View Proof</a>
                      )}
                      {!t.proof_submitted && t.status !== "Completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setProofTaskId(proofTaskId === t.id ? null : t.id);
                            setProofFile(null); setProofUploaded(false); setProofUrl(null); setProofProgress(0);
                          }}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          {proofTaskId === t.id ? "Cancel" : "Upload Proof"}
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm("Delete this task?")) deleteTask.mutate({ taskId: t.id, taskDescription: t.description ?? "" }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Inline proof upload panel */}
                  {proofTaskId === t.id && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      <FileUploadWidget
                        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        label="Proof File *"
                        file={proofFile}
                        onSelect={(f) => {
                          if (!f) return;
                          setProofFile(f);
                          setProofUploaded(false);
                          setProofUrl(null);
                          setProofProgress(0);
                          proofUrlRef.current = null;
                          handleProofUpload(f);
                        }}
                        onRemove={() => { setProofFile(null); setProofUploaded(false); setProofUrl(null); setProofProgress(0); proofUrlRef.current = null; }}
                        uploading={proofUploading}
                        progress={proofProgress}
                        uploaded={proofUploaded}
                      />
                      <Button
                        size="sm"
                        onClick={() => submitTaskProof.mutate()}
                        disabled={!proofUploaded || submitTaskProof.isPending}
                      >
                        {submitTaskProof.isPending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Submitting...</> : "Submit Proof"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </TabsContent>


          </CardContent>
        </Tabs>
      </Card>

      {/* Trip Payments Tab — only when Converted */}
      {lead.status === "Converted" && (role === "admin" || role === "employee" || role === "execution" || role === "accounts") && (
        <Card>
          <CardHeader><CardTitle>Trip Payments</CardTitle></CardHeader>
          <CardContent>
            <TripPaymentsTab leadId={id!} totalExpected={(lead as any).total_expected ?? null} />
          </CardContent>
        </Card>
      )}

      {/* Activity Log */}
      <Card>
        <CardHeader><CardTitle>Activity Log</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const relevantActivities = activities;
            return relevantActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet</p>
          ) : (
            <div className="space-y-2">
              {relevantActivities.map((a) => {
                // Resolve proof URL: prefer proof_url column → legacy columns → details URL →
                // cross-reference revisions table (covers old entries before proof_url column existed)
                const proofUrl: string | null = (() => {
                  // 1. Dedicated proof_url column (new entries)
                  if (a.proof_url) return a.proof_url;
                  // 2. Legacy column names
                  if ((a as any).file_url) return (a as any).file_url;
                  if ((a as any).upload_url) return (a as any).upload_url;
                  // 3. Details that is itself a URL
                  if (a.details?.startsWith("http")) return a.details;
                  // 4. Cross-reference revisions table — covers all old "Revision N added" entries
                  const revMatch = a.action?.match(/Revision (\d+) added/i);
                  if (revMatch) {
                    const revNum = parseInt(revMatch[1]);
                    const rev = revisions.find((r) => r.revision_number === revNum);
                    if (rev) return rev.itinerary_link || rev.call_recording_url || null;
                  }
                  // 5. "Itinerary submitted" → find the earliest itinerary revision
                  if (a.action?.toLowerCase().includes("itinerary submitted")) {
                    const rev = revisions.find((r) => r.itinerary_link);
                    if (rev) return rev.itinerary_link || null;
                  }
                  // 6. "Task proof submitted" → look up task by entity_id, then fall back to any completed task
                  if (a.action?.toLowerCase().includes("task proof")) {
                    if (a.entity_id) {
                      const task = tasks.find((t) => t.id === a.entity_id);
                      if (task?.proof_url) return task.proof_url;
                    }
                    // No entity_id (old entries): if only one task has a proof, use it
                    const proofTasks = tasks.filter((t) => t.proof_url);
                    if (proofTasks.length === 1) return proofTasks[0].proof_url ?? null;
                  }
                  return null;
                })();
                // Show description text only when details is not itself a URL
                const descriptionText =
                  a.details && !a.details.startsWith("http") ? a.details : null;
                return (
                <div key={a.id} className="flex items-start gap-3 text-sm py-2 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <p className="font-medium">{a.action}</p>
                    {descriptionText && <p className="text-xs text-muted-foreground">{descriptionText}</p>}
                    {proofUrl && (
                      <a
                        href={proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-yellow-600 font-medium hover:underline mt-0.5"
                      >
                        <ExternalLink className="h-3 w-3" /> View Proof
                      </a>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(a.timestamp!), "MMM d, yyyy HH:mm")}</p>
                  </div>
                </div>
                );
              })}
            </div>
          );
          })()}
        </CardContent>
      </Card>

      {/* Conversion Dialog */}
      <ConversionDialog
        open={conversionDialogOpen}
        onOpenChange={setConversionDialogOpen}
        leadId={id!}
        leadName={lead.name}
        assignedEmployeeId={lead.assigned_employee_id}
        onConverted={() => {
          queryClient.invalidateQueries({ queryKey: ["lead", id] });
          queryClient.invalidateQueries({ queryKey: ["leads"] });
          queryClient.invalidateQueries({ queryKey: ["activities", id] });
        }}
      />
    </div>
  );
}
