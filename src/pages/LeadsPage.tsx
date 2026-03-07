import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { CalendarIcon, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays, endOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { sendNotification } from "@/utils/notificationHelper";

const sourceOptions = ["Instagram", "Website", "Referral", "Office Direct Lead"] as const;

export default function LeadsPage() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = role === "admin";

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 90), to: new Date() });
  const [newLead, setNewLead] = useState({
    name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "",
    destination: "", travelers: "", trip_duration: "", lead_source: "", assigned_employee_id: "",
  });

  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["leads", filter, dateRange, user?.id, role],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", endOfDay(dateRange.to).toISOString())
        .order("created_at", { ascending: false });

      if (!isAdmin && user) {
        query = query.eq("assigned_employee_id", user.id);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Leads fetch error:", error);
        toast({ title: "Error loading leads", description: error.message, variant: "destructive" });
        return [];
      }
      console.log("Leads fetched:", data?.length ?? 0, "records");
      return data ?? [];
    },
    enabled: !!user,
    refetchOnMount: "always",
    retry: 2,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
      return data ?? [];
    },
    refetchOnMount: "always",
  });

  // Generate client ID in AH-YYYY-MM-NNNN format
  const generateClientId = async (): Promise<string> => {
    const now = new Date();
    const yr = now.getFullYear().toString();
    const mo = (now.getMonth() + 1).toString().padStart(2, "0");
    const prefix = `AH-${yr}-${mo}-`;

    // Try server-side RPC first, fall back to client-side generation
    try {
      const { data: rpcId, error: rpcErr } = await supabase.rpc("generate_client_id");
      if (!rpcErr && rpcId) return rpcId;
    } catch {
      // RPC not available, generate client-side
    }

    // Fallback: query max existing client_id for this month
    const { data: existing } = await supabase
      .from("leads")
      .select("client_id")
      .like("client_id", `${prefix}%`)
      .order("client_id", { ascending: false })
      .limit(1);

    let nextSeq = 1;
    if (existing && existing.length > 0 && existing[0].client_id) {
      const lastNum = parseInt(existing[0].client_id.slice(-4), 10);
      if (!isNaN(lastNum)) nextSeq = lastNum + 1;
    }

    return `${prefix}${nextSeq.toString().padStart(4, "0")}`;
  };

  const createLead = useMutation({
    mutationFn: async () => {
      // 1. Generate client ID
      const clientId = await generateClientId();

      // 2. Create contact using the same client ID
      const { data: contactData, error: contactErr } = await supabase.from("contacts").insert({
        contact_id: clientId,
        name: newLead.name,
        phone: newLead.phone,
        whatsapp: newLead.whatsapp || null,
        email: newLead.email || null,
        city: newLead.city || null,
        state: newLead.state || null,
        country: newLead.country || null,
      }).select("id").single();
      if (contactErr) throw contactErr;

      // 3. Create lead linked to the contact
      const { error: leadErr } = await supabase.from("leads").insert({
        client_id: clientId,
        contact_id: contactData.id,
        name: newLead.name,
        phone: newLead.phone,
        whatsapp: newLead.whatsapp || null,
        email: newLead.email || null,
        city: newLead.city || null,
        state: newLead.state || null,
        country: newLead.country || null,
        destination: newLead.destination || null,
        travelers: newLead.travelers ? parseInt(newLead.travelers) : null,
        trip_duration: newLead.trip_duration || null,
        lead_source: newLead.lead_source,
        assigned_employee_id: newLead.assigned_employee_id,
      });
      if (leadErr) throw leadErr;

      // 4. Notify assigned employee
      if (newLead.assigned_employee_id) {
        await sendNotification({
          recipientId: newLead.assigned_employee_id,
          type: "lead_assigned",
          message: `New lead "${newLead.name}" has been assigned to you`,
          leadId: undefined, // We don't have the lead ID from the insert
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Lead created", description: "Contact was also created automatically." });
      setCreateOpen(false);
      setNewLead({ name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "", destination: "", travelers: "", trip_duration: "", lead_source: "", assigned_employee_id: "" });
      // Refresh date range to include the new lead
      setDateRange((prev) => ({ ...prev, to: new Date() }));
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (err: any) => {
      console.error("Create lead error:", err);
      toast({ title: "Error creating lead", description: err.message, variant: "destructive" });
    },
  });


  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      // Null out lead_id in notifications to break FK, then delete dependent records
      await (supabase as any).from("notifications").update({ lead_id: null }).eq("lead_id", id);
      await supabase.from("tasks").delete().eq("lead_id", id);
      await supabase.from("activity_logs").delete().eq("lead_id", id);
      await supabase.from("revisions").delete().eq("lead_id", id);
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead deleted" });
    },
    onError: (err: any) => {
      console.error("Delete lead error:", err);
      toast({ title: "Error deleting lead", description: err.message, variant: "destructive" });
    },
  });

  const reassignLead = useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
      const { error } = await supabase.from("leads").update({ assigned_employee_id: employeeId }).eq("id", id);
      if (error) throw error;

      // Get lead name for notification message
      const { data: leadData } = await supabase.from("leads").select("name").eq("id", id).single();
      const leadName = leadData?.name ?? "a lead";

      // Notify new employee
      await sendNotification({
        recipientId: employeeId,
        type: "lead_reassigned",
        message: `Lead "${leadName}" has been reassigned to you`,
        leadId: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead reassigned" });
    },
    onError: (err: any) => {
      console.error("Reassign lead error:", err);
      toast({ title: "Error reassigning lead", description: err.message, variant: "destructive" });
    },
  });

  const filteredLeads = leads.filter((l) => {
    if (filter !== "all") {
      if (isAdmin && l.status !== filter) return false;
      if (!isAdmin && l.badge_stage !== filter) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      return l.name.toLowerCase().includes(s) || l.phone.includes(s) || l.destination?.toLowerCase().includes(s);
    }
    return true;
  });

  const badgeCounts = isAdmin
    ? {
      Open: leads.filter((l) => l.status === "Open").length,
      "On Progress": leads.filter((l) => l.status === "On Progress").length,
      Converted: leads.filter((l) => l.status === "Converted").length,
      Lost: leads.filter((l) => l.status === "Lost").length,
    }
    : {
      Open: leads.filter((l) => l.badge_stage === "Open").length,
      "Follow Up": leads.filter((l) => l.badge_stage === "Follow Up").length,
      Converted: leads.filter((l) => l.badge_stage === "Converted").length,
      Lost: leads.filter((l) => l.badge_stage === "Lost").length,
    };

  const badgeKeys = isAdmin ? ["Open", "On Progress", "Converted", "Lost"] : ["Open", "Follow Up", "Converted", "Lost"];
  const badgeIcons = ["🔵", "🔄", "✅", "❌"];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Leads</h1>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => { if (range?.from && range?.to) setDateRange({ from: range.from, to: range.to }); }}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          {isAdmin && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Lead</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Create Lead</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>Name *</Label><Input value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} /></div>
                  <div><Label>Phone *</Label><Input value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} /></div>
                  <div><Label>WhatsApp</Label><Input value={newLead.whatsapp} onChange={(e) => setNewLead({ ...newLead, whatsapp: e.target.value })} /></div>
                  <div><Label>Email</Label><Input value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} /></div>
                  <div><Label>City</Label><Input value={newLead.city} onChange={(e) => setNewLead({ ...newLead, city: e.target.value })} /></div>
                  <div><Label>State</Label><Input value={newLead.state} onChange={(e) => setNewLead({ ...newLead, state: e.target.value })} /></div>
                  <div><Label>Country</Label><Input value={newLead.country} onChange={(e) => setNewLead({ ...newLead, country: e.target.value })} /></div>
                  <div><Label>Destination</Label><Input value={newLead.destination} onChange={(e) => setNewLead({ ...newLead, destination: e.target.value })} /></div>
                  <div><Label>Travelers</Label><Input type="number" value={newLead.travelers} onChange={(e) => setNewLead({ ...newLead, travelers: e.target.value })} /></div>
                  <div><Label>Trip Duration</Label><Input value={newLead.trip_duration} onChange={(e) => setNewLead({ ...newLead, trip_duration: e.target.value })} /></div>
                  <div>
                    <Label>Source *</Label>
                    <Select value={newLead.lead_source} onValueChange={(v) => setNewLead({ ...newLead, lead_source: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Assign To *</Label>
                    <Select value={newLead.assigned_employee_id} onValueChange={(v) => setNewLead({ ...newLead, assigned_employee_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full mt-4" onClick={() => createLead.mutate()} disabled={!newLead.name || !newLead.phone || !newLead.lead_source || !newLead.assigned_employee_id || createLead.isPending}>
                  Create Lead
                </Button>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Badge Pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button onClick={() => setFilter("all")} className={cn("badge-pill", filter === "all" ? "badge-pill-active" : "badge-pill-inactive")}>
          All ({leads.length})
        </button>
        {badgeKeys.map((key, i) => (
          <button key={key} onClick={() => setFilter(key)} className={cn("badge-pill", filter === key ? "badge-pill-active" : "badge-pill-inactive")}>
            {badgeIcons[i]} {key} ({badgeCounts[key as keyof typeof badgeCounts]})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-lg border" style={{ maxHeight: "70vh" }}>
        <table className="w-full text-sm" style={{ minWidth: "1100px" }}>
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="text-left py-3 px-4 whitespace-nowrap">Enquiry Date</th>
              <th className="text-left py-3 px-4 whitespace-nowrap">Source</th>
              <th className="text-left py-3 px-4 whitespace-nowrap">Itinerary Code</th>
              <th className="text-left py-3 px-4 whitespace-nowrap">Name</th>
              <th className="text-left py-3 px-4 whitespace-nowrap">Phone</th>
              <th className="text-left py-3 px-4 whitespace-nowrap">Destination</th>
              <th className="text-left py-3 px-4 whitespace-nowrap">Duration</th>
              {isAdmin && <th className="text-left py-3 px-4 whitespace-nowrap">Assigned To</th>}
              <th className="text-left py-3 px-4 whitespace-nowrap">Pax</th>
              <th className="text-left py-3 px-4 whitespace-nowrap">Status</th>
              <th className="text-left py-3 px-4 whitespace-nowrap">Last Activity</th>
              {isAdmin && <th className="text-right py-3 px-4 w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr key={lead.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                <td className="py-3 px-4 whitespace-nowrap">{lead.enquiry_date ? format(new Date(lead.enquiry_date), "MMM d, yyyy") : "—"}</td>
                <td className="py-3 px-4 whitespace-nowrap">{lead.lead_source ?? "—"}</td>
                <td className="py-3 px-4 whitespace-nowrap">{lead.itinerary_code ?? "—"}</td>
                <td className="py-3 px-4 font-medium whitespace-nowrap">{lead.name}</td>
                <td className="py-3 px-4 whitespace-nowrap">{lead.phone}</td>
                <td className="py-3 px-4 whitespace-nowrap">{lead.destination ?? "—"}</td>
                <td className="py-3 px-4 whitespace-nowrap">{lead.trip_duration ?? "—"}</td>
                {isAdmin && (
                  <td className="py-3 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={lead.assigned_employee_id ?? ""}
                      onValueChange={(v) => reassignLead.mutate({ id: lead.id, employeeId: v })}
                    >
                      <SelectTrigger className="h-8 text-xs w-32">
                        <SelectValue>{employees.find((e) => e.user_id === lead.assigned_employee_id)?.name ?? "Unassigned"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                )}
                <td className="py-3 px-4 whitespace-nowrap">{lead.travelers ?? "—"}</td>
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium",
                    (isAdmin ? lead.status : lead.badge_stage) === "Open" && "status-open",
                    (isAdmin ? lead.status : lead.badge_stage) === "On Progress" && "status-ongoing",
                    (isAdmin ? lead.status : lead.badge_stage) === "Follow Up" && "status-ongoing",
                    (isAdmin ? lead.status : lead.badge_stage) === "Converted" && "status-converted",
                    (isAdmin ? lead.status : lead.badge_stage) === "Lost" && "status-lost",
                  )}>
                    {isAdmin ? lead.status : lead.badge_stage}
                  </span>
                </td>
                <td className="py-3 px-4 whitespace-nowrap text-muted-foreground text-xs">{lead.last_activity_at ? format(new Date(lead.last_activity_at), "MMM d, yyyy") : "—"}</td>
                {isAdmin && (
                  <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => {
                      if (confirm("Are you sure you want to delete this lead?")) {
                        deleteLead.mutate(lead.id);
                      }
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {leadsLoading && (
              <tr><td colSpan={12} className="py-8 text-center text-muted-foreground">Loading leads...</td></tr>
            )}
            {!leadsLoading && filteredLeads.length === 0 && (
              <tr><td colSpan={12} className="py-8 text-center text-muted-foreground">No leads found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
