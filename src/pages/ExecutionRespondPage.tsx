import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { sendNotification } from "@/utils/notificationHelper";
import { logActivity } from "@/utils/activityLogger";
import { ArrowLeft, Plus, Trash2, RotateCcw, ChevronDown, ChevronUp, Calculator } from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";
import { PageLoadingBar } from "@/components/PageLoadingBar";
import { ensureSession } from "@/utils/ensureSession";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BreakdownRow {
  id: string;
  title: string;
  qty: string;
  rate: string;
}

interface PricingSlot {
  id: string;
  label: string;
  price: string;
  breakdown: BreakdownRow[];
  margin: string;
  showBreakdown: boolean;
}

let _ctr = 0;
const uid = () => `s-${++_ctr}`;

function freshSlots(): PricingSlot[] {
  return [{ id: uid(), label: "", price: "", breakdown: [], margin: "", showBreakdown: true }];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Breakfast Only (CP)",
  "breakfast-dinner": "Breakfast + Dinner (MAP)",
  "all-meals": "All Meals B+L+D (AP)",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  );
}

function calcRowAmount(row: BreakdownRow): number {
  return (parseFloat(row.qty) || 0) * (parseFloat(row.rate) || 0);
}

function calcSlotTotal(slot: PricingSlot): number {
  const catTotal = slot.breakdown.reduce((sum, row) => sum + calcRowAmount(row), 0);
  return catTotal + (parseFloat(slot.margin) || 0);
}

