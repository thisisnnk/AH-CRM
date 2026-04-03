import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { TrendingUp, TrendingDown, IndianRupee, ChevronRight } from "lucide-react";
import { PageLoadingBar } from "@/components/PageLoadingBar";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function AccountsDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const from30 = subDays(new Date(), 30).toISOString();
  const toNow = endOfDay(new Date()).toISOString();

  const { data: clientTx = [], isLoading: loadingC } = useQuery({
    queryKey: ["accounts-dash-client"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_transactions")
        .select("*, leads(name)")
        .gte("created_at", from30)
        .lte("created_at", toNow)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  const { data: vendorTx = [], isLoading: loadingV } = useQuery({
    queryKey: ["accounts-dash-vendor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_transactions")
        .select("*, leads(name), cost_categories(category_name)")
        .gte("created_at", from30)
        .lte("created_at", toNow)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    retry: 2,
  });

  const totalRevenue = clientTx.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = vendorTx.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const profit = totalRevenue - totalExpense;

  // Merge recent 8 transactions
  const recentTx = [
    ...clientTx.map((t: any) => ({ ...t, txType: "Revenue" })),
    ...vendorTx.map((t: any) => ({ ...t, txType: "Expense" })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  const isLoading = loadingC || loadingV;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={isLoading} />
      <div>
        <h1 className="text-2xl font-bold">Accounts Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Last 30 days</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-green-100 dark:bg-green-900/30 shrink-0">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-xl font-bold text-green-600">₹{fmt(totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">{clientTx.length} transactions</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-red-100 dark:bg-red-900/30 shrink-0">
              <TrendingDown className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expenses</p>
              <p className="text-xl font-bold text-red-500">₹{fmt(totalExpense)}</p>
              <p className="text-xs text-muted-foreground">{vendorTx.length} transactions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-primary/10 shrink-0">
              <IndianRupee className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net Profit</p>
              <p className={`text-xl font-bold ${profit >= 0 ? "text-primary" : "text-red-600"}`}>₹{fmt(profit)}</p>
              <p className="text-xs text-muted-foreground">
                {totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : "0"}% margin
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/general-ledger")}>
              Full Ledger <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentTx.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground text-center">No transactions in the last 30 days.</p>
          ) : (
            recentTx.map((tx: any) => (
              <div key={`${tx.txType}-${tx.id}`} className="flex items-center justify-between px-6 py-3 border-t hover:bg-muted/20">
                <div>
                  <p className="text-sm font-medium">{(tx.leads as any)?.name ?? "Unknown Lead"}</p>
                  <p className="text-xs text-muted-foreground">
                    {tx.txType === "Expense"
                      ? ((tx.cost_categories as any)?.category_name ?? tx.payment_mode)
                      : tx.payment_mode}{" "}
                    · {tx.created_at ? format(new Date(tx.created_at), "MMM d") : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={tx.txType === "Revenue" ? "default" : "destructive"} className="text-xs">
                    {tx.txType}
                  </Badge>
                  <span className={`text-sm font-semibold ${tx.txType === "Revenue" ? "text-green-600" : "text-red-500"}`}>
                    {tx.txType === "Revenue" ? "+" : "−"}₹{fmt(Number(tx.amount))}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
