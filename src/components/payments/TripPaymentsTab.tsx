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
import { format } from "date-fns";
import { Plus, ChevronDown, ChevronUp, Edit2 } from "lucide-react";
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
  const canAddVendorPayment = isAdmin || isExecution;
  const canEditPlanned = isAdmin || isExecution;
  const showExpense = isAdmin || isExecution || isAccounts;

  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [editingPlannedId, setEditingPlannedId] = useState<string | null>(null);
  const [editingPlannedVal, setEditingPlannedVal] = useState("");

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
      if (!user || !selectedCategoryId) throw new Error("No category selected");
      const { error } = await supabase.from("vendor_transactions").insert({
        lead_id: leadId,
        category_id: selectedCategoryId,
        title: formData.title,
        amount: parseFloat(formData.amount),
        payment_mode: formData.payment_mode,
        proof_url: formData.proof_url,
        bill_url: formData.bill_url,
        notes: formData.notes || null,
        created_by: user.id,
      });
      if (error) throw error;
      const cat = costCats.find((c) => c.id === selectedCategoryId);
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
      toast({ title: "Vendor payment recorded" });
      setVendorDialogOpen(false);
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
        {[
          { label: "Expected", value: totalExpected ?? 0, color: "text-muted-foreground" },
          { label: "Received", value: totalReceived, color: "text-green-600" },
          { label: "Balance", value: balance, color: balance > 0 ? "text-amber-600" : "text-green-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-lg border text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-sm font-bold mt-0.5 ${color}`}>₹{fmt(value)}</p>
          </div>
        ))}
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
                    {tx.proof_url ? (
                      <a href={tx.proof_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    {tx.bill_url ? (
                      <a href={tx.bill_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
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
        <div />
        {(isAdmin || isExecution) && (
          <p className="text-xs text-muted-foreground">
            Profit:{" "}
            <span className={totalProfit >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
              ₹{fmt(totalProfit)}
            </span>
          </p>
        )}
      </div>

      {costCats.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Planned", value: totalPlanned, color: "text-muted-foreground" },
            { label: "Paid", value: totalPaid, color: "text-red-500" },
            { label: "Remaining", value: totalPlanned - totalPaid, color: totalPlanned - totalPaid < 0 ? "text-red-600" : "text-amber-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-3 rounded-lg border text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-sm font-bold mt-0.5 ${color}`}>₹{fmt(value)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Category</th>
              <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Planned</th>
              <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium">Paid</th>
              <th className="text-right px-3 py-2 text-xs text-muted-foreground font-medium hidden sm:table-cell">Balance</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {costCats.map((cat) => {
              const paid = vendorTx.filter((v) => v.category_id === cat.id).reduce((s, v) => s + Number(v.amount), 0);
              const catBalance = Number(cat.planned_cost) - paid;
              const catTx = vendorTx.filter((v) => v.category_id === cat.id);
              const isExpanded = expandedCat === cat.id;
              return (
                <>
                  <tr key={cat.id} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2.5">
                      <button
                        className="flex items-center gap-1.5 font-medium text-left"
                        onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {cat.category_name}
                        {catTx.length > 0 && <span className="text-xs text-muted-foreground ml-1">({catTx.length})</span>}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEditPlanned && editingPlannedId === cat.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            className="h-7 w-24 text-right text-xs"
                            type="number"
                            value={editingPlannedVal}
                            onChange={(e) => setEditingPlannedVal(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") savePlannedCost.mutate({ id: cat.id, val: editingPlannedVal });
                              if (e.key === "Escape") setEditingPlannedId(null);
                            }}
                          />
                          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => savePlannedCost.mutate({ id: cat.id, val: editingPlannedVal })}>✓</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-muted-foreground">₹{fmt(Number(cat.planned_cost))}</span>
                          {canEditPlanned && (
                            <button onClick={() => { setEditingPlannedId(cat.id); setEditingPlannedVal(String(cat.planned_cost)); }}>
                              <Edit2 className="h-3 w-3 text-muted-foreground hover:text-primary" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-500 font-medium">₹{fmt(paid)}</td>
                    <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                      <span className={catBalance < 0 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                        ₹{fmt(catBalance)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {canAddVendorPayment && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => { setSelectedCategoryId(cat.id); setVendorDialogOpen(true); }}
                        >
                          <Plus className="h-3 w-3 mr-0.5" /> Pay
                        </Button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && catTx.map((tx, i) => (
                    <tr key={tx.id} className="bg-muted/10 border-t border-dashed">
                      <td className="px-6 py-2 text-xs text-muted-foreground" colSpan={2}>
                        {i + 1}. {tx.title}
                        <span className="ml-2 text-xs">{tx.payment_mode}</span>
                        <span className="ml-2 text-xs">{tx.created_at ? format(new Date(tx.created_at), "MMM d") : ""}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-red-500 font-medium">₹{fmt(Number(tx.amount))}</td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        {tx.proof_url && (
                          <a href={tx.proof_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            Proof
                          </a>
                        )}
                        {tx.bill_url && (
                          <a href={tx.bill_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline ml-2">
                            Bill
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2"></td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {isEmployee ? (
        <>
          <p className="font-semibold text-base">Client Payments (Revenue)</p>
          {revenueSection}
        </>
      ) : (
        <Tabs defaultValue="revenue">
          <TabsList>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            {showExpense && <TabsTrigger value="expense">Expense</TabsTrigger>}
          </TabsList>
          <TabsContent value="revenue" className="mt-4">
            {revenueSection}
          </TabsContent>
          {showExpense && (
            <TabsContent value="expense" className="mt-4">
              {expenseSection}
            </TabsContent>
          )}
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
        title={`Add Vendor Payment — ${costCats.find((c) => c.id === selectedCategoryId)?.category_name ?? ""}`}
        showBillUpload
        isSubmitting={addVendorTx.isPending}
        onSubmit={(data) => addVendorTx.mutate(data)}
      />
    </div>
  );
}
