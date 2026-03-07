import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ContactsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "" });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });
      if (error) {
        console.error("Contacts fetch error:", error);
        toast({ title: "Error loading contacts", description: error.message, variant: "destructive" });
        return [];
      }
      return data ?? [];
    },
  });

  const createContact = useMutation({
    mutationFn: async () => {
      const { data: contactId, error: rpcError } = await supabase.rpc("generate_contact_id");
      if (rpcError) throw rpcError;
      const { error } = await supabase.from("contacts").insert({
        contact_id: contactId,
        name: form.name,
        phone: form.phone,
        whatsapp: form.whatsapp || null,
        email: form.email || null,
        city: form.city || null,
        state: form.state || null,
        country: form.country || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Contact created" });
      setCreateOpen(false);
      setForm({ name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "" });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (err: any) => {
      console.error("Create contact error:", err);
      toast({ title: "Error creating contact", description: err.message, variant: "destructive" });
    },
  });

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.name.toLowerCase().includes(s) || c.phone.includes(s) || c.contact_id.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Contacts</h1>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New Contact</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Contact</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
                <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
                <Button className="w-full" onClick={() => createContact.mutate()} disabled={!form.name || !form.phone || createContact.isPending}>
                  Create Contact
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left py-3 px-4">Contact ID</th>
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Phone</th>
              <th className="text-left py-3 px-4">Email</th>
              <th className="text-left py-3 px-4">City</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                <td className="py-3 px-4 font-mono text-xs">{c.contact_id}</td>
                <td className="py-3 px-4 font-medium">{c.name}</td>
                <td className="py-3 px-4">{c.phone}</td>
                <td className="py-3 px-4">{c.email ?? "—"}</td>
                <td className="py-3 px-4">{c.city ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No contacts found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
