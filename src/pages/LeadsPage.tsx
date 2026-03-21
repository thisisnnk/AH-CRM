import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { CalendarIcon, Download, Filter, Inbox, Plus, Search, Trash2 } from "lucide-react";
import { exportToExcel } from "@/utils/exportExcel";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format, subDays, endOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { sendNotification } from "@/utils/notificationHelper";
import { PhoneInput, isPhoneValid } from "@/components/PhoneInput";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { Skeleton } from "@/components/ui/skeleton";

const sourceOptions = ["Instagram", "Website", "Referral", "Office Direct Lead"] as const;

const normalizePhone = (phone: string) => phone.replace(/\D/g, "").slice(-10);

export default function LeadsPage() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = role === "admin";

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [filterSources, setFilterSources] = useState<string[]>([]);
  const [filterAssignedTos, setFilterAssignedTos] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [assignMap, setAssignMap] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 90));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [newLead, setNewLead] = useState({
    name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "",
    destination: "", travelers: "", trip_duration: "", lead_source: "", assigned_employee_id: "",
  });
  const [phoneDialCode, setPhoneDialCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [waDialCode, setWaDialCode] = useState("+91");
  const [waNumber, setWaNumber] = useState("");
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [existingContact, setExistingContact] = useState<any | null>(null);
  const [existingTripCount, setExistingTripCount] = useState(0);
  const [phoneCheckLoading, setPhoneCheckLoading] = useState(false);

  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["leads", format(fromDate, "yyyy-MM-dd"), format(toDate, "yyyy-MM-dd"), user?.id, role],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("id,client_id,enquiry_date,lead_source,itinerary_code,name,phone,destination,trip_duration,assigned_employee_id,travelers,status,badge_stage,last_activity_at,created_at,travel_date,budget")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", endOfDay(toDate).toISOString())
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
      return data ?? [];
    },
    enabled: !!user,
    placeholderData: keepPreviousData,
    retry: 2,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, name").eq("is_active", true);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: incomingLeads = [] } = useQuery({
    queryKey: ["incoming-leads"],
    queryFn: async () => {
      const { data } = await supabase.from("incoming_leads").select("*").eq("status", "Pending").order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: isAdmin,
  });

  // Generate client ID in AH-YYYY-MM-NNNN format
  const generateClientId = async (): Promise<string> => {
    const now = new Date();
    const yr = now.getFullYear().toString();
    const mo = (now.getMonth() + 1).toString().padStart(2, "0");
    const prefix = `AH-${yr}-${mo}-`;

    try {
      const { data: rpcId, error: rpcErr } = await supabase.rpc("generate_client_id");
      if (!rpcErr && rpcId) return rpcId;
    } catch {
      // RPC not available, generate client-side
    }

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

  const fullPhone = phoneDialCode + phoneNumber;
  const fullWa = waNumber ? waDialCode + waNumber : "";

  const handlePhoneNumberChange = async (value: string) => {
    setPhoneNumber(value);
    const normalized = normalizePhone(phoneDialCode + value);
    if (normalized.length === 10) {
      setPhoneCheckLoading(true);
      const { data: contact } = await supabase
        .from("contacts")
        .select("*")
        .ilike("phone", `%${normalized}`)
        .maybeSingle();
      if (contact) {
        setExistingContact(contact);
        const { count } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("contact_id", contact.id);
        setExistingTripCount(count ?? 0);
      } else {
        setExistingContact(null);
        setExistingTripCount(0);
      }
      setPhoneCheckLoading(false);
    } else {
      setExistingContact(null);
      setExistingTripCount(0);
    }
  };

  const createLead = useMutation({
    mutationFn: async (): Promise<{ isExistingClient: boolean }> => {
      const normalizedPhone = normalizePhone(fullPhone);

      // Check if a contact with this phone already exists
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("*")
        .ilike("phone", `%${normalizedPhone}`)
        .maybeSingle();

      let contactId: string;
      let contactDbId: string;
      let contactName: string;
      let contactPhone: string;
      let contactWhatsapp: string | null;
      let contactEmail: string | null;
      let contactCity: string | null;
      let contactState: string | null;
      let contactCountry: string | null;

      if (existingContact) {
        // Reuse existing contact — do NOT create a duplicate
        contactId = existingContact.contact_id;
        contactDbId = existingContact.id;
        contactName = existingContact.name;
        contactPhone = existingContact.phone;
        contactWhatsapp = existingContact.whatsapp;
        contactEmail = existingContact.email;
        contactCity = existingContact.city;
        contactState = existingContact.state;
        contactCountry = existingContact.country;
      } else {
        // New contact — generate ID and insert
        const clientId = await generateClientId();
        const { data: contactData, error: contactErr } = await supabase
          .from("contacts")
          .insert({
            contact_id: clientId,
            name: newLead.name,
            phone: fullPhone,
            whatsapp: fullWa || null,
            email: newLead.email || null,
            city: newLead.city || null,
            state: newLead.state || null,
            country: newLead.country || null,
          })
          .select()
          .single();
        if (contactErr) throw contactErr;
        contactId = clientId;
        contactDbId = contactData.id;
        contactName = newLead.name;
        contactPhone = fullPhone;
        contactWhatsapp = fullWa || null;
        contactEmail = newLead.email || null;
        contactCity = newLead.city || null;
        contactState = newLead.state || null;
        contactCountry = newLead.country || null;
      }

      const { error: leadErr } = await supabase.from("leads").insert({
        client_id: contactId,
        contact_id: contactDbId,
        name: contactName,
        phone: contactPhone,
        whatsapp: contactWhatsapp,
        email: contactEmail,
        city: contactCity,
        state: contactState,
        country: contactCountry,
        destination: newLead.destination || null,
        travelers: newLead.travelers ? parseInt(newLead.travelers) : null,
        trip_duration: newLead.trip_duration || null,
        lead_source: newLead.lead_source,
        assigned_employee_id: newLead.assigned_employee_id,
      });
      if (leadErr) throw leadErr;

      if (newLead.assigned_employee_id) {
        await sendNotification({
          recipientId: newLead.assigned_employee_id,
          type: "lead_assigned",
          message: `New lead "${contactName}" has been assigned to you`,
          leadId: undefined,
        });
      }

      return { isExistingClient: !!existingContact };
    },
    onSuccess: ({ isExistingClient }) => {
      toast({
        title: "Trip created",
        description: isExistingClient
          ? "Existing client found. New trip created."
          : "New contact and trip created successfully.",
      });
      setCreateOpen(false);
      setNewLead({ name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "", destination: "", travelers: "", trip_duration: "", lead_source: "", assigned_employee_id: "" });
      setPhoneDialCode("+91"); setPhoneNumber("");
      setWaDialCode("+91"); setWaNumber("");
      setExistingContact(null); setExistingTripCount(0);
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

      const { data: leadData } = await supabase.from("leads").select("name").eq("id", id).single();
      const leadName = leadData?.name ?? "a lead";

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

  const assignIncoming = useMutation({
    mutationFn: async ({ incomingId, employeeId, name, phone }: { incomingId: string; employeeId: string; name: string; phone: string }) => {
      const { error: leadErr } = await supabase.from("leads").insert({
        name,
        phone,
        assigned_employee_id: employeeId,
        lead_source: "Telegram Bot",
      });
      if (leadErr) throw leadErr;

      const { error: updateErr } = await supabase.from("incoming_leads").update({ status: "Assigned" }).eq("id", incomingId);
      if (updateErr) throw updateErr;

      await sendNotification({
        recipientId: employeeId,
        type: "lead_assigned",
        message: `New lead "${name}" has been assigned to you`,
      });
    },
    onSuccess: () => {
      toast({ title: "Lead assigned" });
      queryClient.invalidateQueries({ queryKey: ["incoming-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: any) => {
      console.error("Assign incoming lead error:", err);
      toast({ title: "Error assigning lead", description: err.message, variant: "destructive" });
    },
  });

  const statusKeys = isAdmin ? ["Open", "On Progress", "Converted", "Lost"] : ["Open", "Follow Up", "Converted", "Lost"];

  const filteredLeads = leads.filter((l) => {
    if (filter !== "all") {
      if (isAdmin && l.status !== filter) return false;
      if (!isAdmin && l.badge_stage !== filter) return false;
    }
    if (filterSources.length > 0 && !filterSources.includes(l.lead_source ?? "")) return false;
    if (filterAssignedTos.length > 0 && !filterAssignedTos.includes(l.assigned_employee_id ?? "")) return false;
    if (filterStatuses.length > 0 && !filterStatuses.includes((isAdmin ? l.status : l.badge_stage) ?? "")) return false;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      const matches =
        (l.name ?? "").toLowerCase().includes(s) ||
        (l.phone ?? "").toLowerCase().includes(s) ||
        (l.destination ?? "").toLowerCase().includes(s) ||
        (l.lead_source ?? "").toLowerCase().includes(s) ||
        (l.itinerary_code ?? "").toLowerCase().includes(s) ||
        (l.client_id ?? "").toLowerCase().includes(s);
      if (!matches) return false;
    }
    return true;
  });

  const leadsForSource = leads.filter((l) => {
    if (filterAssignedTos.length > 0 && !filterAssignedTos.includes(l.assigned_employee_id ?? "")) return false;
    if (filterStatuses.length > 0 && !filterStatuses.includes((isAdmin ? l.status : l.badge_stage) ?? "")) return false;
    return true;
  });
  const leadsForAssigned = leads.filter((l) => {
    if (filterSources.length > 0 && !filterSources.includes(l.lead_source ?? "")) return false;
    if (filterStatuses.length > 0 && !filterStatuses.includes((isAdmin ? l.status : l.badge_stage) ?? "")) return false;
    return true;
  });
  const leadsForStatus = leads.filter((l) => {
    if (filterSources.length > 0 && !filterSources.includes(l.lead_source ?? "")) return false;
    if (filterAssignedTos.length > 0 && !filterAssignedTos.includes(l.assigned_employee_id ?? "")) return false;
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

  const handleExport = () => {
    const rows = filteredLeads.map((l) => ({
      "Enquiry Date": l.enquiry_date ? format(new Date(l.enquiry_date), "MMM d, yyyy") : "",
      "Source": l.lead_source ?? "",
      "Itinerary Code": l.itinerary_code ?? "",
      "Client ID": l.client_id ?? "",
      "Name": l.name,
      "Phone": l.phone,
      "WhatsApp": l.whatsapp ?? "",
      "Email": l.email ?? "",
      "City": l.city ?? "",
      "State": l.state ?? "",
      "Country": l.country ?? "",
      "Destination": l.destination ?? "",
      "Duration": l.trip_duration ?? "",
      "Travel Date": l.travel_date ? format(new Date(l.travel_date), "MMM d, yyyy") : "",
      "Budget": l.budget ?? "",
      "Assigned To": employees.find((e) => e.user_id === l.assigned_employee_id)?.name ?? "",
      "Pax": l.travelers ?? "",
      "Status": isAdmin ? (l.status ?? "") : (l.badge_stage ?? ""),
      "Last Activity": l.last_activity_at ? format(new Date(l.last_activity_at), "MMM d, yyyy") : "",
    }));
    exportToExcel(
      rows,
      `leads-${format(fromDate, "yyyy-MM-dd")}-to-${format(toDate, "yyyy-MM-dd")}`,
      "Leads"
    );
  };

  return (
    <>
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={leadsLoading} />
      {/* Header row: Title + Incoming Leads tab + New Lead button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Leads</h1>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant={inboxOpen ? "default" : "outline"}
              size="sm"
              onClick={() => setInboxOpen(!inboxOpen)}
            >
              <Inbox className="h-4 w-4 mr-1" />
              Incoming Leads
              {incomingLeads.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-semibold px-1.5 min-w-[20px] h-5 leading-none">
                  {incomingLeads.length}
                </span>
              )}
            </Button>
            <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setExistingContact(null); setExistingTripCount(0); } }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Lead</Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Create Lead</DialogTitle></DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-1 sm:col-span-2"><Label>Name</Label><Input value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} /></div>
                  <div className="col-span-1 sm:col-span-2">
                    <PhoneInput
                      label="Phone" required
                      dialCode={phoneDialCode} number={phoneNumber}
                      onDialCodeChange={setPhoneDialCode}
                      onNumberChange={handlePhoneNumberChange}
                    />
                    {phoneCheckLoading && (
                      <p className="text-xs text-muted-foreground mt-1">Checking client...</p>
                    )}
                    {existingContact && (
                      <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm">
                        <p className="font-semibold text-amber-800">
                          Existing client: {existingContact.name}
                          {existingTripCount > 0 && (
                            <span className="font-normal text-amber-700"> · {existingTripCount} trip{existingTripCount !== 1 ? "s" : ""}</span>
                          )}
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          Fill in Source &amp; Assign To below, then click "Create New Trip".
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 text-xs h-7 border-amber-400 text-amber-800 hover:bg-amber-100"
                          onClick={() => { setCreateOpen(false); navigate("/contacts"); }}
                        >
                          View Client
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <PhoneInput
                      label="WhatsApp"
                      dialCode={waDialCode} number={waNumber}
                      onDialCodeChange={setWaDialCode}
                      onNumberChange={setWaNumber}
                    />
                  </div>
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
                <Button className="w-full mt-4" onClick={() => createLead.mutate()} disabled={!isPhoneValid(phoneDialCode, phoneNumber) || !newLead.lead_source || !newLead.assigned_employee_id || createLead.isPending || (waNumber.length > 0 && !isPhoneValid(waDialCode, waNumber))}>
                  {createLead.isPending ? "Creating..." : existingContact ? "Create New Trip" : "Create Lead"}
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Separate From / To date pickers */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-medium">From</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(fromDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={(d) => { if (d) setFromDate(d); }}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-medium">To</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(toDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={(d) => { if (d) setToDate(d); }}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredLeads.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>

      {/* Badge Pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        <button onClick={() => setFilter("all")} className={cn("badge-pill inline-flex items-center gap-1.5", filter === "all" ? "badge-pill-active" : "badge-pill-inactive")}>
          All
          <span className={cn("inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 min-w-[20px] h-5 leading-none bg-black", filter === "all" ? "text-primary" : "text-white")}>
            {filteredLeads.length}
          </span>
        </button>
        {badgeKeys.map((key, i) => (
          <button key={key} onClick={() => setFilter(key)} className={cn("badge-pill inline-flex items-center gap-1.5", filter === key ? "badge-pill-active" : "badge-pill-inactive")}>
            {badgeIcons[i]} {key}
            <span className={cn("inline-flex items-center justify-center rounded-full text-xs font-semibold px-1.5 min-w-[20px] h-5 leading-none bg-black", filter === key ? "text-primary" : "text-white")}>
              {badgeCounts[key as keyof typeof badgeCounts]}
            </span>
          </button>
        ))}
      </div>

      {/* Incoming Leads Inbox panel (admin only, toggled) */}
      {isAdmin && inboxOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" /> Incoming Leads Inbox</CardTitle>
          </CardHeader>
          <CardContent>
            {incomingLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending incoming leads</p>
            ) : (
              <div className="space-y-3">
                {incomingLeads.map((il) => (
                  <div key={il.id} className="p-4 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{il.name}</p>
                      <p className="text-sm text-muted-foreground">{il.phone} · {il.source}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(il.created_at!), "MMM d, yyyy HH:mm")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={assignMap[il.id] ?? ""} onValueChange={(v) => setAssignMap({ ...assignMap, [il.id]: v })}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="Assign to" /></SelectTrigger>
                        <SelectContent>{employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!assignMap[il.id]}
                        onClick={() => assignIncoming.mutate({ incomingId: il.id, employeeId: assignMap[il.id], name: il.name, phone: il.phone })}
                      >
                        Assign
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-lg border" style={{ maxHeight: "70vh" }}>
        <table className="w-full text-sm" style={{ minWidth: "1600px" }}>
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[160px]">Enquiry Date</th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[160px]">
                <span className="inline-flex items-center gap-1">
                  Source
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn("inline-flex items-center justify-center rounded p-0.5 hover:bg-black/10", filterSources.length > 0 ? "text-primary" : "text-muted-foreground")} onClick={(e) => e.stopPropagation()}>
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-2" align="start" onClick={(e) => e.stopPropagation()}>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by Source</p>
                      <div className="space-y-0.5">
                        {(["Instagram", "Website", "Referral", "Office Direct Lead"] as const).map((src) => (
                          <label key={src} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm font-normal">
                            <Checkbox checked={filterSources.includes(src)} onCheckedChange={(checked) => setFilterSources(checked ? [...filterSources, src] : filterSources.filter((v) => v !== src))} />
                            <span className="flex-1">{src}</span>
                            <span className="text-muted-foreground text-xs">{leadsForSource.filter((l) => l.lead_source === src).length}</span>
                          </label>
                        ))}
                      </div>
                      {filterSources.length > 0 && <button onClick={() => setFilterSources([])} className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t">Clear</button>}
                    </PopoverContent>
                  </Popover>
                </span>
              </th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[200px]">Itinerary Code</th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[160px]">Name</th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[160px]">Phone</th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[180px]">Destination</th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[200px]">Duration</th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[160px]">Travel Date</th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[140px]">Budget</th>
              {isAdmin && (
                <th className="text-center py-3 px-6 whitespace-nowrap min-w-[180px]">
                  <span className="inline-flex items-center gap-1">
                    Assigned To
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className={cn("inline-flex items-center justify-center rounded p-0.5 hover:bg-black/10", filterAssignedTos.length > 0 ? "text-primary" : "text-muted-foreground")} onClick={(e) => e.stopPropagation()}>
                          <Filter className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
                        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by Assigned To</p>
                        <div className="space-y-0.5">
                          {employees.map((emp) => (
                            <label key={emp.user_id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm font-normal">
                              <Checkbox checked={filterAssignedTos.includes(emp.user_id)} onCheckedChange={(checked) => setFilterAssignedTos(checked ? [...filterAssignedTos, emp.user_id] : filterAssignedTos.filter((v) => v !== emp.user_id))} />
                              <span className="flex-1">{emp.name}</span>
                              <span className="text-muted-foreground text-xs">{leadsForAssigned.filter((l) => l.assigned_employee_id === emp.user_id).length}</span>
                            </label>
                          ))}
                        </div>
                        {filterAssignedTos.length > 0 && <button onClick={() => setFilterAssignedTos([])} className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t">Clear</button>}
                      </PopoverContent>
                    </Popover>
                  </span>
                </th>
              )}
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[100px]">Pax</th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[130px]">
                <span className="inline-flex items-center gap-1">
                  Status
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn("inline-flex items-center justify-center rounded p-0.5 hover:bg-black/10", filterStatuses.length > 0 ? "text-primary" : "text-muted-foreground")} onClick={(e) => e.stopPropagation()}>
                        <Filter className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2" align="start" onClick={(e) => e.stopPropagation()}>
                      <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Filter by Status</p>
                      <div className="space-y-0.5">
                        {statusKeys.map((st) => (
                          <label key={st} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer text-sm font-normal">
                            <Checkbox checked={filterStatuses.includes(st)} onCheckedChange={(checked) => setFilterStatuses(checked ? [...filterStatuses, st] : filterStatuses.filter((v) => v !== st))} />
                            <span className="flex-1">{st}</span>
                            <span className="text-muted-foreground text-xs">{leadsForStatus.filter((l) => (isAdmin ? l.status : l.badge_stage) === st).length}</span>
                          </label>
                        ))}
                      </div>
                      {filterStatuses.length > 0 && <button onClick={() => setFilterStatuses([])} className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 border-t">Clear</button>}
                    </PopoverContent>
                  </Popover>
                </span>
              </th>
              <th className="text-center py-3 px-6 whitespace-nowrap min-w-[160px]">Last Activity</th>
              {isAdmin && <th className="text-center py-3 px-6 min-w-[60px]"></th>}
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr key={lead.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => { queryClient.setQueryData(["lead", lead.id], (old: any) => old ?? lead); navigate(`/leads/${lead.id}`); }}>
                <td className="py-3 px-6 whitespace-nowrap">{lead.enquiry_date ? format(new Date(lead.enquiry_date), "MMM d, yyyy") : "—"}</td>
                <td className="py-3 px-6 whitespace-nowrap">{lead.lead_source ?? "—"}</td>
                <td className="py-3 px-6 whitespace-nowrap">{lead.itinerary_code ?? "—"}</td>
                <td className="py-3 px-6 font-medium whitespace-nowrap">{lead.name}</td>
                <td className="py-3 px-6 whitespace-nowrap">{lead.phone}</td>
                <td className="py-3 px-6 whitespace-nowrap">{lead.destination ?? "—"}</td>
                <td className="py-3 px-6 whitespace-nowrap">{lead.trip_duration ?? "—"}</td>
                <td className="py-3 px-6 whitespace-nowrap">{lead.travel_date ? format(new Date(lead.travel_date), "MMM d, yyyy") : "—"}</td>
                <td className="py-3 px-6 whitespace-nowrap">{lead.budget ?? "—"}</td>
                {isAdmin && (
                  <td className="py-3 px-6 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={lead.assigned_employee_id ?? ""}
                      onValueChange={(v) => reassignLead.mutate({ id: lead.id, employeeId: v })}
                    >
                      <SelectTrigger className="h-8 text-xs w-36">
                        <SelectValue>{employees.find((e) => e.user_id === lead.assigned_employee_id)?.name ?? "Unassigned"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                )}
                <td className="py-3 px-6 whitespace-nowrap">{lead.travelers ?? "—"}</td>
                <td className="py-3 px-6 whitespace-nowrap">
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
                <td className="py-3 px-6 whitespace-nowrap text-muted-foreground text-xs">{lead.last_activity_at ? format(new Date(lead.last_activity_at), "MMM d, yyyy") : "—"}</td>
                {isAdmin && (
                  <td className="py-3 px-6 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setLeadToDelete(lead.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {leadsLoading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={`skel-${i}`} className="border-b">
                {Array.from({ length: isAdmin ? 11 : 10 }).map((_, j) => (
                  <td key={j} className="py-3 px-6"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!leadsLoading && filteredLeads.length === 0 && (
              <tr><td colSpan={12} className="py-8 text-center text-muted-foreground">No leads found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    <AlertDialog open={!!leadToDelete} onOpenChange={() => setLeadToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Trip?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this trip? All associated tasks, activity logs, and revisions will also be removed. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (leadToDelete) {
                deleteLead.mutate(leadToDelete);
                setLeadToDelete(null);
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
