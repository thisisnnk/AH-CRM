import { useState } from "react";
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
import { ArrowLeft, Upload, Phone, Mail, MapPin, ExternalLink, FileText, MessageSquare, Mic, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { sendNotification } from "@/utils/notificationHelper";

export default function LeadDetailPage() {
  const { id } = useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";

  // Itinerary form state
  const [itineraryLink, setItineraryLink] = useState("");
  // Revision form state
  const [revForm, setRevForm] = useState({
    type: "" as string,
    file: null as File | null,
    itineraryLink: "",
    notes: "",
  });
  // Proof form state
  const [proofFile, setProofFile] = useState<File | null>(null);
  // Task form state
  const [taskForm, setTaskForm] = useState({ description: "", followUpDate: undefined as Date | undefined, notes: "", assignedTo: "" });

  const { data: lead } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: revisions = [] } = useQuery({
    queryKey: ["revisions", id],
    queryFn: async () => {
      const { data } = await supabase.from("revisions").select("*").eq("lead_id", id!).order("revision_number", { ascending: true });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: proofs = [] } = useQuery({
    queryKey: ["proofs", id],
    queryFn: async () => {
      const { data } = await supabase.from("proof_of_activities").select("*").eq("lead_id", id!).order("created_at", { ascending: false });
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

  // Check if itinerary has been submitted (determines if "On Progress" status is available)
  const hasItinerary = revisions.some((r) => r.itinerary_link && r.send_status === "Sent") || (lead?.itinerary_code && lead.itinerary_code.trim() !== "");

  // Available status options depend on whether itinerary has been submitted
  const availableStatuses = hasItinerary
    ? ["Open", "On Progress", "Lost", "Converted"]
    : ["Open", "Lost", "Converted"];

  const updateLead = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from("leads").update(updates).eq("id", id!);
      if (error) throw error;
      const { error: logErr } = await supabase.from("activity_logs").insert({
        lead_id: id!,
        user_id: user!.id,
        action: "Updated lead",
        details: JSON.stringify(updates),
      });
      if (logErr) console.error("Activity log error:", logErr);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Update lead error:", err);
      toast({ title: "Error updating lead", description: err.message, variant: "destructive" });
    },
  });

  // === ITINERARY SUBMISSION ===
  const submitItinerary = useMutation({
    mutationFn: async () => {
      if (!itineraryLink.trim() || !user) throw new Error("Itinerary link is required");

      // Create a revision entry for the itinerary
      const nextNum = revisions.length + 1;
      const { error: revErr } = await supabase.from("revisions").insert({
        revision_number: nextNum,
        itinerary_link: itineraryLink,
        notes: "Initial itinerary submitted",
        send_status: "Sent",
        date_sent: new Date().toISOString(),
        lead_id: id!,
        created_by: user.id,
      });
      if (revErr) throw revErr;

      // Auto-set status to "On Progress" + update itinerary_code
      const { error: updateErr } = await supabase.from("leads").update({
        status: "On Progress",
        badge_stage: "Follow Up",
        itinerary_code: itineraryLink,
        last_activity_at: new Date().toISOString(),
      }).eq("id", id!);
      if (updateErr) console.error("Update lead status error:", updateErr);

      // Log activity
      const { error: logErr } = await supabase.from("activity_logs").insert({
        lead_id: id!,
        user_id: user.id,
        action: "Submitted itinerary",
        details: `Itinerary link: ${itineraryLink}`,
      });
      if (logErr) console.error("Activity log error:", logErr);
    },
    onSuccess: () => {
      toast({ title: "Itinerary submitted", description: "Lead status updated to On Progress" });
      setItineraryLink("");
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Submit itinerary error:", err);
      toast({ title: "Error submitting itinerary", description: err.message, variant: "destructive" });
    },
  });

  // === REVISION (Chat Screenshot / Call Recording / Revised Itinerary) ===
  const addRevision = useMutation({
    mutationFn: async () => {
      if (!user || !revForm.type) throw new Error("Select a revision type");

      let fileUrl: string | null = null;

      // Upload file if provided (for screenshot or call recording)
      if (revForm.file) {
        const folder = revForm.type === "Call Recording" ? "recordings" : "revisions";
        const filePath = `${folder}/${id}/${Date.now()}_${revForm.file.name}`;
        const { error: uploadErr } = await supabase.storage.from("crm-files").upload(filePath, revForm.file);
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from("crm-files").getPublicUrl(filePath);
        fileUrl = publicUrl;
      }

      const nextNum = revisions.length + 1;
      const { error: revErr } = await supabase.from("revisions").insert({
        revision_number: nextNum,
        call_recording_url: revForm.type === "Call Recording" ? fileUrl : null,
        itinerary_link: revForm.type === "Revised Itinerary" ? revForm.itineraryLink : null,
        notes: `[${revForm.type}] ${revForm.notes}`,
        send_status: revForm.type === "Revised Itinerary" ? "Sent" : "Pending",
        date_sent: revForm.type === "Revised Itinerary" ? new Date().toISOString() : null,
        lead_id: id!,
        created_by: user.id,
      });
      if (revErr) throw revErr;

      // Update last activity
      await supabase.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", id!);

      // Log activity
      const details = revForm.type === "Chat Screenshot"
        ? `Screenshot uploaded`
        : revForm.type === "Call Recording"
          ? `Call recording uploaded`
          : `Revised itinerary: ${revForm.itineraryLink}`;

      const { error: logErr } = await supabase.from("activity_logs").insert({
        lead_id: id!,
        user_id: user.id,
        action: `Added Revision ${nextNum} — ${revForm.type}`,
        details: `${details}${revForm.notes ? `. Notes: ${revForm.notes}` : ""}`,
      });
      if (logErr) console.error("Activity log error:", logErr);
    },
    onSuccess: () => {
      toast({ title: "Revision added" });
      setRevForm({ type: "", file: null, itineraryLink: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Add revision error:", err);
      toast({ title: "Error adding revision", description: err.message, variant: "destructive" });
    },
  });

  // === PROOF OF ACTIVITY ===
  const submitProof = useMutation({
    mutationFn: async () => {
      if (!proofFile || !user) throw new Error("Missing file or user session");
      const filePath = `proofs/${id}/${Date.now()}_${proofFile.name}`;
      const { error: uploadErr } = await supabase.storage.from("crm-files").upload(filePath, proofFile);
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("crm-files").getPublicUrl(filePath);

      const { error: insertErr } = await supabase.from("proof_of_activities").insert({
        file_url: publicUrl,
        file_type: proofFile.type,
        submitted_by: user.id,
        lead_id: id!,
      });
      if (insertErr) throw insertErr;

      await supabase.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", id!);

      const { error: logErr } = await supabase.from("activity_logs").insert({
        lead_id: id!,
        user_id: user.id,
        action: "Submitted proof of activity",
        details: proofFile.name,
      });
      if (logErr) console.error("Activity log error:", logErr);
    },
    onSuccess: () => {
      toast({ title: "Proof submitted" });
      setProofFile(null);
      queryClient.invalidateQueries({ queryKey: ["proofs", id] });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Submit proof error:", err);
      toast({ title: "Error submitting proof", description: err.message, variant: "destructive" });
    },
  });

  // === CREATE TASK ===
  const createTask = useMutation({
    mutationFn: async () => {
      if (!user || !taskForm.followUpDate) throw new Error("Missing required fields");
      const assignedTo = taskForm.assignedTo || lead?.assigned_employee_id || user.id;

      const { error: taskErr } = await supabase.from("tasks").insert({
        description: taskForm.description,
        follow_up_date: taskForm.followUpDate.toISOString(),
        notes: taskForm.notes || null,
        lead_id: id!,
        assigned_employee_id: assignedTo,
        created_by: user.id,
      });
      if (taskErr) throw taskErr;

      const { error: logErr } = await supabase.from("activity_logs").insert({
        lead_id: id!,
        user_id: user.id,
        action: "Created task",
        details: taskForm.description,
      });
      if (logErr) console.error("Activity log error:", logErr);

      // Notify assigned employee
      if (assignedTo !== user.id) {
        await sendNotification({
          recipientId: assignedTo,
          type: "task_assigned",
          message: `New task for lead "${lead?.name ?? ""}": ${taskForm.description}`,
          leadId: id,
          isTask: true,
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Task created" });
      setTaskForm({ description: "", followUpDate: undefined, notes: "", assignedTo: "" });
      queryClient.invalidateQueries({ queryKey: ["lead-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => {
      console.error("Create task error:", err);
      toast({ title: "Error creating task", description: err.message, variant: "destructive" });
    },
  });

  if (!lead) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const revisionTypeIcons: Record<string, any> = {
    "Chat Screenshot": <MessageSquare className="h-4 w-4" />,
    "Call Recording": <Mic className="h-4 w-4" />,
    "Revised Itinerary": <RefreshCw className="h-4 w-4" />,
  };

  const canAddRevision = revForm.type && revForm.notes.trim() &&
    ((revForm.type === "Chat Screenshot" && revForm.file) ||
      (revForm.type === "Call Recording" && revForm.file) ||
      (revForm.type === "Revised Itinerary" && revForm.itineraryLink.trim()));

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/leads")} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Leads
      </Button>

      {/* Personal Details */}
      <Card>
        <CardHeader><CardTitle>Personal Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label className="text-muted-foreground text-xs">Name</Label><p className="font-medium">{lead.name}</p></div>
          <div><Label className="text-muted-foreground text-xs">Phone</Label><p><a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-info hover:underline"><Phone className="h-3 w-3" />{lead.phone}</a></p></div>
          <div><Label className="text-muted-foreground text-xs">WhatsApp</Label>
            {lead.whatsapp ? (
              <a href={`https://wa.me/${lead.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-success hover:underline">
                <ExternalLink className="h-3 w-3" />{lead.whatsapp}
              </a>
            ) : <p className="text-muted-foreground">—</p>}
          </div>
          <div><Label className="text-muted-foreground text-xs">Email</Label>
            {lead.email ? <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-info hover:underline"><Mail className="h-3 w-3" />{lead.email}</a> : <p className="text-muted-foreground">—</p>}
          </div>
          <div><Label className="text-muted-foreground text-xs">Location</Label><p className="flex items-center gap-1"><MapPin className="h-3 w-3 text-muted-foreground" />{[lead.city, lead.state, lead.country].filter(Boolean).join(", ") || "—"}</p></div>
        </CardContent>
      </Card>

      {/* Lead Information — status restricted */}
      <Card>
        <CardHeader><CardTitle>Lead Information</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground text-xs">Lead Source</Label>
            <Select value={lead.lead_source ?? ""} onValueChange={(v) => updateLead.mutate({ lead_source: v })}>
              <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                {["Instagram", "Website", "Referral", "Office Direct Lead"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-muted-foreground text-xs">Enquiry Date</Label><p>{lead.enquiry_date ? format(new Date(lead.enquiry_date), "MMM d, yyyy") : "—"}</p></div>
          <div>
            <Label className="text-muted-foreground text-xs">Status</Label>
            <Select value={lead.status ?? "Open"} onValueChange={(v) => updateLead.mutate({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {!hasItinerary && <p className="text-xs text-muted-foreground mt-1">Submit an itinerary to unlock "On Progress" status</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Itinerary Code</Label>
            <Input defaultValue={lead.itinerary_code ?? ""} onBlur={(e) => updateLead.mutate({ itinerary_code: e.target.value })} />
          </div>
          <div><Label className="text-muted-foreground text-xs">Destination</Label><p>{lead.destination ?? "—"}</p></div>
          <div><Label className="text-muted-foreground text-xs">Travelers</Label><p>{lead.travelers ?? "—"}</p></div>
        </CardContent>
      </Card>

      {/* === ITINERARY SECTION === */}
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
              <p className="text-xs text-muted-foreground mt-1">Submit an itinerary to move this lead to "On Progress"</p>
            </div>
          )}

          <Separator />
          <p className="font-medium text-sm">Submit Itinerary</p>
          <div className="flex items-center gap-3">
            <Input
              value={itineraryLink}
              onChange={(e) => setItineraryLink(e.target.value)}
              placeholder="https://... (itinerary or quotation link)"
              className="flex-1"
            />
            <Button onClick={() => submitItinerary.mutate()} disabled={!itineraryLink.trim() || submitItinerary.isPending}>
              <Upload className="h-4 w-4 mr-1" /> Submit
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* === REVISIONS SECTION === */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" /> Revisions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Existing revisions */}
          {revisions.map((rev) => {
            const typeMatch = rev.notes?.match(/^\[(.*?)\]/);
            const revType = typeMatch ? typeMatch[1] : "Revision";
            return (
              <div key={rev.id} className="p-4 rounded-lg border-l-4 border-primary bg-muted/20">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      {revisionTypeIcons[revType] ?? <FileText className="h-4 w-4" />}
                      <p className="font-medium">Rev {rev.revision_number} — {revType}</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{rev.notes?.replace(/^\[.*?\]\s*/, "")}</p>
                    {rev.itinerary_link && (
                      <a href={rev.itinerary_link} target="_blank" rel="noopener" className="text-xs text-info hover:underline mt-1 block">
                        <ExternalLink className="h-3 w-3 inline mr-1" />Itinerary Link
                      </a>
                    )}
                    {rev.call_recording_url && (
                      <a href={rev.call_recording_url} target="_blank" rel="noopener" className="text-xs text-info hover:underline mt-1 block">
                        🎙️ Call Recording
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full", rev.send_status === "Sent" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                      {rev.send_status}
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
              <Select value={revForm.type} onValueChange={(v) => setRevForm({ ...revForm, type: v, file: null, itineraryLink: "" })}>
                <SelectTrigger><SelectValue placeholder="Select revision type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Chat Screenshot">💬 Chat Screenshot</SelectItem>
                  <SelectItem value="Call Recording">🎙️ Call Recording</SelectItem>
                  <SelectItem value="Revised Itinerary">📋 Revised Itinerary</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conditional fields based on type */}
            {(revForm.type === "Chat Screenshot" || revForm.type === "Call Recording") && (
              <div>
                <Label>{revForm.type === "Chat Screenshot" ? "Screenshot File *" : "Recording File *"}</Label>
                <Input
                  type="file"
                  accept={revForm.type === "Chat Screenshot" ? "image/*" : "audio/*,video/*"}
                  onChange={(e) => setRevForm({ ...revForm, file: e.target.files?.[0] ?? null })}
                />
              </div>
            )}

            {revForm.type === "Revised Itinerary" && (
              <div>
                <Label>Revised Itinerary Link *</Label>
                <Input
                  value={revForm.itineraryLink}
                  onChange={(e) => setRevForm({ ...revForm, itineraryLink: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}

            {revForm.type && (
              <div>
                <Label>Notes *</Label>
                <Textarea value={revForm.notes} onChange={(e) => setRevForm({ ...revForm, notes: e.target.value })} placeholder="Describe the revision..." />
              </div>
            )}

            <Button onClick={() => addRevision.mutate()} disabled={!canAddRevision || addRevision.isPending}>
              Save Revision
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Proof of Activity */}
      <Card>
        <CardHeader><CardTitle>Proof of Activity</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input type="file" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} className="flex-1" />
            <Button onClick={() => submitProof.mutate()} disabled={!proofFile || submitProof.isPending}>
              <Upload className="h-4 w-4 mr-1" /> Submit
            </Button>
          </div>
          {proofs.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div>
                <a href={p.file_url} target="_blank" rel="noopener" className="text-sm text-info hover:underline">{p.file_type}</a>
                <p className="text-xs text-muted-foreground">{format(new Date(p.created_at!), "MMM d, yyyy HH:mm")}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tasks & Follow Up */}
      <Card>
        <CardHeader><CardTitle>Tasks & Follow Up</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {tasks.map((t) => (
            <div key={t.id} className={cn("p-3 rounded-lg border", t.status === "Completed" ? "bg-success/5" : new Date(t.follow_up_date) < new Date() ? "border-destructive/50 bg-destructive/5" : "")}>
              <p className="font-medium text-sm">{t.description}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(t.follow_up_date), "MMM d, yyyy")} · {t.status}</p>
              {t.notes && <p className="text-xs text-muted-foreground mt-1">{t.notes}</p>}
            </div>
          ))}
          <Separator />
          <p className="font-medium text-sm">Add Task</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            {isAdmin && (
              <div>
                <Label>Assign To</Label>
                <Select value={taskForm.assignedTo} onValueChange={(v) => setTaskForm({ ...taskForm, assignedTo: v })}>
                  <SelectTrigger><SelectValue placeholder="Current employee" /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-2"><Label>Notes</Label><Textarea value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} /></div>
          </div>
          <Button onClick={() => createTask.mutate()} disabled={!taskForm.description || !taskForm.followUpDate || createTask.isPending}>
            Add Task
          </Button>
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card>
        <CardHeader><CardTitle>Activity Log</CardTitle></CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet</p>
          ) : (
            <div className="space-y-2">
              {activities.map((a) => (
                <div key={a.id} className="flex items-start gap-3 text-sm py-2 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <p className="font-medium">{a.action}</p>
                    {a.details && <p className="text-xs text-muted-foreground">{a.details}</p>}
                    <p className="text-xs text-muted-foreground">{format(new Date(a.timestamp!), "MMM d, yyyy HH:mm")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
