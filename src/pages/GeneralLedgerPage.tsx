import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card as SummaryCard, CardContent as SummaryCardContent, CardHeader as SummaryCardHeader, CardTitle as SummaryCardTitle } from "@/components/ui/card";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { CalendarIcon, TrendingUp, TrendingDown, IndianRupee, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { toast } from "@/hooks/use-toast";
import { uploadToR2 } from "@/utils/uploadToR2";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

interface TxRow {
  id: string;
  date: string;
  time: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  itineraryCode: string | null;
  handledBy: string;
  type: "Revenue" | "Expense";
  category: string;
  title: string;
  amount: number;
  notes: string | null;
  proof_url: string | null;
  bill_url: string | null;
  payment_mode: string;
  tableName: "client_transactions" | "vendor_transactions";
}

export default function GeneralLedgerPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const canUploadBill = role === "admin" || role === "accounts";

  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 90));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Bill upload dialog state
  const [billRow, setBillRow] = useState<TxRow | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billUploading, setBillUploading] = useState(false);
  const [billUrl, setBillUrl] = useState<string | null>(null);

  const fromStr = format(startOfDay(fromDate), "yyyy-MM-dd'T'HH:mm:ss");
  const toStr = format(endOfDay(toDate), "yyyy-MM-dd'T'HH:mm:ss");

  // Profiles map (created_by → employee name)
  const { data: profiles = [] } = useQuery({
    queryKey: queryKeys.employees(),
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const profileMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of profiles) map[p.user_id] = p.name;
    return map;
  }, [profiles]);

  // Client transactions (Revenue)
  const { data: clientTx = [], isLoading: loadingClient } = useQuery({
    queryKey: queryKeys.allClientTransactions(fromStr, toStr),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_transactions")
        .select("*, leads(id, name, phone, itinerary_code)")
        .gte("created_at", fromStr)
        .lte("created_at", toStr)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t): TxRow => ({
        id: t.id,
        date: t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : "—",
        time: t.created_at ? format(new Date(t.created_at), "hh:mm a") : "—",
        leadId: t.lead_id,
        leadName: (t.leads as any)?.name ?? "Unknown",
        leadPhone: (t.leads as any)?.phone ?? "—",
        itineraryCode: (t.leads as any)?.itinerary_code ?? null,
        handledBy: profileMap[t.created_by] ?? "—",
        type: "Revenue",
        category: t.payment_mode,
        title: t.title,
        amount: Number(t.amount),
        notes: t.notes,
        proof_url: t.proof_url,
        bill_url: (t as any).bill_url ?? null,
        payment_mode: t.payment_mode,
        tableName: "client_transactions",
      }));
    },
    enabled: !!user,
  });

  // Vendor transactions (Expense)
  const { data: vendorTx = [], isLoading: loadingVendor } = useQuery({
    queryKey: queryKeys.allVendorTransactions(fromStr, toStr),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_transactions")
        .select("*, leads(id, name, phone, itinerary_code), cost_categories(category_name)")
        .gte("created_at", fromStr)
        .lte("created_at", toStr)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t): TxRow => ({
        id: t.id,
        date: t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : "—",
        time: t.created_at ? format(new Date(t.created_at), "hh:mm a") : "—",
        leadId: t.lead_id,
        leadName: (t.leads as any)?.name ?? "Unknown",
        leadPhone: (t.leads as any)?.phone ?? "—",
        itineraryCode: (t.leads as any)?.itinerary_code ?? null,
        handledBy: profileMap[t.created_by] ?? "—",
        type: "Expense",
        category: (t.cost_categories as any)?.category_name ?? t.payment_mode,
        title: t.title,
        amount: Number(t.amount),
        notes: t.notes,
        proof_url: t.proof_url,
        bill_url: (t as any).bill_url ?? null,
        payment_mode: t.payment_mode,
        tableName: "vendor_transactions",
      }));
    },
    enabled: !!user,
  });

  const isLoading = loadingClient || loadingVendor;

  const filterRows = (rows: TxRow[]) => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.leadName.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.payment_mode.toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q) ||
        (r.itineraryCode ?? "").toLowerCase().includes(q) ||
        r.leadPhone.toLowerCase().includes(q)
    );
  };

  const incomeRows = useMemo(() => filterRows(clientTx), [clientTx, search]);
  const expenseRows = useMemo(() => filterRows(vendorTx), [vendorTx, search]);

  const totalRevenue = clientTx.reduce((s, t) => s + t.amount, 0);
  const totalExpense = vendorTx.reduce((s, t) => s + t.amount, 0);
  const profit = totalRevenue - totalExpense;

  // ── Bill upload mutation ──
  const saveBill = useMutation({
    mutationFn: async ({ row, url }: { row: TxRow; url: string }) => {
      const table = row.tableName;
      const { error } = await supabase.from(table).update({ bill_url: url } as any).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: (_, { row }) => {
      toast({ title: "Bill linked" });
      setBillRow(null);
      setBillFile(null);
      setBillUrl(null);
      if (row.tableName === "client_transactions") {
        queryClient.invalidateQueries({ queryKey: queryKeys.allClientTransactions(fromStr, toStr) });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.allVendorTransactions(fromStr, toStr) });
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleBillUpload = async (file: File) => {
    setBillUploading(true);
    try {
      const url = await uploadToR2(file, "bills", () => {});
      setBillUrl(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setBillUploading(false);
  };

  // ── Ledger table ──
  const LedgerTable = ({ rows, emptyMsg }: { rows: TxRow[]; emptyMsg: string }) => (
    <Card>
      <CardContent className="p-0">
        {rows.length === 0 && !isLoading ? (
          <div className="py-16 text-center text-muted-foreground">{emptyMsg}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap hidden sm:table-cell">Time</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Itin. ID</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Lead</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Handled By</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Proof</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Bill</th>
                  {canUploadBill && <th className="px-4 py-3 text-xs font-medium text-muted-foreground"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.type}-${row.id}`} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap hidden sm:table-cell">{row.time}</td>
                    <td className="px-4 py-3 max-w-[120px] truncate font-medium">{row.title}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{row.itineraryCode ?? "—"}</td>
                    <td className="px-4 py-3 max-w-[120px] truncate">{row.leadName}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{row.leadPhone}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{row.handledBy}</td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${row.type === "Revenue" ? "text-green-600" : "text-red-500"}`}>
                      {row.type === "Revenue" ? "+" : "−"}₹{fmt(row.amount)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {row.proof_url ? (
                        <a href={row.proof_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {row.bill_url ? (
                        <a href={row.bill_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    {canUploadBill && (
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          title="Upload bill"
                          onClick={() => { setBillRow(row); setBillFile(null); setBillUrl(row.bill_url); }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={isLoading} />

      <div>
        <h1 className="text-2xl font-bold">General Ledger</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {format(fromDate, "MMM d, yyyy")} — {format(toDate, "MMM d, yyyy")}
        </p>
      </div>

      {/* Date Range Picker */}
      <div className="flex flex-wrap gap-2 items-center">
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start text-left font-normal", !fromDate && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              From: {format(fromDate, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={fromDate} onSelect={(d) => { if (d) { setFromDate(d); setFromOpen(false); } }} initialFocus />
          </PopoverContent>
        </Popover>

        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start text-left font-normal", !toDate && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              To: {format(toDate, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={toDate} onSelect={(d) => { if (d) { setToDate(d); setToOpen(false); } }} initialFocus />
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="sm" onClick={() => { setFromDate(subDays(new Date(), 30)); setToDate(new Date()); }}>Last 30 days</Button>
        <Button variant="ghost" size="sm" onClick={() => { setFromDate(subDays(new Date(), 90)); setToDate(new Date()); }}>Last 90 days</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard className="border-green-200 dark:border-green-800">
          <SummaryCardHeader className="pb-2 pt-4 px-4">
            <SummaryCardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" /> Total Revenue
            </SummaryCardTitle>
          </SummaryCardHeader>
          <SummaryCardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-green-600">₹{fmt(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{clientTx.length} transaction{clientTx.length !== 1 ? "s" : ""}</p>
          </SummaryCardContent>
        </SummaryCard>

        <SummaryCard className="border-red-200 dark:border-red-800">
          <SummaryCardHeader className="pb-2 pt-4 px-4">
            <SummaryCardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" /> Total Expense
            </SummaryCardTitle>
          </SummaryCardHeader>
          <SummaryCardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-red-500">₹{fmt(totalExpense)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{vendorTx.length} transaction{vendorTx.length !== 1 ? "s" : ""}</p>
          </SummaryCardContent>
        </SummaryCard>

        <SummaryCard className={profit >= 0 ? "border-primary/40" : "border-red-200 dark:border-red-800"}>
          <SummaryCardHeader className="pb-2 pt-4 px-4">
            <SummaryCardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <IndianRupee className="h-4 w-4" /> Net Profit
            </SummaryCardTitle>
          </SummaryCardHeader>
          <SummaryCardContent className="px-4 pb-4">
            <p className={`text-2xl font-bold ${profit >= 0 ? "text-primary" : "text-red-600"}`}>₹{fmt(profit)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Margin: {totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : "0"}%
            </p>
          </SummaryCardContent>
        </SummaryCard>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search lead, title, category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabbed Ledger */}
      <Tabs defaultValue="income">
        <TabsList>
          <TabsTrigger value="income">Income ({incomeRows.length})</TabsTrigger>
          <TabsTrigger value="expense">Expense ({expenseRows.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="income" className="mt-4">
          <LedgerTable rows={incomeRows} emptyMsg="No income transactions in this date range." />
        </TabsContent>
        <TabsContent value="expense" className="mt-4">
          <LedgerTable rows={expenseRows} emptyMsg="No expense transactions in this date range." />
        </TabsContent>
      </Tabs>

      {/* Bill Upload Dialog */}
      <Dialog open={!!billRow} onOpenChange={(o) => { if (!o) { setBillRow(null); setBillFile(null); setBillUrl(null); } }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Bill</DialogTitle>
          </DialogHeader>
          {billRow && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border p-3 space-y-1 bg-muted/20">
                <p className="text-sm font-medium">{billRow.title}</p>
                <p className="text-xs text-muted-foreground">{billRow.leadName} · ₹{fmt(billRow.amount)}</p>
              </div>

              {billRow.bill_url && !billUrl && (
                <p className="text-xs text-muted-foreground">
                  Current:{" "}
                  <a href={billRow.bill_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    View existing bill
                  </a>
                </p>
              )}

              <div>
                <Label>Bill / Invoice</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    className="flex-1 text-xs"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { setBillFile(f); handleBillUpload(f); }
                    }}
                  />
                  {billUploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
                </div>
                {billUrl && !billUploading && (
                  <p className="text-xs text-green-600 mt-1">
                    <a href={billUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      File ready — click to preview
                    </a>
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                disabled={!billUrl || billUploading || saveBill.isPending}
                onClick={() => { if (billRow && billUrl) saveBill.mutate({ row: billRow, url: billUrl }); }}
              >
                {saveBill.isPending ? "Saving..." : "Save Bill"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
