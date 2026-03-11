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
import { ArrowLeft, Upload, Phone, Mail, MapPin, ExternalLink, FileText, MessageSquare, Mic, RefreshCw, X, Loader2, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { sendNotification } from "@/utils/notificationHelper";
import { uploadToR2 } from "@/utils/uploadToR2";

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
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onSelect(e.target.files?.[0] ?? null);
          e.target.value = ""; // Reset so re-selecting same file works
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start gap-2 border-dashed"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Choose File</span>
      </Button>
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

  // Edit mode state
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({ name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "" });
  const [isEditingLeadInfo, setIsEditingLeadInfo] = useState(false);
  const [isSavingLeadInfo, setIsSavingLeadInfo] = useState(false);
  const [leadInfoForm, setLeadInfoForm] = useState({ lead_source: "", status: "", itinerary_code: "", destination: "", travelers: "", trip_duration: "", tour_category: "" });

  // ── Upload helper — sends to Cloudflare R2 ──
  const uploadFile = (file: File, folder: string, setProgress: (n: number) => void): Promise<string> =>
    uploadToR2(file, folder, setProgress);

  // ── Queries ──
  const { data: lead } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  const { data: revisions = [] } = useQuery({
    queryKey: ["revisions", id],
    queryFn: async () => {
      const { data } = await supabase.from("revisions").select("*").eq("lead_id", id!).order("revision_number", { ascending: true });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["activities", id],
    queryFn: async () => {
      const { data } = await supabase.from("activity_logs").select("*").eq("lead_id", id!).order("timestamp", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["lead-tasks", id],
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("lead_id", id!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
      return data ?? [];
    },
  });

  // True only when an actual itinerary file has been uploaded and sent — NOT just because a code was typed
  const hasActualItinerary = revisions.some((r) => r.itinerary_link && r.send_status === "Sent");
  const hasItinerary = hasActualItinerary;
  const availableStatuses = hasItinerary ? ["Open", "On Progress", "Lost", "Converted"] : ["Open", "Lost", "Converted"];

  // ── One-time cleanup: delete personal/lead-info update logs from DB ──
  useEffect(() => {
    if (!id) return;
    supabase.from("activity_logs").delete().eq("lead_id", id).eq("action", "Updated lead").then(() => {
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    });
  }, [id]);

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
        await supabase.from("activity_logs").insert({
          lead_id: id!, user_id: user.id, action: _logAction,
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
    mutationFn: async () => {
      if (!itineraryUrl || !user) throw new Error("Upload file first");

      const nextNum = revisions.length + 1;
      const { error: revErr } = await supabase.from("revisions").insert({
        revision_number: nextNum,
        call_recording_url: "",
        itinerary_link: itineraryUrl,
        notes: "Initial itinerary submitted",
        send_status: "Sent",
        date_sent: new Date().toISOString(),
        lead_id: id!,
        created_by: user.id,
      });
      if (revErr) throw revErr;

      let extractedCode = lead.itinerary_code || "";
      if (itineraryFile && (!lead.itinerary_code || lead.itinerary_code.startsWith("http"))) {
        const match = itineraryFile.name.match(/^([A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)?)/i);
        if (match) {
          extractedCode = match[1].toUpperCase();
        } else {
          // fallback to the first part of filename before space/dash/dot if possible
          extractedCode = itineraryFile.name.split(/[\s\.\_]/)[0].toUpperCase();
        }
      }

      await supabase.from("leads").update({
        status: lead.status === "Open" ? "On Progress" : lead.status,
        badge_stage: lead.badge_stage === "Open" ? "Follow Up" : lead.badge_stage,
        itinerary_code: extractedCode,
        last_activity_at: new Date().toISOString(),
      }).eq("id", id!);

      await supabase.from("activity_logs").insert({
        lead_id: id!, user_id: user.id, action: "Submitted itinerary",
        details: itineraryUrl ?? itineraryFile?.name ?? "",
      });
    },
    onSuccess: () => {
      toast({ title: "Itinerary submitted", description: "Lead status updated to On Progress" });
      setItineraryFile(null); setItineraryUploaded(false); setItineraryUrl(null); setItineraryProgress(0);
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Submit itinerary error:", err);
      toast({ title: "Error submitting itinerary", description: err.message, variant: "destructive" });
    },
  });

  // Revision Submit
  const addRevision = useMutation({
    mutationFn: async () => {
      if (!user || !revForm.type) throw new Error("Select type");

      let fileUrl = revFileUrl;
      const nextNum = revisions.length + 1;

      const { error: revErr } = await supabase.from("revisions").insert({
        revision_number: nextNum,
        call_recording_url: revForm.type === "Call Recording" ? (fileUrl ?? "") : "",
        itinerary_link: (revForm.type === "Revised Itinerary" || revForm.type === "Chat Screenshot") ? (fileUrl ?? "") : "",
        notes: `[${revForm.type}] ${revForm.notes}`,
        send_status: revForm.type === "Revised Itinerary" ? "Sent" : "Pending",
        date_sent: revForm.type === "Revised Itinerary" ? new Date().toISOString() : null,
        lead_id: id!,
        created_by: user.id,
      });
      if (revErr) throw revErr;

      await supabase.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", id!);

      const details = revForm.type === "Chat Screenshot" ? "Screenshot uploaded"
        : revForm.type === "Call Recording" ? "Call recording uploaded"
          : `Revised itinerary uploaded`;

      await supabase.from("activity_logs").insert({
        lead_id: id!, user_id: user.id,
        action: `Added Revision ${nextNum} — ${revForm.type}`,
        details: `${details}${revForm.notes ? `. Notes: ${revForm.notes}` : ""}`,
      });
    },
    onSuccess: () => {
      toast({ title: "Revision submitted successfully", description: `${revForm.type} has been recorded.` });
      setRevForm({ type: "", notes: "", itineraryLink: "" });
      setRevFile(null); setRevUploaded(false); setRevFileUrl(null); setRevProgress(0);
      queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Add revision error:", err);
      toast({ title: "Error adding revision", description: err.message, variant: "destructive" });
    },
  });

  // Task Create
  const createTask = useMutation({
    mutationFn: async () => {
      if (!user || !taskForm.followUpDate) throw new Error("Missing required fields");
      if (isAdmin && !taskForm.assignedTo) throw new Error("Please select an employee to assign this task to");
      const assignedTo = taskForm.assignedTo || user.id;
      const taskDescription = taskForm.notes.trim() || `Task for ${lead?.name ?? "lead"}`;

      const { error } = await supabase.from("tasks").insert({
        description: taskDescription, follow_up_date: taskForm.followUpDate.toISOString(),
        notes: taskForm.notes || null, lead_id: id!, assigned_employee_id: assignedTo, created_by: user.id,
      });
      if (error) throw error;

      await supabase.from("activity_logs").insert({
        lead_id: id!, user_id: user.id, action: "Created task", details: taskDescription,
      });

      if (assignedTo !== user.id) {
        await sendNotification({
          recipientId: assignedTo, type: "task_assigned",
          message: `New task for "${lead?.name ?? ""}" (${lead?.client_id ?? id}): ${taskForm.notes || taskDescription}`,
          leadId: id, isTask: true,
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Task created" });
      setTaskForm({ followUpDate: undefined, notes: "", assignedTo: "" });
      queryClient.invalidateQueries({ queryKey: ["lead-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Create task error:", err);
      toast({ title: "Error creating task", description: err.message, variant: "destructive" });
    },
  });

  // Task Proof Submit
  const submitTaskProof = useMutation({
    mutationFn: async () => {
      if (!proofFile || !proofTaskId || !user) throw new Error("No file selected");
      const url = await uploadToR2(proofFile, "task-proofs", setProofProgress);
      const { error } = await supabase.from("tasks").update({
        proof_url: url,
        proof_submitted: true,
        status: "Completed",
        completed_at: new Date().toISOString(),
      }).eq("id", proofTaskId);
      if (error) throw error;
      await supabase.from("activity_logs").insert({
        lead_id: id!, user_id: user.id, action: "Task proof uploaded",
        details: url,
      });
    },
    onSuccess: () => {
      toast({ title: "Proof submitted", description: "Task marked as completed." });
      setProofTaskId(null); setProofFile(null); setProofUploaded(false); setProofUrl(null); setProofProgress(0);
      queryClient.invalidateQueries({ queryKey: ["lead-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Submit task proof error:", err);
      toast({ title: "Error submitting proof", description: err.message, variant: "destructive" });
    },
  });

  if (!lead) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  // ── Edit handlers ──
  const startEditPersonal = () => {
    setPersonalForm({ name: lead.name, phone: lead.phone, whatsapp: lead.whatsapp || "", email: lead.email || "", city: lead.city || "", state: lead.state || "", country: lead.country || "" });
    setIsEditingPersonal(true);
  };
  const savePersonal = () => {
    setIsSavingPersonal(true);
    updateLead.mutate(
      { name: personalForm.name, phone: personalForm.phone, whatsapp: personalForm.whatsapp || null, email: personalForm.email || null, city: personalForm.city || null, state: personalForm.state || null, country: personalForm.country || null },
      {
        onSuccess: () => { setIsEditingPersonal(false); setIsSavingPersonal(false); },
        onError: () => setIsSavingPersonal(false),
      }
    );
  };

  const startEditLeadInfo = () => {
    setLeadInfoForm({ lead_source: lead.lead_source || "", status: lead.status || "Open", itinerary_code: lead.itinerary_code || "", destination: lead.destination || "", travelers: String(lead.travelers || ""), trip_duration: lead.trip_duration || "", tour_category: lead.tour_category || "" });
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
    };
    if (leadInfoForm.status === "Lost" || leadInfoForm.status === "Converted") {
      updates.badge_stage = leadInfoForm.status;
    }
    if (lead && leadInfoForm.status !== lead.status) {
      updates._logAction = `Changed status to ${leadInfoForm.status}`;
      updates.last_activity_at = new Date().toISOString();
    }
    updateLead.mutate(updates, {
      onSuccess: () => { setIsEditingLeadInfo(false); setIsSavingLeadInfo(false); },
      onError: () => setIsSavingLeadInfo(false),
    });
  };

  // ── Handlers ──
  const handleItineraryUpload = async () => {
    if (!itineraryFile) return;
    setItineraryUploading(true);
    setItineraryProgress(0);
    try {
      const url = await uploadFile(itineraryFile, "itineraries", setItineraryProgress);
      setItineraryUrl(url);
      setItineraryUploaded(true);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setItineraryUploading(false);
  };

  const handleRevFileUpload = async () => {
    if (!revFile) return;
    const folder = revForm.type === "Call Recording" ? "recordings" : revForm.type === "Revised Itinerary" ? "itineraries" : "revisions";
    setRevUploading(true);
    setRevProgress(0);
    try {
      const url = await uploadFile(revFile, folder, setRevProgress);
      setRevFileUrl(url);
      setRevUploaded(true);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
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
                <Select value={leadInfoForm.status} onValueChange={(v) => setLeadInfoForm({ ...leadInfoForm, status: v })}>
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
        </CardContent>
      </Card>

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
                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                label="Itinerary File *"
                file={itineraryFile}
                onSelect={(f) => { setItineraryFile(f); setItineraryUploaded(false); setItineraryUrl(null); setItineraryProgress(0); }}
                onRemove={() => { setItineraryFile(null); setItineraryUploaded(false); setItineraryUrl(null); setItineraryProgress(0); }}
                uploading={itineraryUploading}
                progress={itineraryProgress}
                uploaded={itineraryUploaded}
              />

              <div className="flex gap-2">
                {itineraryFile && !itineraryUploaded && !itineraryUploading && (
                  <Button variant="outline" onClick={handleItineraryUpload}>
                    <Upload className="h-4 w-4 mr-1" /> Upload File
                  </Button>
                )}
                {itineraryUploaded && (
                  <Button onClick={() => submitItinerary.mutate()} disabled={submitItinerary.isPending}>
                    <Upload className="h-4 w-4 mr-1" /> Submit Itinerary
                  </Button>
                )}
              </div>
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
                  <div className="text-right">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full",
                      rev.send_status === "Sent" ? "bg-success/10 text-success" :
                      "bg-info/10 text-info")}>
                      {rev.send_status === "Sent" ? "Sent" : "Submitted"}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(rev.created_at!), "MMM d, yyyy")}</p>
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
                  accept={revForm.type === "Chat Screenshot" ? "image/*" : revForm.type === "Call Recording" ? "audio/*,video/*" : ".pdf,.doc,.docx,image/*"}
                  label={revForm.type === "Chat Screenshot" ? "Screenshot File *" : revForm.type === "Call Recording" ? "Recording File *" : "Itinerary File *"}
                  file={revFile}
                  onSelect={(f) => { setRevFile(f); setRevUploaded(false); setRevFileUrl(null); setRevProgress(0); }}
                  onRemove={() => { setRevFile(null); setRevUploaded(false); setRevFileUrl(null); setRevProgress(0); }}
                  uploading={revUploading}
                  progress={revProgress}
                  uploaded={revUploaded}
                />
                {revFile && !revUploaded && !revUploading && (
                  <Button variant="outline" onClick={handleRevFileUpload}>
                    <Upload className="h-4 w-4 mr-1" /> Upload File
                  </Button>
                )}
              </>
            )}


            {revForm.type && (
              <div><Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label><Textarea value={revForm.notes} onChange={(e) => setRevForm({ ...revForm, notes: e.target.value })} placeholder="Describe the revision..." /></div>
            )}

            <Button onClick={() => addRevision.mutate()} disabled={!canSubmitRevision || addRevision.isPending}>
              Submit Revision
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tasks & Follow Up */}
      <Card>
        <CardHeader><CardTitle>Tasks & Follow Up</CardTitle></CardHeader>
        <CardContent className="space-y-4">
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
                </div>
              </div>

              {/* Inline proof upload panel */}
              {proofTaskId === t.id && (
                <div className="mt-3 pt-3 border-t space-y-3">
                  <FileUploadWidget
                    accept="image/*,.pdf,.doc,.docx"
                    label="Proof File *"
                    file={proofFile}
                    onSelect={(f) => { setProofFile(f); setProofUploaded(false); setProofUrl(null); setProofProgress(0); }}
                    onRemove={() => { setProofFile(null); setProofUploaded(false); setProofUrl(null); setProofProgress(0); }}
                    uploading={proofUploading}
                    progress={proofProgress}
                    uploaded={proofUploaded}
                  />
                  <Button
                    size="sm"
                    onClick={() => submitTaskProof.mutate()}
                    disabled={!proofFile || submitTaskProof.isPending}
                  >
                    {submitTaskProof.isPending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Submitting...</> : "Submit Proof"}
                  </Button>
                </div>
              )}
            </div>
          ))}
          <Separator />
          <p className="font-medium text-sm">Add Task</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Client ID — read-only from lead */}
            <div>
              <Label>Client ID</Label>
              <Input value={lead.client_id ?? ""} readOnly className="bg-muted/40 cursor-default" placeholder="—" />
            </div>
            {/* Name — read-only from lead */}
            <div>
              <Label>Name</Label>
              <Input value={lead.name ?? ""} readOnly className="bg-muted/40 cursor-default" />
            </div>
            <div>
              <Label>Follow Up Date *</Label>
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
          <Button
            onClick={() => createTask.mutate()}
            disabled={!taskForm.followUpDate || (isAdmin && !taskForm.assignedTo) || createTask.isPending}
          >
            Add Task
          </Button>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader><CardTitle>Activity Log</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const relevantActivities = activities.filter((a) =>
              a.action === "Submitted itinerary" ||
              a.action === "Created task" ||
              a.action === "Task proof uploaded" ||
              (a.action ?? "").startsWith("Added Revision") ||
              (a.action ?? "").startsWith("Changed status to")
            );
            return relevantActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet</p>
          ) : (
            <div className="space-y-2">
              {relevantActivities.map((a) => {
                const isProofUrl = a.details?.startsWith("https://");
                return (
                <div key={a.id} className="flex items-start gap-3 text-sm py-2 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <p className="font-medium">{a.action}</p>
                    {a.details && !isProofUrl && <p className="text-xs text-muted-foreground">{a.details}</p>}
                    {isProofUrl && (
                      <a href={a.details} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        View Proof
                      </a>
                    )}
                    <p className="text-xs text-muted-foreground">{format(new Date(a.timestamp!), "MMM d, yyyy HH:mm")}</p>
                  </div>
                </div>
                );
              })}
            </div>
          );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
