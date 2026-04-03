import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Search, BookOpen, ExternalLink, Upload, ChevronRight } from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ItinerariesPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadName, setSelectedLeadName] = useState("");

  // Leads eligible for itineraries: Quoted or Converted
  const { data: leads = [], isLoading } = useQuery({
    queryKey: queryKeys.allItineraryLeads(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, destination, status, itinerary_code, created_at")
        .in("status", ["Quoted", "Converted", "On Progress"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Get latest itinerary version per lead
  const { data: latestItineraries = [] } = useQuery({
    queryKey: ["latest-itineraries"],
    queryFn: async () => {
      if (leads.length === 0) return [];
      const leadIds = leads.map((l) => l.id);
      const { data, error } = await supabase
        .from("itineraries")
        .select("lead_id, version, created_at, file_url, external_link")
        .in("lead_id", leadIds)
        .order("version", { ascending: false });
      if (error) throw error;
      // Keep only latest version per lead
      const seen = new Set<string>();
      return (data ?? []).filter((i) => {
        if (seen.has(i.lead_id)) return false;
        seen.add(i.lead_id);
        return true;
      });
    },
    enabled: leads.length > 0,
  });

  const filteredLeads = leads.filter((l) =>
    !search ||
    l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.destination?.toLowerCase().includes(search.toLowerCase()) ||
    l.itinerary_code?.toLowerCase().includes(search.toLowerCase())
  );

  const getLatest = (leadId: string) => latestItineraries.find((i) => i.lead_id === leadId);

  const statusColor: Record<string, string> = {
    "On Progress": "bg-blue-100 text-blue-700 border-blue-200",
    "Quoted": "bg-amber-100 text-amber-700 border-amber-200",
    "Converted": "bg-green-100 text-green-700 border-green-200",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={isLoading} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> Itineraries
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""} need itineraries
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, destination..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Leads list */}
      {leads.length === 0 && !isLoading ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No leads in Quoted or Converted status yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredLeads.map((lead) => {
            const latest = getLatest(lead.id);
            return (
              <Card key={lead.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.destination || "No destination"}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${statusColor[lead.status] ?? ""}`}>
                      {lead.status}
                    </span>
                  </div>

                  {lead.itinerary_code && (
                    <p className="text-xs text-muted-foreground font-mono">{lead.itinerary_code}</p>
                  )}

                  {/* Itinerary status */}
                  {latest ? (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                      <div>
                        <p className="text-xs font-medium text-green-700 dark:text-green-400">
                          Version {latest.version} uploaded
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {latest.created_at ? format(new Date(latest.created_at), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {(latest.file_url || latest.external_link) && (
                          <a href={latest.file_url ?? latest.external_link ?? "#"} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                      <Upload className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-400">No itinerary uploaded yet</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={() => { setSelectedLeadId(lead.id); setSelectedLeadName(lead.name); }}
                    >
                      {latest ? "Manage" : "Upload"} Itinerary
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Itinerary Management Dialog */}
      <Dialog open={!!selectedLeadId} onOpenChange={(o) => { if (!o) setSelectedLeadId(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> {selectedLeadName}
            </DialogTitle>
          </DialogHeader>
          {selectedLeadId && <ItineraryTab leadId={selectedLeadId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
