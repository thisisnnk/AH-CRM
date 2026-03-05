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
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

const statusOptions = ["Open", "On Progress", "Lost", "Converted"] as const;
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

  const { data: leads = [] } = useQuery({
    queryKey: ["leads", filter, dateRange, user?.id, role],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*, profiles:assigned_employee_id(name)")
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .order("created_at", { ascending: false });

      if (!isAdmin && user) {
        query = query.eq("assigned_employee_id", user.id);
      }

      const { data } = await query;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
      return data ?? [];
    },
  });

  const createLead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").insert({
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
        lead_source: newLead.lead_source || null,
        assigned_employee_id: newLead.assigned_employee_id || user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Lead created" });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from("leads").update({ status }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const reassignLead = useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
      await supabase.from("leads").update({ assigned_employee_id: employeeId }).eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead reassigned" });
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
                    <Label>Source</Label>
                    <Select value={newLead.lead_source} onValueChange={(v) => setNewLead({ ...newLead, lead_source: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{sourceOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Assign To</Label>
                    <Select value={newLead.assigned_employee_id} onValueChange={(v) => setNewLead({ ...newLead, assigned_employee_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full mt-4" onClick={() => createLead.mutate()} disabled={!newLead.name || !newLead.phone || createLead.isPending}>
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
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {isAdmin && <th className="text-left py-3 px-4">Client ID</th>}
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Phone</th>
              <th className="text-left py-3 px-4">Destination</th>
              <th className="text-left py-3 px-4">Pax</th>
              {isAdmin && <th className="text-left py-3 px-4">Employee</th>}
              {!isAdmin && <th className="text-left py-3 px-4">Itinerary Code</th>}
              {!isAdmin && <th className="text-left py-3 px-4">Duration</th>}
              <th className="text-left py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr key={lead.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                {isAdmin && <td className="py-3 px-4 text-muted-foreground">{lead.client_id ?? "—"}</td>}
                <td className="py-3 px-4 font-medium">{lead.name}</td>
                <td className="py-3 px-4">{lead.phone}</td>
                <td className="py-3 px-4">{lead.destination ?? "—"}</td>
                <td className="py-3 px-4">{lead.travelers ?? "—"}</td>
                {isAdmin && (
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={lead.assigned_employee_id ?? ""}
                      onValueChange={(v) => reassignLead.mutate({ id: lead.id, employeeId: v })}
                    >
                      <SelectTrigger className="h-8 text-xs w-32">
                        <SelectValue>{(lead as any).profiles?.name ?? "Unassigned"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                )}
                {!isAdmin && <td className="py-3 px-4">{lead.itinerary_code ?? "—"}</td>}
                {!isAdmin && <td className="py-3 px-4">{lead.trip_duration ?? "—"}</td>}
                <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  {isAdmin ? (
                    <Select value={lead.status ?? "Open"} onValueChange={(v) => updateStatus.mutate({ id: lead.id, status: v })}>
                      <SelectTrigger className="h-8 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium",
                      lead.badge_stage === "Open" && "status-open",
                      lead.badge_stage === "Follow Up" && "status-ongoing",
                      lead.badge_stage === "Converted" && "status-converted",
                      lead.badge_stage === "Lost" && "status-lost",
                    )}>
                      {lead.badge_stage}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filteredLeads.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No leads found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
