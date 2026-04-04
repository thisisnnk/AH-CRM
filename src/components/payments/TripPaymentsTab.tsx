import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/utils/activityLogger";
import { uploadToR2 } from "@/utils/uploadToR2";
import { format } from "date-fns";
import { Plus, ChevronDown, ChevronUp, Edit2, Upload, TableProperties, Trash2, Download } from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";
import { PaymentDialog, type PaymentFormData } from "./PaymentDialog";

const COST_CATEGORIES = ["Transport", "Accommodation", "Food", "Activities", "Extras"] as const;

interface Props {
  leadId: string;
  totalExpected: number | null;
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function TripPaymentsTab({ leadId, totalExpected }: Props) {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";
  const isExecution = role === "execution";
  const isEmployee = role === "employee";
  const isAccounts = role === "accounts";

  const canAddClientPayment = isAdmin || isEmployee;
  const canAddVendorPayment = isExecution;
  const canEditPlanned = isExecution;
  const showExpense = isExecution || isAccounts;
  const canDeleteClientTx = isAdmin || isEmployee || isExecution;
  const canDeleteVendorTx = isExecution;

  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [generalExpenseOpen, setGeneralExpenseOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [editingPlannedId, setEditingPlannedId] = useState<string | null>(null);
  const [editingPlannedVal, setEditingPlannedVal] = useState("");
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [showSplit, setShowSplit] = useState(false);
  const [confirmDeleteClientId, setConfirmDeleteClientId] = useState<string | null>(null);
  const [confirmDeleteVendorId, setConfirmDeleteVendorId] = useState<string | null>(null);
  const [editingExpected, setEditingExpected] = useState(false);
  const [expectedVal, setExpectedVal] = useState("");

  // ── Queries ──
  const { data: clientTx = [] } = useQuery({
    queryKey: queryKeys.clientTransactions(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_transactions")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!leadId && !!user,
  });

  const { data: costCats = [] } = useQuery({
    queryKey: queryKeys.costCategories(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_categories")
        .select("*")
        .eq("lead_id", leadId)
        .order("category_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!leadId && !!user && showExpense,
  });

  const { data: vendorTx = [] } = useQuery({
    queryKey: queryKeys.vendorTransactions(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_transactions")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!leadId && !!user && showExpense,
  });

  // ── Quotation slot selection (execution only) ──
  const { data: slotSelection } = useQuery({
    queryKey: ["quotation-slot-selection", leadId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotation_slot_selections")
        .select("quotation_id, slot_index")
        .eq("lead_id", leadId)
        .maybeSingle();
      return data ?? null;
    },
    enabled: isExecution && !!leadId && !!user,
  });

  const { data: selectedQuotation } = useQuery({
    queryKey: ["selected-quotation-data", slotSelection?.quotation_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotations")
        .select("pricing_data")
        .eq("id", slotSelection!.quotation_id)
        .maybeSingle();
      return data ?? null;
    },
    enabled: isExecution && !!slotSelection?.quotation_id,
  });

  const selectedSlot = slotSelection && selectedQuotation
    ? ((selectedQuotation.pricing_data as any)?.slots?.[slotSelection.slot_index] ?? null)
    : null;

  // ── Derived totals ──
  const totalReceived = clientTx.reduce((s, t) => s + Number(t.amount), 0);
  const balance = (totalExpected ?? 0) - totalReceived;
  const totalPlanned = costCats.reduce((s, c) => s + Number(c.planned_cost), 0);
  const totalPaid = vendorTx.reduce((s, t) => s + Number(t.amount), 0);
  const totalProfit = totalReceived - totalPaid;

  // ── Mutations ──
  const addClientTx = useMutation({
    mutationFn: async (formData: PaymentFormData) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("client_transactions").insert({
        lead_id: leadId,
        title: formData.title,
        amount: parseFloat(formData.amount),
        payment_mode: formData.payment_mode,
        proof_url: formData.proof_url,
        bill_url: formData.bill_url,
        notes: formData.notes || null,
        created_by: user.id,
      });
      if (error) throw error;
      await logActivity({
        leadId,
        userId: user.id,
        userRole: role,
        action: "Added client payment",
        details: `${formData.title} — ₹${fmt(parseFloat(formData.amount))} via ${formData.payment_mode}`,
        entityType: "client_transactions",
      });
    },
    onSuccess: () => {
      toast({ title: "Payment recorded" });
      setClientDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.clientTransactions(leadId) });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addVendorTx = useMutation({
    mutationFn: async (formData: PaymentFormData) => {
      const catId = formData.category_id ?? selectedCategoryId ?? null;
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("vendor_transactions").insert({
        lead_id: leadId,
        category_id: catId,
        title: formData.title,
        amount: parseFloat(formData.amount),
        payment_mode: formData.payment_mode,
        proof_url: formData.proof_url,
        bill_url: formData.bill_url,
        notes: formData.notes || null,
        created_by: user.id,
      });
      if (error) throw error;
      const cat = costCats.find((c) => c.id === (formData.category_id ?? selectedCategoryId));
      await logActivity({
        leadId,
        userId: user.id,
        userRole: role,
        action: "Added vendor payment",
        details: `${cat?.category_name}: ${formData.title} — ₹${fmt(parseFloat(formData.amount))}`,
        entityType: "vendor_transactions",
      });
    },
    onSuccess: () => {
      toast({ title: "Expense recorded" });
      setVendorDialogOpen(false);
      setGeneralExpenseOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.vendorTransactions(leadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.costCategories(leadId) });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const savePlannedCost = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: string }) => {
      const { error } = await supabase
        .from("cost_categories")
        .update({ planned_cost: parseFloat(val) || 0 })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingPlannedId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.costCategories(leadId) });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Delete mutations (via SECURITY DEFINER RPCs to bypass RLS) ──
  const deleteClientTx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_client_transaction", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Payment deleted" });
      queryClient.invalidateQueries({ queryKey: queryKeys.clientTransactions(leadId) });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const deleteVendorTx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_vendor_transaction", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Expense deleted" });
      queryClient.invalidateQueries({ queryKey: queryKeys.vendorTransactions(leadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.costCategories(leadId) });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const updateExpected = useMutation({
    mutationFn: async (val: number) => {
      const { error } = await supabase.from("leads").update({ total_expected: val }).eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Expected amount updated" });
      setEditingExpected(false);
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Inline proof / bill upload for existing payments ──
  const handleFileUpload = async (
    txId: string,
    file: File,
    field: "proof_url" | "bill_url",
    table: "client_transactions" | "vendor_transactions",
  ) => {
    const key = `${txId}-${field}`;
    setUploading((prev) => ({ ...prev, [key]: true }));
    try {
      const folder = field === "proof_url" ? "payments" : "bills";
      const url = await uploadToR2(file, folder, () => {});
      let error: any = null;
      if (field === "bill_url" && isAccounts) {
        // accounts doesn't have UPDATE RLS — use SECURITY DEFINER RPC
        const rpc = table === "client_transactions" ? "update_client_tx_bill" : "update_vendor_tx_bill";
        ({ error } = await supabase.rpc(rpc, { p_id: txId, p_url: url }));
      } else {
        ({ error } = await supabase.from(table).update({ [field]: url } as any).eq("id", txId));
      }
      if (error) throw error;
      queryClient.invalidateQueries({
        queryKey: table === "client_transactions"
          ? queryKeys.clientTransactions(leadId)
          : queryKeys.vendorTransactions(leadId),
      });
      toast({ title: field === "proof_url" ? "Proof uploaded" : "Bill uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setUploading((prev) => ({ ...prev, [key]: false }));
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  };

  const deleteBillFromTx = async (
    txId: string,
    table: "client_transactions" | "vendor_transactions",
  ) => {
    const rpc = table === "client_transactions" ? "remove_client_tx_bill" : "remove_vendor_tx_bill";
    const { error } = await supabase.rpc(rpc, { p_id: txId });
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Bill removed" });
    queryClient.invalidateQueries({
      queryKey: table === "client_transactions"
        ? queryKeys.clientTransactions(leadId)
        : queryKeys.vendorTransactions(leadId),
    });
  };

  // Proof cell — upload-enabled for anyone who can see the tab
  const ProofCell = ({
    txId,
    url,
    table,
  }: {
    txId: string;
    url: string | null;
    table: "client_transactions" | "vendor_transactions";
  }) => {
    const key = `${txId}-proof_url`;
    if (url) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
          View
        </a>
      );
    }
    if (uploading[key]) return <span className="text-xs text-muted-foreground">Uploading…</span>;
    return (
      <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
        <Upload className="h-3 w-3" />
        <span>Upload</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(txId, f, "proof_url", table);
          }}
        />
      </label>
    );
  };

  // Bill cell — accounts: upload/view/delete; others: view/download only
  const BillCell = ({
    txId,
    url,
    table,
    title,
  }: {
    txId: string;
    url: string | null;
    table: "client_transactions" | "vendor_transactions";
    title: string;
  }) => {
    const key = `${txId}-bill_url`;
    if (isAccounts) {
      if (uploading[key]) return <span className="text-xs text-muted-foreground">Uploading…</span>;
      return (
        <div className="flex items-center gap-2">
          {url && (
            <>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                View
              </a>
              <button
                onClick={() => deleteBillFromTx(txId, table)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Delete bill"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
          <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            <Upload className="h-3 w-3" />
            <span>{url ? "Replace" : "Upload"}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(txId, f, "bill_url", table);
              }}
            />
          </label>
        </div>
      );
    }
    // Admin / Employee / Execution — view + download only
    if (!url) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <div className="flex items-center gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
          View
        </a>
        <button
          onClick={() => downloadFile(url, `bill-${title}`)}
          className="text-muted-foreground hover:text-primary transition-colors"
          title="Download bill"
        >
          <Download className="h-3 w-3" />
        </button>
      </div>
    );
  };

  // ── Revenue section ──
  const revenueSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {canAddClientPayment && (
          <Button size="sm" onClick={() => setClientDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Payment
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Expected — editable for admin/employee */}
        <div className="p-3 rounded-lg border text-center">
          <p className="text-xs text-muted-foreground">Expected</p>
          {editingExpected ? (
            <div className="flex items-center gap-1 mt-1 justify-center">
              <Input
                type="number"
                className="h-7 w-28 text-right text-xs"
                value={expectedVal}
                onChange={(e) => setExpectedVal(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateExpected.mutate(parseFloat(expectedVal) || 0);
                  if (e.key === "Escape") setEditingExpected(false);
                }}
              />
              <Button size="sm" className="h-7 px-2 text-xs" onClick={() => updateExpected.mutate(parseFloat(expectedVal) || 0)} disabled={updateExpected.isPending}>✓</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingExpected(false)}>✕</Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <p className="text-sm font-bold text-muted-foreground">₹{fmt(totalExpected ?? 0)}</p>
              {canAddClientPayment && (
                <button onClick={() => { setExpectedVal(String(totalExpected ?? 0)); setEditingExpected(true); }} className="text-muted-foreground hover:text-primary transition-colors">
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="p-3 rounded-lg border text-center">
          <p className="text-xs text-muted-foreground">Received</p>
          <p className="text-sm font-bold mt-0.5 text-green-600">₹{fmt(totalReceived)}</p>
        </div>
        <div className="p-3 rounded-lg border text-center">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className={`text-sm font-bold mt-0.5 ${balance > 0 ? "text-amber-600" : "text-green-600"}`}>₹{fmt(balance)}</p>
        </div>
      </div>

      {clientTx.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No client payments yet.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">#</th>
                <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Title</th>
                <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Amount</th>
                <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium hidden sm:table-cell">Mode</th>
                <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium hidden md:table-cell">Date</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Proof</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium hidden sm:table-cell">Bill</th>
                {canDeleteClientTx && <th className="w-8 px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {clientTx.map((tx, i) => (
                <tr key={tx.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2.5">{tx.title}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-green-600">₹{fmt(Number(tx.amount))}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground text-xs">{tx.payment_mode}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground text-xs">
                    {tx.created_at ? format(new Date(tx.created_at), "MMM d, yyyy") : ""}
                  </td>
                  <td className="px-3 py-2.5">
                    <ProofCell txId={tx.id} url={tx.proof_url ?? null} table="client_transactions" />
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <BillCell txId={tx.id} url={tx.bill_url ?? null} table="client_transactions" title={tx.title} />
                  </td>
                  {canDeleteClientTx && (
                    <td className="px-3 py-2.5">
                      {confirmDeleteClientId === tx.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { deleteClientTx.mutate(tx.id); setConfirmDeleteClientId(null); }}
                            className="text-xs text-destructive font-medium hover:underline"
                          >
                            Yes
                          </button>
                          <span className="text-muted-foreground text-xs">/</span>
                          <button
                            onClick={() => setConfirmDeleteClientId(null)}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteClientId(tx.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete payment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Expense section ──
  const expenseSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {canAddVendorPayment && (
            <Button size="sm" onClick={() => setGeneralExpenseOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Expense
            </Button>
          )}
          {selectedSlot && (
            <Button
              variant={showSplit ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setShowSplit((v) => !v)}
            >
              <TableProperties className="h-3.5 w-3.5" />
              {showSplit ? "Hide Cost Split" : "Show Cost Split"}
            </Button>
          )}
        </div>
        {isExecution && (
          <p className="text-xs text-muted-foreground">
            Profit:{" "}
            <span className={totalProfit >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
              ₹{fmt(totalProfit)}
            </span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg border text-center">
          <p className="text-xs text-muted-foreground">Total Paid</p>
          <p className="text-sm font-bold mt-0.5 text-red-500">₹{fmt(totalPaid)}</p>
        </div>
        <div className="p-3 rounded-lg border text-center">
          <p className="text-xs text-muted-foreground">Profit</p>
          <p className={`text-sm font-bold mt-0.5 ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>₹{fmt(totalProfit)}</p>
        </div>
      </div>

      {vendorTx.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No expenses recorded yet.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">#</th>
                <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Title</th>
                <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Amount</th>
                <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium hidden sm:table-cell">Mode</th>
                <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium hidden md:table-cell">Date</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium">Proof</th>
                <th className="px-3 py-2 text-xs text-muted-foreground font-medium hidden sm:table-cell">Bill</th>
                {canDeleteVendorTx && <th className="w-8 px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {vendorTx.map((tx, i) => (
                <tr key={tx.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2.5">{tx.title}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-red-500">₹{fmt(Number(tx.amount))}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground text-xs">{tx.payment_mode}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground text-xs">
                    {tx.created_at ? format(new Date(tx.created_at), "MMM d, yyyy") : ""}
                  </td>
                  <td className="px-3 py-2.5">
                    <ProofCell txId={tx.id} url={tx.proof_url ?? null} table="vendor_transactions" />
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <BillCell txId={tx.id} url={tx.bill_url ?? null} table="vendor_transactions" title={tx.title} />
                  </td>
                  {canDeleteVendorTx && (
                    <td className="px-3 py-2.5">
                      {confirmDeleteVendorId === tx.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { deleteVendorTx.mutate(tx.id); setConfirmDeleteVendorId(null); }} className="text-xs text-destructive font-medium hover:underline">Yes</button>
                          <span className="text-muted-foreground text-xs">/</span>
                          <button onClick={() => setConfirmDeleteVendorId(null)} className="text-xs text-muted-foreground hover:underline">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteVendorId(tx.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Quoted Cost Split ── */}
      {showSplit && selectedSlot && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Quoted Cost Split — {selectedSlot.label || "Selected Option"}
            </p>
            <span className="text-sm font-bold">{selectedSlot.price}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/20">
              <tr>
                <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Item</th>
                <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Qty</th>
                <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Rate</th>
                <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(selectedSlot.breakdown ?? []).map((row: any, i: number) => {
                const amount = (parseFloat(row.qty) || 0) * (parseFloat(row.rate) || 0);
                return (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2">{row.title || "—"}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{row.qty || "—"}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {row.rate ? `₹${fmt(parseFloat(row.rate))}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">₹{fmt(amount)}</td>
                  </tr>
                );
              })}
              {selectedSlot.margin && parseFloat(selectedSlot.margin) > 0 && (
                <tr className="border-t bg-muted/10">
                  <td className="px-4 py-2 text-muted-foreground italic" colSpan={3}>Margin</td>
                  <td className="px-4 py-2 text-right font-medium">₹{fmt(parseFloat(selectedSlot.margin))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {!showExpense ? (
        revenueSection
      ) : (
        <Tabs defaultValue="revenue">
          <TabsList>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="expense">Expense</TabsTrigger>
          </TabsList>
          <TabsContent value="revenue" className="mt-4">
            {revenueSection}
          </TabsContent>
          <TabsContent value="expense" className="mt-4">
            {expenseSection}
          </TabsContent>
        </Tabs>
      )}

      <PaymentDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        title="Add Client Payment"
        showBillUpload
        isSubmitting={addClientTx.isPending}
        onSubmit={(data) => addClientTx.mutate(data)}
      />

      <PaymentDialog
        open={vendorDialogOpen}
        onOpenChange={setVendorDialogOpen}
        title={`Add Expense — ${costCats.find((c) => c.id === selectedCategoryId)?.category_name ?? ""}`}
        showBillUpload
        isSubmitting={addVendorTx.isPending}
        onSubmit={(data) => addVendorTx.mutate(data)}
      />

      <PaymentDialog
        open={generalExpenseOpen}
        onOpenChange={setGeneralExpenseOpen}
        title="Add Expense"
        showBillUpload
        isSubmitting={addVendorTx.isPending}
        onSubmit={(data) => addVendorTx.mutate(data)}
      />
    </div>
  );
}
