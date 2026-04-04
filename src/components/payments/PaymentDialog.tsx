import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { uploadToR2 } from "@/utils/uploadToR2";
import { IndianRupee, CheckCircle2, Loader2 } from "lucide-react";

const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque", "Other"] as const;

export interface PaymentFormData {
  title: string;
  amount: string;
  payment_mode: string;
  notes: string;
  proof_url: string | null;
  bill_url: string | null;
  category_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  showBillUpload?: boolean;
  isSubmitting?: boolean;
  onSubmit: (data: PaymentFormData) => void;
}

const EMPTY: PaymentFormData = {
  title: "",
  amount: "",
  payment_mode: "UPI",
  notes: "",
  proof_url: null,
  bill_url: null,
};

export function PaymentDialog({
  open,
  onOpenChange,
  title,
  showBillUpload = false,
  isSubmitting = false,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<PaymentFormData>(EMPTY);
  const [proofUploading, setProofUploading] = useState(false);
  const [billUploading, setBillUploading] = useState(false);
  const [proofError, setProofError] = useState(false);

  const handleOpenChange = (o: boolean) => {
    if (!o) { setForm(EMPTY); setProofError(false); }
    onOpenChange(o);
  };

  const uploadFile = async (
    file: File,
    folder: string,
    setUploading: (b: boolean) => void,
    onUrl: (url: string | null) => void,
  ) => {
    setUploading(true);
    try {
      const url = await uploadToR2(file, folder, () => {});
      onUrl(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleSubmit = () => {
    if (!form.proof_url) {
      setProofError(true);
      return;
    }
    setProofError(false);
    onSubmit(form);
  };

  const canSubmit =
    form.title.trim() &&
    form.amount &&
    form.proof_url &&
    !isSubmitting &&
    !proofUploading &&
    !billUploading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Title *</Label>
            <Input
              className="mt-1"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Advance payment"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount (₹) *</Label>
              <div className="relative mt-1">
                <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-7"
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Mode</Label>
              <Select value={form.payment_mode} onValueChange={(v) => setForm({ ...form, payment_mode: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Proof — required */}
          <div>
            <Label className={proofError ? "text-destructive" : ""}>
              Proof * {proofError && <span className="text-xs font-normal">(required)</span>}
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="file"
                accept="image/*,application/pdf"
                className={`flex-1 text-xs ${proofError ? "border-destructive" : ""}`}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setProofError(false);
                    uploadFile(f, "payments", setProofUploading, (url) => setForm((p) => ({ ...p, proof_url: url })));
                  }
                }}
              />
              {proofUploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
              {form.proof_url && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
            </div>
          </div>

          {showBillUpload && (
            <div>
              <Label>Bill / Invoice (optional)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  className="flex-1 text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f, "bills", setBillUploading, (url) => setForm((p) => ({ ...p, bill_url: url })));
                  }}
                />
                {billUploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
                {form.bill_url && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
              </div>
            </div>
          )}

          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              className="mt-1 resize-none"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : "Record Payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
