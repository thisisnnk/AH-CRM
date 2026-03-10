import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Download, Plus, Search, MapPin, Mail, Phone, Calendar as CalendarIcon, ExternalLink, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { exportToExcel } from "@/utils/exportExcel";
import { PhoneInput, isPhoneValid } from "@/components/PhoneInput";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContactsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", whatsapp: "", email: "", city: "", state: "", country: "" });
  const [phoneDialCode, setPhoneDialCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [waDialCode, setWaDialCode] = useState("+91");
  const [waNumber, setWaNumber] = useState("");

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts", page, search],
    queryFn: async () => {
      let query = supabase
        .from("contacts")
        .select("id,contact_id,name,phone,email,city,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search.trim()) {
        const s = search.trim();
        query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,contact_id.ilike.%${s}%`);
      }

      const { data, error, count } = await query;
      if (error) {
        console.error("Contacts fetch error:", error);
        toast({ title: "Error loading contacts", description: error.message, variant: "destructive" });
        return { contacts: [], total: 0 };
      }
      return { contacts: data ?? [], total: count ?? 0 };
    },
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
    retry: 2,
  });

  const contacts = contactsData?.contacts ?? [];
  const totalCount = contactsData?.total ?? 0;

  const fullPhone = phoneDialCode + phoneNumber;
  const fullWa = waNumber ? waDialCode + waNumber : "";

  const createContact = useMutation({
    mutationFn: async () => {
      const { data: contactId, error: rpcError } = await supabase.rpc("generate_client_id");
      if (rpcError) throw rpcError;
      const { error } = await supabase.from("contacts").insert({
        contact_id: contactId,
        name: form.name,
        phone: fullPhone,
        whatsapp: fullWa || null,
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
      setPhoneDialCode("+91"); setPhoneNumber("");
      setWaDialCode("+91"); setWaNumber("");
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (err: any) => {
      console.error("Create contact error:", err);
      toast({ title: "Error creating contact", description: err.message, variant: "destructive" });
    },
  });



  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleExport = () => {
    const rows = contacts.map((c) => ({
      "Contact ID": c.contact_id,
      "Name": c.name,
      "Phone": c.phone,
      "WhatsApp": c.whatsapp ?? "",
      "Email": c.email ?? "",
      "City": c.city ?? "",
      "State": c.state ?? "",
      "Country": c.country ?? "",
    }));
    exportToExcel(rows, `contacts-export-${new Date().toISOString().slice(0, 10)}`, "Contacts");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={contactsLoading} />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={contacts.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          {isAdmin && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1" /> New Contact</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Contact</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <PhoneInput
                    label="Phone" required
                    dialCode={phoneDialCode} number={phoneNumber}
                    onDialCodeChange={setPhoneDialCode}
                    onNumberChange={setPhoneNumber}
                  />
                  <PhoneInput
                    label="WhatsApp"
                    dialCode={waDialCode} number={waNumber}
                    onDialCodeChange={setWaDialCode}
                    onNumberChange={setWaNumber}
                  />
                  <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                  <div><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
                  <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
                  <Button className="w-full" onClick={() => createContact.mutate()} disabled={!form.name || !isPhoneValid(phoneDialCode, phoneNumber) || createContact.isPending || (waNumber.length > 0 && !isPhoneValid(waDialCode, waNumber))}>
                    Create Contact
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search contacts..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left py-3 px-4">Contact ID</th>
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Phone</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                <td className="py-3 px-4 font-medium">{c.contact_id}</td>
                <td className="py-3 px-4 font-medium">{c.name}</td>
                <td className="py-3 px-4">{c.phone}</td>
              </tr>
            ))}
            {contactsLoading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={`skel-${i}`} className="border-b">
                {Array.from({ length: 3 }).map((_, j) => (
                  <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!contactsLoading && totalCount === 0 && (
              <tr><td colSpan={3} className="py-8 text-center text-muted-foreground">No contacts found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
          <span>{totalCount} contacts · page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-muted"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-muted"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