function fmtINR(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExecutionRespondPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();

  const [pricingSlots, setPricingSlots] = useState<PricingSlot[]>(freshSlots);
  const [notes, setNotes] = useState("");

  // ── Fetch request ─────────────────────────────────────────────────────────

  const { data: req, isLoading, isError } = useQuery({
    queryKey: ["quotation-request-single", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_requests")
        .select("*, leads(*)")
        .eq("id", requestId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!requestId,
  });

  // ── Fetch existing quotations (for read-only view) ────────────────────────

  const { data: existingQuotations = [] } = useQuery({
    queryKey: ["quotations-for-request", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("*")
        .eq("request_id", requestId!)
        .order("version", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!requestId && req?.status === "responded",
  });

  // ── Slot management ───────────────────────────────────────────────────────

  function addSlot() {
    setPricingSlots((prev) => [
      ...prev,
      { id: uid(), label: "", price: "", breakdown: [], margin: "", showBreakdown: true },
    ]);
  }

  function removeSlot(id: string) {
    setPricingSlots((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSlot(id: string, field: "label" | "price", value: string) {
    setPricingSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  }

  // ── Breakdown row management ──────────────────────────────────────────────

  function addBreakdownRow(slotId: string) {
    setPricingSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, breakdown: [...s.breakdown, { id: uid(), title: "", qty: "", rate: "" }] }
          : s
      )
    );
  }

  function removeBreakdownRow(slotId: string, rowId: string) {
    setPricingSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, breakdown: s.breakdown.filter((r) => r.id !== rowId) }
          : s
      )
    );
  }

  function updateBreakdownRow(
    slotId: string,
    rowId: string,
    field: "title" | "qty" | "rate",
    value: string
  ) {
    setPricingSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              breakdown: s.breakdown.map((r) =>
                r.id === rowId ? { ...r, [field]: value } : r
              ),
            }
          : s
      )
    );
  }

  function updateMargin(slotId: string, value: string) {
    setPricingSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, margin: value } : s))
    );
  }

  function recordPrice(slotId: string) {
    setPricingSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const total = calcSlotTotal(s);
        return { ...s, price: `₹${fmtINR(total)}`, showBreakdown: false };
      })
    );
  }

  function toggleBreakdown(slotId: string) {
    setPricingSlots((prev) =>
      prev.map((s) =>
        s.id === slotId ? { ...s, showBreakdown: !s.showBreakdown } : s
      )
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const submitQuotation = useMutation({
    mutationFn: async () => {
      await ensureSession();
      if (!user || !req) throw new Error("No request loaded");

      const filledSlots = pricingSlots.filter((s) => s.label.trim() || s.price.trim());
      if (filledSlots.length === 0) {
        throw new Error("Add at least one pricing option before submitting.");
      }

      const { data: existing } = await supabase
        .from("quotations")
        .select("id")
        .eq("request_id", req.id);
      const nextVersion = (existing?.length ?? 0) + 1;

      const pricingData = {
        slots: filledSlots.map(({ label, price, breakdown, margin }) => ({
          label,
          price,
          breakdown: breakdown.map(({ title, qty, rate }) => ({ title, qty, rate })),
          margin,
        })),
      };

      const { error: quotErr } = await supabase.from("quotations").insert({
        request_id: req.id,
        version: nextVersion,
        pricing_data: pricingData,
        total_cost: null,
        notes: notes.trim() || null,
        created_by: user.id,
      });
      if (quotErr) throw quotErr;

      const { error: statusErr } = await supabase
        .rpc("mark_quotation_request_responded", { p_request_id: req.id });
      if (statusErr) throw statusErr;

      const lead = req.leads as any;
      if (lead?.id) {
        await supabase.from("leads").update({ status: "Quoted" }).eq("id", lead.id);

        await logActivity({
          leadId: lead.id,
          userId: user.id,
          userRole: role,
          action: "Quotation provided",
          details: `${filledSlots.length} pricing option(s) for ${lead.name}`,
          entityType: "quotations",
        });

        if (lead.assigned_employee_id) {
          await sendNotification({
            recipientId: lead.assigned_employee_id,
            type: "quotation_response",
            message: `Quotation is ready for lead: ${lead.name}`,
            leadId: lead.id,
          });
        }

        const { data: adminUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin" as any);
        for (const u of adminUsers ?? []) {
          if (u.user_id !== user.id) {
            await sendNotification({
              recipientId: u.user_id,
              type: "quotation_response",
              message: `Quotation provided for lead: ${lead.name}`,
              leadId: lead.id,
            });
          }
        }
      }

      return { leadId: lead?.id };
    },
    onSuccess: ({ leadId }) => {
      toast({ title: "Quotation submitted ✓", description: "Lead status updated to Quoted. Employee notified." });
      queryClient.invalidateQueries({ queryKey: queryKeys.allQuotationRequests() });
      queryClient.invalidateQueries({ queryKey: ["responded-quotation-requests"] });
      queryClient.invalidateQueries({ queryKey: ["exec-dash-pending"] });
      queryClient.invalidateQueries({ queryKey: ["exec-analytics-pending"] });
      queryClient.invalidateQueries({ queryKey: ["exec-analytics-completed"] });
      if (leadId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotationRequests(leadId) });
        queryClient.invalidateQueries({ queryKey: ["quotations-for-lead", leadId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.lead(leadId) });
      }
      navigate("/execution", { state: { tab: "completed" } });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
    </div>
  );
  if (isError || !req) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Request not found.</p>
        <Button variant="outline" onClick={() => navigate("/execution")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Execution
        </Button>
      </div>
    );
  }

  const lead = req.leads as any;
  const td = (req.trip_details as any) ?? {};
  const isRevision = req.status === "revised";
  const isResponded = req.status === "responded";

  // ── Read-only view for already-responded requests ─────────────────────────

  if (isResponded) {
    return (
      <div className="flex flex-col -m-4 md:-m-6 h-[calc(100vh-3.5rem)]">
        {/* Header */}
        <div className="shrink-0 border-b px-6 py-4 flex items-center justify-between bg-background">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/execution", { state: { tab: "completed" } })}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-semibold text-base">Quotation Response</h1>
              <p className="text-xs text-muted-foreground">{lead?.name} · Price Breakdown</p>
            </div>
          </div>
          <Badge className="text-xs bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400">
            ✓ Responded
          </Badge>
        </div>

        {/* Two-column body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x">
          {/* Left: trip details (same as form view) */}
          <div className="overflow-y-auto p-6 space-y-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Employee Request</h2>
            <Section title="Trip Basics">
              {td.destination && <Row label="Destination" value={td.destination} />}
              {(td.days || td.nights) && <Row label="Duration" value={`${td.days ?? "?"}D / ${td.nights ?? "?"}N`} />}
              {(td.total_pax || td.travelers) && <Row label="Total Pax" value={td.total_pax ?? td.travelers} />}
              {(td.adults || td.children || td.senior_citizens) && (
                <Row
                  label="Breakdown"
                  value={[
                    td.adults && `${td.adults} Adults`,
                    td.children && td.children !== "0" && `${td.children} Children`,
                    td.senior_citizens && td.senior_citizens !== "0" && `${td.senior_citizens} Seniors`,
                  ].filter(Boolean).join(", ")}
                />
              )}
              {td.group_type && (
                <Row label="Group Type" value={td.group_type === "corporate" ? "Corporate / Students" : td.group_type} />
              )}
              {td.travel_start && td.travel_end && (
                <Row label="Travel Dates" value={`${td.travel_start} → ${td.travel_end}`} />
              )}
            </Section>

            {(td.accommodation?.length > 0 || td.meal_plan || td.food_preference?.length > 0) && (
              <Section title="Accommodation & Meals">
                {td.accommodation?.length > 0 && (
                  <Row
                    label="Hotels"
                    value={
                      <>
                        {(td.accommodation as string[]).join(", ")}
                        {td.accommodation_notes && (
                          <span className="block text-muted-foreground text-xs">{td.accommodation_notes}</span>
                        )}
                      </>
                    }
                  />
                )}
                {td.meal_plan && <Row label="Meals" value={MEAL_LABEL[td.meal_plan] ?? td.meal_plan} />}
                {td.food_preference?.length > 0 && (
                  <Row label="Food Pref" value={(td.food_preference as string[]).join(", ")} />
                )}
              </Section>
            )}

            {(td.package_type || td.vehicle_type) && (
              <Section title="Package & Transport">
                {td.package_type && (
                  <Row
                    label="Package"
                    value={
                      <>
                        {td.package_type === "land" ? "Land Package" : "Total Package"}
                        {td.package_type === "total" && td.travel_modes?.length > 0 && (
                          <span className="text-muted-foreground text-xs ml-1">
                            via {(td.travel_modes as string[]).join(", ")}
                          </span>
                        )}
                      </>
                    }
                  />
                )}
                {td.vehicle_type && (
                  <Row
                    label="Vehicle"
                    value={
                      <>
                        {td.vehicle_type}
                        {td.vehicle_pax && (
                          <span className="text-muted-foreground text-xs ml-1">for {td.vehicle_pax} pax</span>
                        )}
                      </>
                    }
                  />
                )}
              </Section>
            )}

            {td.budget_category && (
              <Section title="Budget">
                <Row label="Category" value={<span className="capitalize">{td.budget_category} Budget</span>} />
                {td.budget_estimate && (
                  <Row label="Estimate" value={`₹${Number(td.budget_estimate).toLocaleString("en-IN")}/pax`} />
                )}
              </Section>
            )}

            {(td.sightseeing || td.activities) && (
              <Section title="Sightseeing & Activities">
                {td.sightseeing && <Row label="Sightseeing" value={td.sightseeing} />}
                {td.activities && <Row label="Activities" value={td.activities} />}
              </Section>
            )}

            {(td.tickets_booked === "yes" || td.pickup_location || td.drop_location) && (
              <Section title="Tickets & Transfer">
                {td.tickets_booked === "yes" && (
                  <Row
                    label="Tickets Booked"
                    value={
                      <>
                        Yes
                        {td.booking_date && <span className="text-muted-foreground text-xs ml-1">· {td.booking_date}</span>}
                        {td.booking_travel_mode && <span className="text-muted-foreground text-xs ml-1">via {td.booking_travel_mode}</span>}
                      </>
                    }
                  />
                )}
                {(td.pickup_location || td.drop_location) && (
                  <Row label="Transfer" value={`${td.pickup_location ?? "—"} → ${td.drop_location ?? "—"}`} />
                )}
              </Section>
            )}

            {req.client_preferences && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-800 p-4">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">Sales Notes</p>
                <p className="text-sm">{req.client_preferences}</p>
              </div>
            )}
          </div>

          {/* Right: read-only pricing breakdown */}
          <div className="overflow-y-auto p-6 space-y-5">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Price Calculation</h2>

            {existingQuotations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quotation data found.</p>
            ) : (
              existingQuotations.map((q: any) => {
                const slots: any[] = (q.pricing_data as any)?.slots ?? [];
                return (
                  <div key={q.id} className="space-y-4">
                    {existingQuotations.length > 1 && (
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Version {q.version}
                      </p>
                    )}

                    <div className="space-y-4">
                      {slots.map((slot: any, si: number) => {
                        const rows: any[] = Array.isArray(slot.breakdown) ? slot.breakdown : [];
                        const margin = parseFloat(slot.margin) || 0;
                        const rowTotal = rows.reduce(
                          (sum: number, r: any) => sum + (parseFloat(r.qty) || 0) * (parseFloat(r.rate) || 0),
                          0
                        );
                        const total = rowTotal + margin;

                        return (
                          <div key={si} className="rounded-xl border bg-muted/20 overflow-hidden text-xs">
                            {/* Option header */}
                            <div className="grid grid-cols-2 px-4 py-3 border-b bg-green-50/60 dark:bg-green-950/20">
                              <span className="font-semibold text-green-800 dark:text-green-300 text-sm">
                                {slot.label || `Option ${si + 1}`}
                              </span>
                              <span className="text-right font-bold text-green-700 dark:text-green-400 text-sm">
                                {slot.price}
                              </span>
                            </div>

                            {/* Breakdown table — always visible */}
                            <div>
                              {/* Table header */}
                              <div className="grid grid-cols-[1fr_56px_100px_114px] bg-muted/50 border-b">
                                <div className="px-3 py-2 font-medium text-muted-foreground text-center">Title</div>
                                <div className="px-2 py-2 font-medium text-muted-foreground text-center">Units</div>
                                <div className="px-2 py-2 font-medium text-muted-foreground text-center">Rate (₹)</div>
                                <div className="px-3 py-2 font-medium text-muted-foreground text-right">Amount (₹)</div>
                              </div>

                              {/* Breakdown rows */}
                              {rows.length === 0 ? (
                                <div className="px-3 py-3 text-center text-muted-foreground text-[11px] border-b">
                                  No itemised breakdown — quoted as lump sum
                                </div>
                              ) : (
                                rows.map((r: any, ri: number) => {
                                  const qty = parseFloat(r.qty) || 0;
                                  const rate = parseFloat(r.rate) || 0;
                                  const amt = qty * rate;
                                  return (
                                    <div key={ri} className="grid grid-cols-[1fr_56px_100px_114px] border-b items-center hover:bg-muted/20">
                                      <div className="px-3 py-1.5 text-foreground">{r.title || "—"}</div>
                                      <div className="px-2 py-1.5 text-center text-muted-foreground">{qty || "—"}</div>
                                      <div className="px-2 py-1.5 text-center text-muted-foreground">
                                        {rate > 0 ? rate.toLocaleString("en-IN") : "—"}
                                      </div>
                                      <div className="px-3 py-1.5 text-right font-medium">
                                        {amt > 0 ? `₹${fmtINR(amt)}` : "—"}
                                      </div>
                                    </div>
                                  );
                                })
                              )}

                              {/* Margin row */}
                              {margin > 0 && (
                                <div className="grid grid-cols-[1fr_56px_100px_114px] border-b items-center bg-amber-50/40 dark:bg-amber-950/10">
                                  <div className="px-3 py-1.5 font-medium text-amber-700 dark:text-amber-400 text-center col-span-3">Margin</div>
                                  <div className="px-3 py-1.5 text-right font-medium">₹{fmtINR(margin)}</div>
                                </div>
                              )}

                              {/* Total / Quoted price row */}
                              <div className="grid grid-cols-[1fr_114px] bg-muted/40 items-center">
                                <div className="px-3 py-2 font-semibold text-xs">
                                  {rows.length > 0 ? "Total (calculated)" : "Quoted Price"}
                                </div>
                                <div className="px-3 py-2 text-right font-bold text-green-700 dark:text-green-400 text-xs">
                                  {total > 0 ? `₹${fmtINR(total)}` : slot.price || "—"}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {q.notes && (
                      <div className="rounded-xl border border-muted p-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                        <p className="text-sm">{q.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col -m-4 md:-m-6 h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="shrink-0 border-b px-6 py-4 flex items-center justify-between bg-background">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/execution")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-semibold text-base">Respond with Pricing</h1>
            <p className="text-xs text-muted-foreground">
              {lead?.name} · v{req.version}
              {isRevision && " · Revision"}
            </p>
          </div>
        </div>
        {isRevision && (
          <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400">
            <RotateCcw className="h-2.5 w-2.5 mr-1" />
            Revision Request
          </Badge>
        )}
      </div>

      {/* Two-column body */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x">

        {/* ── Left: Employee Request Details ─────────────────────────────── */}
        <div className="overflow-y-auto p-6 space-y-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Employee Request</h2>

          <Section title="Trip Basics">
            {td.destination && <Row label="Destination" value={td.destination} />}
            {(td.days || td.nights) && <Row label="Duration" value={`${td.days ?? "?"}D / ${td.nights ?? "?"}N`} />}
            {(td.total_pax || td.travelers) && <Row label="Total Pax" value={td.total_pax ?? td.travelers} />}
            {(td.adults || td.children || td.senior_citizens) && (
              <Row
                label="Breakdown"
                value={[
                  td.adults && `${td.adults} Adults`,
                  td.children && td.children !== "0" && `${td.children} Children`,
                  td.senior_citizens && td.senior_citizens !== "0" && `${td.senior_citizens} Seniors`,
                ].filter(Boolean).join(", ")}
              />
            )}
            {td.group_type && (
              <Row label="Group Type" value={td.group_type === "corporate" ? "Corporate / Students" : td.group_type} />
            )}
            {td.travel_start && td.travel_end && (
              <Row label="Travel Dates" value={`${td.travel_start} → ${td.travel_end}`} />
            )}
          </Section>

          {(td.accommodation?.length > 0 || td.meal_plan || td.food_preference?.length > 0) && (
            <Section title="Accommodation & Meals">
              {td.accommodation?.length > 0 && (
                <Row
                  label="Hotels"
                  value={
                    <>
                      {(td.accommodation as string[]).join(", ")}
                      {td.accommodation_notes && (
                        <span className="block text-muted-foreground text-xs">{td.accommodation_notes}</span>
                      )}
                    </>
                  }
                />
              )}
              {td.meal_plan && <Row label="Meals" value={MEAL_LABEL[td.meal_plan] ?? td.meal_plan} />}
              {td.food_preference?.length > 0 && (
                <Row label="Food Pref" value={(td.food_preference as string[]).join(", ")} />
              )}
            </Section>
          )}

          {(td.package_type || td.vehicle_type) && (
            <Section title="Package & Transport">
              {td.package_type && (
                <Row
                  label="Package"
                  value={
                    <>
                      {td.package_type === "land" ? "Land Package" : "Total Package"}
                      {td.package_type === "total" && td.travel_modes?.length > 0 && (
                        <span className="text-muted-foreground text-xs ml-1">
                          via {(td.travel_modes as string[]).join(", ")}
                        </span>
                      )}
                    </>
                  }
                />
              )}
              {td.vehicle_type && (
                <Row
                  label="Vehicle"
                  value={
                    <>
                      {td.vehicle_type}
                      {td.vehicle_pax && (
                        <span className="text-muted-foreground text-xs ml-1">for {td.vehicle_pax} pax</span>
                      )}
                    </>
                  }
                />
              )}
            </Section>
          )}

          {td.budget_category && (
            <Section title="Budget">
              <Row label="Category" value={<span className="capitalize">{td.budget_category} Budget</span>} />
              {td.budget_estimate && (
                <Row label="Estimate" value={`₹${Number(td.budget_estimate).toLocaleString("en-IN")}/pax`} />
              )}
            </Section>
          )}

          {(td.sightseeing || td.activities) && (
            <Section title="Sightseeing & Activities">
              {td.sightseeing && <Row label="Sightseeing" value={td.sightseeing} />}
              {td.activities && <Row label="Activities" value={td.activities} />}
            </Section>
          )}

          {(td.tickets_booked === "yes" || td.pickup_location || td.drop_location) && (
            <Section title="Tickets & Transfer">
              {td.tickets_booked === "yes" && (
                <Row
                  label="Tickets Booked"
                  value={
                    <>
                      Yes
                      {td.booking_date && <span className="text-muted-foreground text-xs ml-1">· {td.booking_date}</span>}
                      {td.booking_travel_mode && <span className="text-muted-foreground text-xs ml-1">via {td.booking_travel_mode}</span>}
                    </>
                  }
                />
              )}
              {(td.pickup_location || td.drop_location) && (
                <Row label="Transfer" value={`${td.pickup_location ?? "—"} → ${td.drop_location ?? "—"}`} />
              )}
            </Section>
          )}

          {req.client_preferences && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 dark:border-amber-800 p-4">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">Sales Notes</p>
              <p className="text-sm">{req.client_preferences}</p>
            </div>
          )}
        </div>

        {/* ── Right: Pricing Options ──────────────────────────────────────── */}
        <div className="overflow-y-auto p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Pricing Options</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Each option = one complete plan. Employee will compare all.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addSlot} type="button">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Option
            </Button>
          </div>

          <div className="space-y-4">
            {pricingSlots.map((slot, idx) => {
              const slotTotal = calcSlotTotal(slot);
              const hasBreakdownData =
                slot.breakdown.some((r) => r.title || r.qty || r.rate) || !!slot.margin;

              return (
                <div key={slot.id} className="rounded-xl border bg-muted/20 overflow-hidden">
                  {/* Option header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <span className="text-xs font-semibold uppercase tracking-wide">Option {idx + 1}</span>
                    {pricingSlots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSlot(slot.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Label */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Label / Plan Description</Label>
                      <Input
                        className="mt-1 text-sm"
                        value={slot.label}
                        onChange={(e) => updateSlot(slot.id, "label", e.target.value)}
                        placeholder={
                          td.accommodation?.[idx]
                            ? `e.g. ${td.accommodation[idx]} Hotel + ${
                                td.meal_plan === "all-meals" ? "All Meals"
                                : td.meal_plan === "breakfast-dinner" ? "Breakfast + Dinner"
                                : "Breakfast"
                              }`
                            : "e.g. 3 Star Hotel + Breakfast Only"
                        }
                      />
                    </div>

                    {/* ── Cost Breakdown ── */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleBreakdown(slot.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors mb-2"
                      >
                        {slot.showBreakdown ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        Cost Breakdown
                        {!slot.showBreakdown && hasBreakdownData && (
                          <span className="ml-1 text-[10px] font-normal text-green-600 dark:text-green-400 normal-case tracking-normal">
                            · ₹{fmtINR(slotTotal)} total
                          </span>
                        )}
                      </button>

                      {slot.showBreakdown && (
                        <div className="rounded-lg border overflow-hidden text-xs">
                          {/* Table header — Title | Qty | Rate | Amount | Delete */}
                          <div className="grid grid-cols-[1fr_56px_100px_114px_28px] bg-muted/50 border-b">
                            <div className="px-3 py-2 font-medium text-muted-foreground text-center">Title</div>
                            <div className="px-2 py-2 font-medium text-muted-foreground text-center">Units</div>
                            <div className="px-2 py-2 font-medium text-muted-foreground text-center">Rate (₹)</div>
                            <div className="px-3 py-2 font-medium text-muted-foreground text-right">Amount (₹)</div>
                            <div />
                          </div>

                          {/* Dynamic rows */}
                          {slot.breakdown.length === 0 && (
                            <div className="px-3 py-3 text-center text-muted-foreground text-[11px]">
                              No rows yet — click Add Row below
                            </div>
                          )}

                          {slot.breakdown.map((row) => {
                            const amt = calcRowAmount(row);
                            return (
                              <div
                                key={row.id}
                                className="grid grid-cols-[1fr_56px_100px_114px_28px] border-b last:border-b items-center hover:bg-muted/20"
                              >
                                <input
                                  className="px-2 py-1.5 text-xs font-normal bg-transparent outline-none focus:ring-1 focus:ring-ring rounded-sm min-w-0"
                                  value={row.title}
                                  onChange={(e) => updateBreakdownRow(slot.id, row.id, "title", e.target.value)}
                                  placeholder="e.g. Transport"
                                />
                                <input
                                  className="px-1 py-1.5 text-xs font-normal text-center bg-transparent outline-none focus:ring-1 focus:ring-ring rounded-sm w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={row.qty}
                                  onChange={(e) => updateBreakdownRow(slot.id, row.id, "qty", e.target.value)}
                                  placeholder="0"
                                  type="number"
                                  min="0"
                                />
                                <input
                                  className="px-1 py-1.5 text-xs font-normal text-center bg-transparent outline-none focus:ring-1 focus:ring-ring rounded-sm w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={row.rate}
                                  onChange={(e) => updateBreakdownRow(slot.id, row.id, "rate", e.target.value)}
                                  placeholder="0"
                                  type="number"
                                  min="0"
                                />
                                <div className="px-3 py-1.5 text-xs font-normal text-right text-foreground">
                                  {amt > 0 ? fmtINR(amt) : <span className="text-muted-foreground">—</span>}
                                </div>
                                <div className="flex items-center justify-center">
                                  <button
                                    type="button"
                                    onClick={() => removeBreakdownRow(slot.id, row.id)}
                                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* Margin row */}
                          <div className="grid grid-cols-[1fr_56px_100px_114px_28px] border-t items-center bg-amber-50/40 dark:bg-amber-950/10">
                            <div className="px-2 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 text-center">Margin</div>
                            <div className="col-span-2 px-2 py-1.5 text-[10px] text-muted-foreground text-center">manual →</div>
                            <input
                              className="px-3 py-1.5 text-xs font-normal text-right bg-transparent outline-none focus:ring-1 focus:ring-ring rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={slot.margin}
                              onChange={(e) => updateMargin(slot.id, e.target.value)}
                              placeholder="0"
                              type="number"
                              min="0"
                            />
                            <div />
                          </div>

                          {/* Total row */}
                          <div className="grid grid-cols-[1fr_56px_100px_114px_28px] border-t bg-muted/40 items-center">
                            <div className="px-2 py-2 text-xs font-semibold col-span-3">Total</div>
                            <div className="px-3 py-2 text-xs font-bold text-right text-green-700 dark:text-green-400">
                              {slotTotal > 0 ? `₹${fmtINR(slotTotal)}` : <span className="text-muted-foreground font-normal">—</span>}
                            </div>
                            <div />
                          </div>

                          {/* Add row button */}
                          <div className="border-t px-3 py-2">
                            <button
                              type="button"
                              onClick={() => addBreakdownRow(slot.id)}
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Plus className="h-3 w-3" /> Add Row
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Record button + Price field */}
                    <div className="space-y-2">
                      {slot.showBreakdown && slotTotal > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full h-8 text-xs border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
                          onClick={() => recordPrice(slot.id)}
                        >
                          <Calculator className="h-3.5 w-3.5 mr-1.5" />
                          Record Price — ₹{fmtINR(slotTotal)}
                        </Button>
                      )}
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Price
                          {!slot.showBreakdown && hasBreakdownData && (
                            <button
                              type="button"
                              onClick={() => toggleBreakdown(slot.id)}
                              className="ml-2 text-[10px] text-blue-500 hover:text-blue-700 font-normal underline underline-offset-2"
                            >
                              View breakdown
                            </button>
                          )}
                        </Label>
                        <Input
                          className="mt-1 text-sm"
                          value={slot.price}
                          onChange={(e) => updateSlot(slot.id, "price", e.target.value)}
                          placeholder="e.g. ₹4,800 per pax"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {td.accommodation?.length > 1 && (
            <p className="text-xs text-muted-foreground p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              💡 Client requested {(td.accommodation as string[]).join(", ")} — consider one option per hotel category.
            </p>
          )}

          <div>
            <Label>
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              className="mt-1 resize-none"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Inclusions, exclusions, validity, seasonal conditions..."
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="ghost" onClick={() => navigate("/execution")}>
              Cancel
            </Button>
            <Button
              onClick={() => submitQuotation.mutate()}
              disabled={
                submitQuotation.isPending ||
                pricingSlots.every((s) => !s.label.trim() && !s.price.trim())
              }
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitQuotation.isPending ? "Submitting…" : "Submit Quotation ✓"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
