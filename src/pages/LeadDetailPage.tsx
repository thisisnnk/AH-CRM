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
import { ArrowLeft, Upload, Phone, Mail, MapPin, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";

export default function LeadDetailPage() {
  const { id } = useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";

  // Revision form state
  const [revForm, setRevForm] = useState({ notes: "", itineraryLink: "", callRecording: null as File | null, sendStatus: "Pending" });
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

  const updateLead = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from("leads").update(updates).eq("id", id!);
      if (error) throw error;
      // Log activity
      await supabase.from("activity_logs").insert({
        lead_id: id!,
        user_id: user!.id,
        action: "Updated lead",
        details: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
  });

  const submitProof = useMutation({
    mutationFn: async () => {
      if (!proofFile || !user) return;
      const filePath = `proofs/${id}/${Date.now()}_${proofFile.name}`;
      const { error: uploadErr } = await supabase.storage.from("crm-files").upload(filePath, proofFile);
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("crm-files").getPublicUrl(filePath);

      await supabase.from("proof_of_activities").insert({
        file_url: publicUrl,
        file_type: proofFile.type,
        submitted_by: user.id,
        lead_id: id!,
      });

      // Reset inactivity timer
      await supabase.from("leads").update({ last_activity_at: new Date().toISOString() }).eq("id", id!);

      // Log activity
      await supabase.from("activity_logs").insert({
        lead_id: id!,
        user_id: user.id,
        action: "Submitted proof of activity",
        details: proofFile.name,
      });
    },
    onSuccess: () => {
      toast({ title: "Proof submitted" });
      setProofFile(null);
      queryClient.invalidateQueries({ queryKey: ["proofs", id] });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addRevision = useMutation({
    mutationFn: async () => {
      if (!revForm.callRecording || !user) return;
      const filePath = `recordings/${id}/${Date.now()}_${revForm.callRecording.name}`;
      const { error: uploadErr } = await supabase.storage.from("crm-files").upload(filePath, revForm.callRecording);
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("crm-files").getPublicUrl(filePath);

      const nextNum = revisions.length + 1;
      await supabase.from("revisions").insert({
        revision_number: nextNum,
        call_recording_url: publicUrl,
        notes: revForm.notes,
        itinerary_link: revForm.itineraryLink,
        date_sent: revForm.sendStatus === "Sent" ? new Date().toISOString() : null,
        send_status: revForm.sendStatus,
        lead_id: id!,
        created_by: user.id,
      });

      // If marked as Sent, update badge_stage to Follow Up
      if (revForm.sendStatus === "Sent") {
        await supabase.from("leads").update({ badge_stage: "Follow Up", last_activity_at: new Date().toISOString() }).eq("id", id!);
      }

      await supabase.from("activity_logs").insert({
        lead_id: id!,
        user_id: user.id,
        action: `Added Revision ${nextNum}`,
        details: `Itinerary: ${revForm.itineraryLink}, Status: ${revForm.sendStatus}`,
      });
    },
    onSuccess: () => {
      toast({ title: "Revision added" });
      setRevForm({ notes: "", itineraryLink: "", callRecording: null, sendStatus: "Pending" });
      queryClient.invalidateQueries({ queryKey: ["revisions", id] });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createTask = useMutation({
    mutationFn: async () => {
      if (!user || !taskForm.followUpDate) return;
      await supabase.from("tasks").insert({
        description: taskForm.description,
        follow_up_date: taskForm.followUpDate.toISOString(),
        notes: taskForm.notes || null,
        lead_id: id!,
        assigned_employee_id: taskForm.assignedTo || lead?.assigned_employee_id || user.id,
        created_by: user.id,
      });
      await supabase.from("activity_logs").insert({
        lead_id: id!,
        user_id: user.id,
        action: "Created task",
        details: taskForm.description,
      });
    },
    onSuccess: () => {
      toast({ title: "Task created" });
      setTaskForm({ description: "", followUpDate: undefined, notes: "", assignedTo: "" });
      queryClient.invalidateQueries({ queryKey: ["lead-tasks", id] });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
  });

  if (!lead) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const canAddRevision = revForm.callRecording && revForm.itineraryLink.trim() && revForm.notes.trim();

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

      {/* Lead Information */}
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
                {["Open", "On Progress", "Lost", "Converted"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Itinerary Code</Label>
            <Input defaultValue={lead.itinerary_code ?? ""} onBlur={(e) => updateLead.mutate({ itinerary_code: e.target.value })} />
          </div>
          <div><Label className="text-muted-foreground text-xs">Destination</Label><p>{lead.destination ?? "—"}</p></div>
          <div><Label className="text-muted-foreground text-xs">Travelers</Label><p>{lead.travelers ?? "—"}</p></div>
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

      {/* Revisions */}
      <Card>
        <CardHeader><CardTitle>Itinerary & Revisions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {revisions.map((rev) => (
            <div key={rev.id} className="p-4 rounded-lg border-l-4 border-primary bg-muted/20">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">Rev {rev.revision_number}</p>
                  <p className="text-sm text-muted-foreground mt-1">{rev.notes}</p>
                  <a href={rev.itinerary_link} target="_blank" rel="noopener" className="text-xs text-info hover:underline mt-1 block">
                    <ExternalLink className="h-3 w-3 inline mr-1" />Itinerary Link
                  </a>
                  <a href={rev.call_recording_url} target="_blank" rel="noopener" className="text-xs text-info hover:underline mt-1 block">
                    🎙️ Call Recording
                  </a>
                </div>
                <div className="text-right">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", rev.send_status === "Sent" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                    {rev.send_status}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(rev.created_at!), "MMM d, yyyy")}</p>
                </div>
              </div>
            </div>
          ))}

          <Separator />
          <p className="font-medium text-sm">Add New Revision</p>
          <div className="space-y-3">
            <div><Label>Call Recording *</Label><Input type="file" accept="audio/*,video/*" onChange={(e) => setRevForm({ ...revForm, callRecording: e.target.files?.[0] ?? null })} /></div>
            <div><Label>Itinerary / Quotation Link *</Label><Input value={revForm.itineraryLink} onChange={(e) => setRevForm({ ...revForm, itineraryLink: e.target.value })} placeholder="https://..." /></div>
            <div><Label>Notes *</Label><Textarea value={revForm.notes} onChange={(e) => setRevForm({ ...revForm, notes: e.target.value })} /></div>
            <div>
              <Label>Send Status</Label>
              <Select value={revForm.sendStatus} onValueChange={(v) => setRevForm({ ...revForm, sendStatus: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Sent">Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => addRevision.mutate()} disabled={!canAddRevision || addRevision.isPending}>
              Save Revision
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
