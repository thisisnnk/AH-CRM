import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { uploadToR2 } from "@/utils/uploadToR2";
import { logActivity } from "@/utils/activityLogger";
import { format } from "date-fns";
import { Plus, ExternalLink, FileText, Loader2, Upload } from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";

interface Props {
  leadId: string;
}

export function ItineraryTab({ leadId }: Props) {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const canUpload = role === "admin" || role === "itinerary";

  const [open, setOpen] = useState(false);
  const [fileType, setFileType] = useState<"pdf" | "url" | "design">("pdf");
  const [externalLink, setExternalLink] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: versions = [], isLoading } = useQuery({
    queryKey: queryKeys.itineraries(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itineraries")
        .select("*")
        .eq("lead_id", leadId)
        .order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!leadId && !!user,
  });

  const handleFileSelect = async (f: File) => {
    setFile(f);
    setFileUrl(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      const url = await uploadToR2(f, "itineraries", setUploadProgress);
      setFileUrl(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setFile(null);
    }
    setUploading(false);
  };

  const submitItinerary = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const nextVersion = (versions[0]?.version ?? 0) + 1;
      const { error } = await supabase.from("itineraries").insert({
        lead_id: leadId,
        version: nextVersion,
        file_url: fileType !== "url" ? (fileUrl ?? null) : null,
        file_type: fileType,
        external_link: fileType === "url" ? (externalLink || null) : null,
        notes: notes || null,
        created_by: user.id,
      });
      if (error) throw error;
      await logActivity({
        leadId,
        userId: user.id,
        userRole: role,
        action: "Uploaded itinerary",
        details: `Version ${nextVersion} — ${fileType}`,
        entityType: "itineraries",
      });
    },
    onSuccess: () => {
      toast({ title: "Itinerary uploaded" });
      setOpen(false);
      setFile(null);
      setFileUrl(null);
      setExternalLink("");
      setNotes("");
      setFileType("pdf");
      setUploadProgress(0);
      queryClient.invalidateQueries({ queryKey: queryKeys.itineraries(leadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allItineraryLeads() });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSubmit = fileType === "url"
    ? !!externalLink
    : !!fileUrl;

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {versions.length === 0 ? "No itineraries uploaded yet." : `${versions.length} version(s)`}
        </p>
        {canUpload && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Upload Itinerary
          </Button>
        )}
      </div>

      {/* Version history */}
      {versions.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
          No itinerary versions uploaded yet.
          {canUpload && " Click \"Upload Itinerary\" to add one."}
        </div>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <div key={v.id} className="flex items-start gap-3 p-4 rounded-lg border hover:bg-muted/20 transition-colors">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">Version {v.version}</p>
                  <Badge variant="secondary" className="text-xs capitalize">{v.file_type ?? "pdf"}</Badge>
                  {v.version === versions[0].version && (
                    <Badge className="text-xs">Latest</Badge>
                  )}
                </div>
                {v.notes && <p className="text-xs text-muted-foreground mt-0.5">{v.notes}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {v.created_at ? format(new Date(v.created_at), "MMM d, yyyy HH:mm") : ""}
                </p>
              </div>
              <div className="shrink-0 flex gap-2">
                {(v.file_url || v.external_link) && (
                  <a
                    href={v.file_url ?? v.external_link ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm" className="h-8 text-xs">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Itinerary</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Type</Label>
              <Select value={fileType} onValueChange={(v) => { setFileType(v as any); setFile(null); setFileUrl(null); setExternalLink(""); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF / Document</SelectItem>
                  <SelectItem value="url">External URL (Google Slides, Drive, etc.)</SelectItem>
                  <SelectItem value="design">Design File</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {fileType === "url" ? (
              <div>
                <Label>External Link *</Label>
                <Input className="mt-1" value={externalLink} onChange={(e) => setExternalLink(e.target.value)} placeholder="https://..." />
              </div>
            ) : (
              <div>
                <Label>File *</Label>
                {uploading ? (
                  <div className="mt-1 space-y-1 p-3 border rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Uploading {file?.name}...</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                ) : fileUrl ? (
                  <div className="mt-1 flex items-center gap-2 p-2.5 rounded-lg border bg-green-50 dark:bg-green-950/20">
                    <FileText className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-sm text-green-700 truncate flex-1">{file?.name}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setFile(null); setFileUrl(null); }}>Change</Button>
                  </div>
                ) : (
                  <div className="mt-1 relative">
                    <div className="w-full flex items-center gap-2 px-3 py-2 border border-dashed rounded-md hover:bg-muted/50 transition-colors pointer-events-none min-h-[40px]">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Choose File</span>
                    </div>
                    <input
                      type="file"
                      accept="application/pdf,image/*,.doc,.docx,.ppt,.pptx"
                      className="absolute inset-0 w-full h-full cursor-pointer"
                      style={{ opacity: 0.001 }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Notes (optional)</Label>
              <Textarea className="mt-1 resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Changes in this version..." />
            </div>

            <Button
              className="w-full"
              onClick={() => submitItinerary.mutate()}
              disabled={!canSubmit || submitItinerary.isPending || uploading}
            >
              {submitItinerary.isPending ? "Uploading..." : "Upload Itinerary"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
