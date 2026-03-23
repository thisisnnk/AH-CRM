import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Trash2, ExternalLink } from "lucide-react";

export default function ContactDetailPage() {
  const { id } = useParams();
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Edit state
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({
    name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "",
  });

  const { data: contact } = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id && !!user,
  });

  const { data: linkedLeads = [] } = useQuery({
    queryKey: ["contact-leads", id],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").eq("contact_id", id!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id && !!user,
  });

  // Update contact mutation
  const updateContact = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from("contacts").update(updates).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Contact updated" });
      queryClient.invalidateQueries({ queryKey: ["contact", id] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (err: any) => {
      toast({ title: "Error updating contact", description: err.message, variant: "destructive" });
    },
  });

  // Delete contact mutation (admin only) — must delete linked leads first
  const deleteContact = useMutation({
    mutationFn: async () => {
      // Delete all dependent records for each linked lead first
      if (linkedLeads.length > 0) {
        for (const lead of linkedLeads) {
          await (supabase as any).from("notifications").update({ lead_id: null }).eq("lead_id", lead.id);
          await supabase.from("tasks").delete().eq("lead_id", lead.id);
          await supabase.from("activity_logs").delete().eq("lead_id", lead.id);
          await supabase.from("revisions").delete().eq("lead_id", lead.id);
        }
        const { error: leadsErr } = await supabase
          .from("leads")
          .delete()
          .eq("contact_id", id!);
        if (leadsErr) throw leadsErr;
      }
      const { error } = await supabase.from("contacts").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Contact deleted" });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      navigate("/contacts");
    },
    onError: (err: any) => {
      toast({ title: "Error deleting contact", description: err.message, variant: "destructive" });
    },
  });

  // Edit handlers
  const startEditPersonal = () => {
    if (!contact) return;
    setPersonalForm({
      name: contact.name, phone: contact.phone,
      whatsapp: contact.whatsapp || "", email: contact.email || "",
      city: contact.city || "", state: contact.state || "", country: contact.country || "",
    });
    setIsEditingPersonal(true);
  };

  const savePersonal = () => {
    setIsSavingPersonal(true);
    updateContact.mutate(
      {
        name: personalForm.name, phone: personalForm.phone,
        whatsapp: personalForm.whatsapp || null, email: personalForm.email || null,
        city: personalForm.city || null, state: personalForm.state || null, country: personalForm.country || null,
      },
      {
        onSuccess: () => { setIsEditingPersonal(false); setIsSavingPersonal(false); },
        onError: () => setIsSavingPersonal(false),
      }
    );
  };

  if (!contact) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/contacts")}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
        {isAdmin && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              const msg = linkedLeads.length > 0
                ? `This contact has ${linkedLeads.length} linked lead(s). Deleting will also remove those leads. Are you sure?`
                : "Are you sure you want to delete this contact?";
              if (confirm(msg)) deleteContact.mutate();
            }}
            disabled={deleteContact.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1" /> {deleteContact.isPending ? "Deleting..." : "Delete Contact"}
          </Button>
        )}
      </div>

      {/* Header with name */}
      <Card>
        <CardHeader>
          <CardTitle>{contact.name}</CardTitle>
        </CardHeader>
      </Card>

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
            <Label className="text-muted-foreground text-xs">Contact ID</Label>
            <p className="mt-1 text-sm font-medium">{contact.contact_id}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Name</Label>
            {isEditingPersonal ? <Input value={personalForm.name} onChange={(e) => setPersonalForm({ ...personalForm, name: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{contact.name || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Phone</Label>
            {isEditingPersonal ? <Input value={personalForm.phone} onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{contact.phone || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">WhatsApp</Label>
            {isEditingPersonal ? <Input value={personalForm.whatsapp} onChange={(e) => setPersonalForm({ ...personalForm, whatsapp: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{contact.whatsapp || "—"}</p>}
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">Email</Label>
            {isEditingPersonal ? <Input value={personalForm.email} onChange={(e) => setPersonalForm({ ...personalForm, email: e.target.value })} className="h-8 mt-1" /> : <p className="mt-1 text-sm">{contact.email || "—"}</p>}
          </div>
          <div className="col-span-1 md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-muted-foreground text-xs">City</Label>
              {isEditingPersonal ? <Input value={personalForm.city} onChange={(e) => setPersonalForm({ ...personalForm, city: e.target.value })} className="h-8 mt-1" placeholder="City" /> : <p className="mt-1 text-sm">{contact.city || "—"}</p>}
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">State</Label>
              {isEditingPersonal ? <Input value={personalForm.state} onChange={(e) => setPersonalForm({ ...personalForm, state: e.target.value })} className="h-8 mt-1" placeholder="State" /> : <p className="mt-1 text-sm">{contact.state || "—"}</p>}
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Country</Label>
              {isEditingPersonal ? <Input value={personalForm.country} onChange={(e) => setPersonalForm({ ...personalForm, country: e.target.value })} className="h-8 mt-1" placeholder="Country" /> : <p className="mt-1 text-sm">{contact.country || "—"}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trip History — Table Layout */}
      <Card>
        <CardHeader><CardTitle>Trip History ({linkedLeads.length} trips)</CardTitle></CardHeader>
        <CardContent>
          {linkedLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trips linked yet</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm" style={{ minWidth: "500px" }}>
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-3 px-4">Itinerary Code</th>
                    <th className="text-left py-3 px-4">Destination</th>
                    <th className="text-left py-3 px-4">Duration</th>
                    <th className="text-left py-3 px-4">Pax</th>
                    <th className="text-right py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {linkedLeads.map((lead) => (
                    <tr key={lead.id} className="border-b hover:bg-muted/30">
                      <td className="py-3 px-4 font-medium">{lead.itinerary_code || "—"}</td>
                      <td className="py-3 px-4">{lead.destination || "—"}</td>
                      <td className="py-3 px-4">{lead.trip_duration || "—"}</td>
                      <td className="py-3 px-4">{lead.travelers ?? "—"}</td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/leads/${lead.id}`)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" /> See Full Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
