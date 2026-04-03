import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { BookOpen, Upload, CheckCircle2, ChevronRight } from "lucide-react";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { queryKeys } from "@/lib/queryKeys";

export default function ItineraryDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Leads needing itineraries
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: queryKeys.allItineraryLeads(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, destination, status, itinerary_code")
        .in("status", ["Quoted", "Converted", "On Progress"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  // Latest itinerary per lead
  const { data: latestItineraries = [], isLoading: loadingItin } = useQuery({
    queryKey: ["itin-dash-latest"],
    queryFn: async () => {
      if (leads.length === 0) return [];
      const leadIds = leads.map((l: any) => l.id);
      const { data, error } = await supabase
        .from("itineraries")
        .select("lead_id, version, created_at, file_url, external_link")
        .in("lead_id", leadIds)
        .order("version", { ascending: false });
      if (error) throw error;
      const seen = new Set<string>();
      return (data ?? []).filter((i: any) => {
        if (seen.has(i.lead_id)) return false;
        seen.add(i.lead_id);
        return true;
      });
    },
    enabled: leads.length > 0,
    retry: 2,
  });

  // Recent uploads (last 5)
  const { data: recentUploads = [], isLoading: loadingRecent } = useQuery({
    queryKey: ["itin-dash-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itineraries")
        .select("*, leads(name, destination)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  const leadsWithItinerary = leads.filter((l: any) => latestItineraries.some((i: any) => i.lead_id === l.id));
  const leadsWithout = leads.filter((l: any) => !latestItineraries.some((i: any) => i.lead_id === l.id));
  const isLoading = loadingLeads || loadingItin || loadingRecent;

  const statusColor: Record<string, string> = {
    "On Progress": "bg-blue-100 text-blue-700",
    "Quoted": "bg-amber-100 text-amber-700",
    "Converted": "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={isLoading} />
      <div>
        <h1 className="text-2xl font-bold">Itinerary Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage trip itineraries</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-amber-100 dark:bg-amber-900/30 shrink-0">
              <Upload className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending Upload</p>
              <p className="text-2xl font-bold">{leadsWithout.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-green-100 dark:bg-green-900/30 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Itinerary Done</p>
              <p className="text-2xl font-bold">{leadsWithItinerary.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leads pending itinerary */}
      {leadsWithout.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-amber-600" /> Needs Itinerary
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/itineraries")}>
                View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {leadsWithout.slice(0, 6).map((lead: any) => (
              <div
                key={lead.id}
                className="flex items-center justify-between px-6 py-3 border-t hover:bg-muted/20 cursor-pointer transition-colors"
                onClick={() => navigate("/itineraries")}
              >
                <div>
                  <p className="font-medium text-sm">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">{lead.destination ?? "No destination"}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[lead.status] ?? ""}`}>
                  {lead.status}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent uploads */}
      {recentUploads.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Recent Uploads
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentUploads.map((itin: any) => (
              <div key={itin.id} className="flex items-center justify-between px-6 py-3 border-t">
                <div>
                  <p className="font-medium text-sm">{(itin.leads as any)?.name ?? "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">
                    Version {itin.version} · {itin.created_at ? format(new Date(itin.created_at), "MMM d, yyyy") : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs capitalize">{itin.file_type ?? "pdf"}</Badge>
                  {(itin.file_url || itin.external_link) && (
                    <a
                      href={itin.file_url ?? itin.external_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:underline"
                    >
                      Open
                    </a>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {leads.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No leads in Quoted or Converted status yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
