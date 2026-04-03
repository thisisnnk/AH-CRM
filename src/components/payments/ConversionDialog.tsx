import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { sendNotification } from "@/utils/notificationHelper";
import { uploadToR2 } from "@/utils/uploadToR2";
import { logActivity } from "@/utils/activityLogger";
import { IndianRupee, ExternalLink } from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque", "Other"] as const;
const COST_CATEGORY_NAMES = ["Transport", "Accommodation", "Food", "Activities", "Extras"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  assignedEmployeeId?: string | null;
  onConverted: () => void;
}

export function ConversionDialog({ open, onOpenChange, leadId, leadName, assignedEmployeeId, onConverted }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [totalExpected, setTotalExpected] = useState("");
  const [title, setTitle] = useState("Advance Payment");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadToR2(file, "payments", () => {});
      setProofUrl(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const convert = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!totalExpected) throw new Error("Total expected amount is required");
      if (!title || !amount) throw new Error("First payment details are required");

      // 1. Update lead status + total_expected
      const { error: leadErr } = await supabase
        .from("leads")
        .update({ status: "Converted", badge_stage: "Converted", total_expected: parseFloat(totalExpected) })
        .eq("id", leadId);
      if (leadErr) throw leadErr;

      // 2. Insert first client transaction
      const { error: txErr } = await supabase.from("client_transactions").insert({
        lead_id: leadId,
        title,
        amount: parseFloat(amount),
        payment_mode: paymentMode,
        proof_url: proofUrl || null,
        created_by: user.id,
      });
      if (txErr) throw txErr;

      // 3. Auto-create 5 cost categories
      const categories = COST_CATEGORY_NAMES.map((name) => ({
        lead_id: leadId,
        category_name: name,
        planned_cost: 0,
      }));
      await supabase.from("cost_categories").upsert(categories, { onConflict: "lead_id,category_name" });

      // 4. Log activity
      await logActivity({
        leadId,
        userId: user.id,
        userRole: null,
        action: "Lead Converted",
        details: `Total expected: ₹${Number(totalExpected).toLocaleString("en-IN")} | First payment: ₹${Number(amount).toLocaleString("en-IN")} via ${paymentMode}`,
        entityType: "leads",
        entityId: leadId,
      });

      // 5. Notify execution team
      const { data: executionUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "execution" as any);
      for (const u of executionUsers ?? []) {
        await sendNotification({
          recipientId: u.user_id,
          type: "lead_converted",
          message: `Lead converted: ${leadName}. Trip payments are now active.`,
          leadId,
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Lead converted!", description: "Cost categories and payment tracking are now active." });
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.clientTransactions(leadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.costCategories(leadId) });
      onOpenChange(false);
      onConverted();
      // Reset form
      setTotalExpected("");
      setTitle("Advance Payment");
      setAmount("");
      setPaymentMode("UPI");
      setProofFile(null);
      setProofUrl(null);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Convert Lead</DialogTitle>
          <DialogDescription>
            Set the expected revenue and record the first payment to activate trip tracking.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Total Expected */}
          <div>
            <Label className="font-medium">Total Expected Revenue *</Label>
            <div className="relative mt-1">
              <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-7"
                type="number"
                placeholder="0"
                value={totalExpected}
                onChange={(e) => setTotalExpected(e.target.value)}
              />
            </div>
          </div>

          <Separator />
          <p className="text-sm font-medium">First Payment</p>

          <div>
            <Label>Payment Title *</Label>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Advance payment" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (₹) *</Label>
              <div className="relative mt-1">
                <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-7" type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Payment Proof (optional)</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="file"
                accept="image/*,application/pdf"
                className="flex-1 text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setProofFile(f); handleUpload(f); }
                }}
              />
              {uploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
              {proofUrl && <ExternalLink className="h-4 w-4 text-green-600 shrink-0" />}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => convert.mutate()}
            disabled={convert.isPending || !totalExpected || !title || !amount || uploading}
          >
            {convert.isPending ? "Converting..." : "Confirm Conversion"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
