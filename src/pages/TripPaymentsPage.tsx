import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function TripPaymentsPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isExecution = role === "execution";

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["converted-leads-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, destination, travel_date, total_expected, travelers, tour_category")
        .eq("status", "Converted")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const leadIds = leads.map((l) => l.id);

  const { data: allClientTx = [] } = useQuery({
    queryKey: ["trip-payments-client-tx", leadIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_transactions")
        .select("lead_id, amount")
        .in("lead_id", leadIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: leadIds.length > 0,
  });

  const { data: allVendorTx = [] } = useQuery({
    queryKey: ["trip-payments-vendor-tx", leadIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_transactions")
        .select("lead_id, amount")
        .in("lead_id", leadIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isExecution && leadIds.length > 0,
  });

  const { data: allCostCats = [] } = useQuery({
    queryKey: ["trip-payments-cost-cats", leadIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_categories")
        .select("lead_id, planned_cost")
        .in("lead_id", leadIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: isExecution && leadIds.length > 0,
  });

  const leadRows = leads.map((lead) => {
    const expected = Number(lead.total_expected ?? 0);
    const received = allClientTx
      .filter((t) => t.lead_id === lead.id)
      .reduce((s, t) => s + Number(t.amount), 0);
    const balance = expected - received;
    const planned = allCostCats
      .filter((c) => c.lead_id === lead.id)
      .reduce((s, c) => s + Number(c.planned_cost), 0);
    const paid = allVendorTx
      .filter((t) => t.lead_id === lead.id)
      .reduce((s, t) => s + Number(t.amount), 0);
    const profit = received - paid;
    return { lead, expected, received, balance, planned, paid, profit };
  });

  const totalExpected = leadRows.reduce((s, r) => s + r.expected, 0);
  const totalReceived = leadRows.reduce((s, r) => s + r.received, 0);
  const totalBalance = totalExpected - totalReceived;
  const totalPlanned = leadRows.reduce((s, r) => s + r.planned, 0);
  const totalPaid = leadRows.reduce((s, r) => s + r.paid, 0);
  const totalProfit = totalReceived - totalPaid;

  const summaryCards = [
    { label: "Expected", value: totalExpected, color: "text-foreground" },
    { label: "Received", value: totalReceived, color: "text-green-600" },
    { label: "Balance", value: totalBalance, color: totalBalance > 0 ? "text-amber-600" : "text-green-600" },
    ...(isExecution
      ? [
          { label: "Planned Expense", value: totalPlanned, color: "text-muted-foreground" },
          { label: "Paid Expense", value: totalPaid, color: "text-red-500" },
          { label: "Net Profit", value: totalProfit, color: totalProfit >= 0 ? "text-green-600" : "text-red-600" },
        ]
      : []),
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trip Payments</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {leads.length} converted trip{leads.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className={`grid gap-3 ${isExecution ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-6" : "grid-cols-3"}`}>
        {summaryCards.map(({ label, value, color }) => (
          <div key={label} className="p-4 rounded-lg border text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-base font-bold mt-1 ${color}`}>₹{fmt(value)}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center py-12 text-muted-foreground">Loading trips...</p>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border py-16 text-center text-muted-foreground">
          No converted trips yet.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">#</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Trip / Client</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Travel Date</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Expected</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Received</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Balance</th>
                {isExecution && (
                  <>
                    <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Planned</th>
                    <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Paid Exp.</th>
                    <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Profit</th>
                  </>
                )}
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {leadRows.map(({ lead, expected, received, balance, planned, paid, profit }, i) => (
                <tr
                  key={lead.id}
                  className="border-t hover:bg-muted/20 cursor-pointer"
                  onClick={() => navigate(`/leads/${lead.id}`)}
                >
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{lead.name}</p>
                    {lead.destination && (
                      <p className="text-xs text-muted-foreground">{lead.destination}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                    {lead.travel_date
                      ? format(new Date(lead.travel_date), "MMM d, yyyy")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">₹{fmt(expected)}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">₹{fmt(received)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={balance > 0 ? "text-amber-600 font-medium" : "text-green-600 font-medium"}>
                      ₹{fmt(balance)}
                    </span>
                  </td>
                  {isExecution && (
                    <>
                      <td className="px-4 py-3 text-right text-muted-foreground">₹{fmt(planned)}</td>
                      <td className="px-4 py-3 text-right text-red-500 font-medium">₹{fmt(paid)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={profit >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                          ₹{fmt(profit)}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
