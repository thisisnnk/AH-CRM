import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Mail, MapPin, ExternalLink } from "lucide-react";
import { format } from "date-fns";

export default function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: contact } = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: linkedLeads = [] } = useQuery({
    queryKey: ["contact-leads", id],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").eq("contact_id", id!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  if (!contact) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/contacts")}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {contact.name}
            <span className="text-sm font-mono text-muted-foreground">{contact.contact_id}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{contact.phone}</div>
          {contact.whatsapp && (
            <a href={`https://wa.me/${contact.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" className="flex items-center gap-2 text-success hover:underline">
              <ExternalLink className="h-4 w-4" />WhatsApp: {contact.whatsapp}
            </a>
          )}
          {contact.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{contact.email}</div>}
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{[contact.city, contact.state, contact.country].filter(Boolean).join(", ") || "—"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Trip History ({linkedLeads.length} trips)</CardTitle></CardHeader>
        <CardContent>
          {linkedLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trips linked yet</p>
          ) : (
            <div className="space-y-3">
              {linkedLeads.map((lead) => (
                <div key={lead.id} className="p-4 rounded-lg border hover:shadow-sm cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                  <div className="flex justify-between">
                    <div>
                      <p className="font-medium">{lead.destination ?? "Unknown destination"}</p>
                      <p className="text-sm text-muted-foreground">{lead.travelers} travelers · {lead.trip_duration ?? "—"}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10">{lead.status}</span>
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(lead.enquiry_date!), "MMM d, yyyy")}</p>
                    </div>
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
