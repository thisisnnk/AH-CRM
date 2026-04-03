import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { sendNotification } from "@/utils/notificationHelper";
import { logActivity } from "@/utils/activityLogger";
import { format } from "date-fns";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  IndianRupee,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Users,
  CalendarDays,
  Hotel,
  Car,
  Wallet,
  Mountain,
  CheckCircle2,
  Clock,
  Layers,
  Ticket,
  Trash2,
} from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_TITLES = [
  "Trip Basics",
  "Accommodation & Meals",
  "Package Type",
  "Transport",
  "Budget",
  "Activities & Sightseeing",
  "Group Details",
  "Booking & Logistics",
];

const STEP_SHORT = ["Trip", "Stay", "Package", "Transport", "Budget", "Activities", "Group", "Booking"];

const STEP_ICONS = [CalendarDays, Hotel, Layers, Car, Wallet, Mountain, Users, Ticket];

const VEHICLE_TYPES: { label: string; maxPax: number }[] = [
  { label: "Sedan", maxPax: 4 },
  { label: "SUV", maxPax: 7 },
  { label: "Tempo Traveller", maxPax: 14 },
  { label: "Mini Bus (20–25 seater)", maxPax: 25 },
  { label: "Bus (up to 54 seater)", maxPax: 54 },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuotationFormData {
  // Step 1
  destination: string;
  days: string;
  nights: string;
  travel_start: string;
  travel_end: string;
  total_pax: string;
  // Step 2
  accommodation: string[];
  accommodation_notes: string;
  meal_plan: string;
  food_preference: string[];
  // Step 3
  package_type: string;
  travel_modes: string[];
  // Step 4
  vehicle_type: string;
  vehicle_pax: string;
  // Step 5
  budget_category: string;
  budget_estimate: string;
  // Step 6
  sightseeing: string;
  activities: string;
  // Step 7
  group_type: string;
  adults: string;
  children: string;
  senior_citizens: string;
  // Step 8
  tickets_booked: string;
  booking_date: string;
  booking_travel_mode: string;
  pickup_location: string;
  drop_location: string;
  additional_notes: string;
}

interface Props {
  leadId: string;
  lead: {
    destination?: string | null;
    travelers?: number | null;
    trip_duration?: string | null;
    assigned_employee_id?: string | null;
    name?: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDefault(lead: Props["lead"]): QuotationFormData {
  return {
    destination: lead.destination ?? "",
    days: "",
    nights: "",
    travel_start: "",
    travel_end: "",
    total_pax: String(lead.travelers ?? ""),
    accommodation: [],
    accommodation_notes: "",
    meal_plan: "",
    food_preference: [],
    package_type: "",
    travel_modes: [],
    vehicle_type: "",
    vehicle_pax: String(lead.travelers ?? ""),
    budget_category: "",
    budget_estimate: "",
    sightseeing: "",
    activities: "",
    group_type: "",
    adults: "",
    children: "0",
    senior_citizens: "0",
    tickets_booked: "",
    booking_date: "",
    booking_travel_mode: "",
    pickup_location: "",
    drop_location: "",
    additional_notes: "",
  };
}

function fromTripDetails(td: any, lead: Props["lead"]): QuotationFormData {
  return {
    destination: td.destination ?? lead.destination ?? "",
    days: td.days ?? "",
    nights: td.nights ?? "",
    travel_start: td.travel_start ?? "",
    travel_end: td.travel_end ?? "",
    total_pax: td.total_pax ?? String(lead.travelers ?? ""),
    accommodation: td.accommodation ?? [],
    accommodation_notes: td.accommodation_notes ?? "",
    meal_plan: td.meal_plan ?? "",
    food_preference: td.food_preference ?? [],
    package_type: td.package_type ?? "",
    travel_modes: td.travel_modes ?? [],
    vehicle_type: td.vehicle_type ?? "",
    vehicle_pax: td.vehicle_pax ?? String(lead.travelers ?? ""),
    budget_category: td.budget_category ?? "",
    budget_estimate: td.budget_estimate ?? "",
    sightseeing: td.sightseeing ?? "",
    activities: td.activities ?? "",
    group_type: td.group_type ?? "",
    adults: td.adults ?? "",
    children: td.children ?? "0",
    senior_citizens: td.senior_citizens ?? "0",
    tickets_booked: td.tickets_booked ?? "",
    booking_date: td.booking_date ?? "",
    booking_travel_mode: td.booking_travel_mode ?? "",
    pickup_location: td.pickup_location ?? "",
    drop_location: td.drop_location ?? "",
    additional_notes: td.additional_notes ?? "",
  };
}

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function suggestVehicle(pax: number): string {
  if (pax <= 4) return "Sedan";
  if (pax <= 7) return "SUV";
  if (pax <= 14) return "Tempo Traveller";
  if (pax <= 25) return "Mini Bus (20–25 seater)";
  return "Bus (up to 54 seater)";
}

/** Returns first validation failure: { step, message } or null if all good */
function validateAll(f: QuotationFormData): { step: number; message: string } | null {
  if (!f.destination.trim()) return { step: 1, message: "Destination is required." };
  if (!f.days.trim()) return { step: 1, message: "Number of days is required." };
  if (!f.total_pax.trim()) return { step: 1, message: "Total number of pax is required." };
  if (f.accommodation.length === 0) return { step: 2, message: "Select at least one accommodation type." };
  if (!f.meal_plan) return { step: 2, message: "Select a meal plan." };
  if (f.food_preference.length === 0) return { step: 2, message: "Select food preference (Veg / Non-Veg)." };
  if (!f.package_type) return { step: 3, message: "Select a package type." };
  if (!f.budget_category) return { step: 5, message: "Select a budget category." };
  if (!f.group_type) return { step: 7, message: "Select a group type." };
  if (!f.adults.trim()) return { step: 7, message: "Number of adults is required." };
  if (!f.pickup_location.trim()) return { step: 8, message: "Pickup location is required." };
  if (!f.drop_location.trim()) return { step: 8, message: "Drop location is required." };
  return null;
}

/** Steps that have incomplete required fields (for error indicators) */
function stepsWithErrors(f: QuotationFormData): Set<number> {
  const out = new Set<number>();
  if (!f.destination.trim() || !f.days.trim() || !f.total_pax.trim()) out.add(1);
  if (f.accommodation.length === 0 || !f.meal_plan || f.food_preference.length === 0) out.add(2);
  if (!f.package_type) out.add(3);
  if (!f.budget_category) out.add(5);
  if (!f.group_type || !f.adults.trim()) out.add(7);
  if (!f.pickup_location.trim() || !f.drop_location.trim()) out.add(8);
  return out;
}

// ─── TripDetailView ───────────────────────────────────────────────────────────
// Exported so ExecutionPage can import & reuse it.

export function TripDetailView({ tripDetails }: { tripDetails: any }) {
  const d = tripDetails ?? {};
  const mealLabel: Record<string, string> = {
    breakfast: "Breakfast Only (CP)",
    "breakfast-dinner": "Breakfast + Dinner (MAP)",
    "all-meals": "All Meals B+L+D (AP)",
  };

  return (
    <div className="space-y-2 text-sm">
      {/* Destination + duration */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {d.destination && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Destination: </span>
            <span className="font-semibold">{d.destination}</span>
          </div>
        )}
        {(d.days || d.nights) && (
          <div>
            <span className="text-muted-foreground">Duration: </span>
            <span className="font-medium">{d.days ?? "?"}D / {d.nights ?? "?"}N</span>
          </div>
        )}
        {d.trip_duration && !d.days && (
          <div>
            <span className="text-muted-foreground">Duration: </span>
            <span className="font-medium">{d.trip_duration}</span>
          </div>
        )}
        {(d.total_pax || d.travelers) && (
          <div>
            <span className="text-muted-foreground">Total Pax: </span>
            <span className="font-medium">{d.total_pax ?? d.travelers}</span>
          </div>
        )}
        {d.travel_start && d.travel_end && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Dates: </span>
            <span className="font-medium">{d.travel_start} → {d.travel_end}</span>
          </div>
        )}
      </div>

      {/* Pax breakdown */}
      {(d.adults || d.children || d.senior_citizens) && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {d.adults && (
            <span className="px-2 py-0.5 bg-muted rounded-full">Adults: <strong>{d.adults}</strong></span>
          )}
          {d.children && d.children !== "0" && (
            <span className="px-2 py-0.5 bg-muted rounded-full">Children: <strong>{d.children}</strong></span>
          )}
          {d.senior_citizens && d.senior_citizens !== "0" && (
            <span className="px-2 py-0.5 bg-muted rounded-full">Seniors: <strong>{d.senior_citizens}</strong></span>
          )}
        </div>
      )}

      {/* Group type */}
      {d.group_type && (
        <div>
          <span className="text-muted-foreground">Group: </span>
          <span className="font-medium capitalize">
            {d.group_type === "corporate" ? "Corporate / Students" : d.group_type}
          </span>
        </div>
      )}

      {/* Accommodation */}
      {d.accommodation?.length > 0 && (
        <div>
          <span className="text-muted-foreground">Hotels: </span>
          <span className="font-medium">{(d.accommodation as string[]).join(", ")}</span>
          {d.accommodation_notes && (
            <span className="text-muted-foreground text-xs ml-1.5 italic">· {d.accommodation_notes}</span>
          )}
        </div>
      )}

      {/* Meal plan + food preference */}
      {d.meal_plan && (
        <div>
          <span className="text-muted-foreground">Meals: </span>
          <span className="font-medium">{mealLabel[d.meal_plan] ?? d.meal_plan}</span>
          {d.food_preference?.length > 0 && (
            <span className="text-muted-foreground text-xs ml-1.5">
              · {(d.food_preference as string[]).join(" + ")}
            </span>
          )}
        </div>
      )}

      {/* Package */}
      {d.package_type && (
        <div>
          <span className="text-muted-foreground">Package: </span>
          <span className="font-medium">
            {d.package_type === "land" ? "Land Package" : "Total Package"}
          </span>
          {d.package_type === "total" && d.travel_modes?.length > 0 && (
            <span className="text-muted-foreground ml-1.5 text-xs">
              via {(d.travel_modes as string[]).join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Vehicle */}
      {d.vehicle_type && (
        <div>
          <span className="text-muted-foreground">Vehicle: </span>
          <span className="font-medium">{d.vehicle_type}</span>
          {d.vehicle_pax && (
            <span className="text-muted-foreground text-xs ml-1.5">for {d.vehicle_pax} pax</span>
          )}
        </div>
      )}

      {/* Budget */}
      {d.budget_category && (
        <div>
          <span className="text-muted-foreground">Budget: </span>
          <span className="font-medium capitalize">{d.budget_category} Budget</span>
          {d.budget_estimate && (
            <span className="text-muted-foreground text-xs ml-1.5">
              · Est. ₹{Number(d.budget_estimate).toLocaleString("en-IN")}/pax
            </span>
          )}
        </div>
      )}

      {/* Sightseeing + activities */}
      {d.sightseeing && (
        <div>
          <span className="text-muted-foreground">Sightseeing: </span>
          {d.sightseeing}
        </div>
      )}
      {d.activities && (
        <div>
          <span className="text-muted-foreground">Activities: </span>
          {d.activities}
        </div>
      )}

      {/* Tickets */}
      {d.tickets_booked === "yes" && (
        <div>
          <span className="text-muted-foreground">Tickets Booked: </span>
          <span className="font-medium">Yes</span>
          {d.booking_date && (
            <span className="text-muted-foreground text-xs ml-1.5">· {d.booking_date}</span>
          )}
          {d.booking_travel_mode && (
            <span className="text-muted-foreground text-xs ml-1.5">via {d.booking_travel_mode}</span>
          )}
        </div>
      )}

      {/* Pickup / Drop */}
      {(d.pickup_location || d.drop_location) && (
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium">{d.pickup_location || "—"}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-medium">{d.drop_location || "—"}</span>
        </div>
      )}
    </div>
  );
}

// ─── QuotationTab ─────────────────────────────────────────────────────────────

export function QuotationTab({ leadId, lead }: Props) {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const canRequest = role === "admin" || role === "employee";

  // Dialog state
  const [open, setOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isRevision, setIsRevision] = useState(false);
  const [form, setForm] = useState<QuotationFormData>(() => makeDefault(lead));
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Multi-expand accordion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const set = <K extends keyof QuotationFormData>(key: K, val: QuotationFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  // ── Real-time subscription ─────────────────────────────────────────────────
  // NOTE: Column filters on postgres_changes require REPLICA IDENTITY FULL.
  // We subscribe to the whole table (no filter) and match by leadId in callback.
  // A refetchInterval below is the guaranteed fallback in case the WS event drops.

  useEffect(() => {
    if (!leadId || !user) return;

    const channel = supabase
      .channel(`qt-${leadId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quotation_requests" },
        (payload) => {
          const updated = payload.new as any;
          // Only act on updates that belong to this lead
          if (updated?.lead_id !== leadId) return;
          if (updated?.status === "responded") {
            toast({
              title: "Quotation received!",
              description: "Execution team has submitted pricing options.",
            });
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.quotationRequests(leadId) });
          queryClient.invalidateQueries({ queryKey: ["quotations-for-lead", leadId] });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quotation_requests" },
        (payload) => {
          const inserted = payload.new as any;
          if (inserted?.lead_id !== leadId) return;
          queryClient.invalidateQueries({ queryKey: queryKeys.quotationRequests(leadId) });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "quotation_requests" },
        (payload) => {
          const deleted = payload.old as any;
          if (deleted?.lead_id !== leadId) return;
          queryClient.invalidateQueries({ queryKey: queryKeys.quotationRequests(leadId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.allQuotationRequests() });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quotations" },
        () => {
          // Can't filter quotations by leadId here (no direct column), refetch both.
          queryClient.invalidateQueries({ queryKey: ["quotations-for-lead", leadId] });
          queryClient.invalidateQueries({ queryKey: queryKeys.quotationRequests(leadId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, user?.id, queryClient]);

  // ── Queries ───────────────────────────────────────────────────────────────────

  const { data: requests = [], isLoading, isError } = useQuery({
    queryKey: queryKeys.quotationRequests(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotation_requests")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!leadId && !!user,
    // Poll every 10 s while any request is still pending/revised — ensures status
    // updates even if the real-time WebSocket event is missed.
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const hasPending = data?.some(
        (r) => r.status === "pending" || r.status === "revised"
      );
      return hasPending ? 10_000 : false;
    },
  });

  const requestIds = requests.map((r) => r.id);

  const { data: quotations = [] } = useQuery({
    queryKey: ["quotations-for-lead", leadId],
    queryFn: async () => {
      if (requestIds.length === 0) return [];
      const { data, error } = await supabase
        .from("quotations")
        .select("*")
        .in("request_id", requestIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: requestIds.length > 0,
  });

  // ── Dialog helpers ────────────────────────────────────────────────────────────

  function openNew() {
    setForm(makeDefault(lead));
    setIsRevision(false);
    setCurrentStep(1);
    setAttemptedSubmit(false);
    setSubmitError(null);
    setOpen(true);
  }

  function openRevision(req: any) {
    const td = (req.trip_details as any) ?? {};
    setForm(fromTripDetails(td, lead));
    setIsRevision(true);
    setCurrentStep(1);
    setAttemptedSubmit(false);
    setSubmitError(null);
    setOpen(true);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  const submitRequest = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // ── Critical: insert the quotation request ────────────────────────────
      const nextVersion = requests.length + 1;
      const { error: reqErr } = await supabase.from("quotation_requests").insert({
        lead_id: leadId,
        version: nextVersion,
        trip_details: form as any,
        client_preferences: form.additional_notes || null,
        required_services: [],
        status: isRevision ? "revised" : "pending",
        created_by: user.id,
      });
      if (reqErr) throw reqErr;

      // ── Non-critical: fire-and-forget logging + notifications ─────────────
      // These must NOT block the mutation — any failure here is silent.
      const label = isRevision ? "Revision requested" : "Quotation requested";
      const notifMsg = `${isRevision ? "Revision requested" : "New quotation request"} — ${lead.name ?? leadId}`;

      logActivity({
        leadId,
        userId: user.id,
        userRole: role,
        action: label,
        details: `${form.destination} · ${form.total_pax} pax · ${form.days}D/${form.nights}N`,
        entityType: "quotation_requests",
      }).catch(() => {});

      supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "execution" as any)
        .then(({ data }) => {
          (data ?? []).forEach((u) =>
            sendNotification({ recipientId: u.user_id, type: "quotation_request", message: notifMsg, leadId }).catch(() => {})
          );
        })
        .catch(() => {});

      supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin" as any)
        .then(({ data }) => {
          (data ?? []).forEach((u) => {
            if (u.user_id !== user.id) {
              sendNotification({ recipientId: u.user_id, type: "quotation_request", message: notifMsg, leadId }).catch(() => {});
            }
          });
        })
        .catch(() => {});
    },
    onSuccess: () => {
      setSubmitError(null);
      toast({
        title: isRevision ? "Revision request sent!" : "Quotation request sent!",
        description: "Execution team has been notified.",
      });
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.quotationRequests(leadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allQuotationRequests() });
    },
    onError: (err: any) => {
      setAttemptedSubmit(true);
      const msg = err?.message ?? "Something went wrong. Please try again.";
      setSubmitError(msg);
      toast({ title: "Submission failed", description: msg, variant: "destructive" });
    },
  });

  // ── Delete request ────────────────────────────────────────────────────────────

  const deleteRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("delete_quotation_request", {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Request deleted", description: "The quotation request has been removed." });
      queryClient.invalidateQueries({ queryKey: queryKeys.quotationRequests(leadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.allQuotationRequests() });
    },
    onError: (err: any) => {
      console.error("[deleteRequest]", err);
      toast({ title: "Delete failed", description: err?.message ?? "Could not delete the request.", variant: "destructive" });
    },
  });

  // ── Step error indicators (only after first submit attempt) ───────────────────

  const errorSteps = attemptedSubmit ? stepsWithErrors(form) : new Set<number>();

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading...</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive py-4">Failed to load quotation data. Please refresh the page.</p>;
  }

  return (
    <div className="space-y-3">
      {/* ── Header ──────────────────────────────────────────────────────────────── */}
      {canRequest && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {requests.length === 0 ? "No quotation requests yet." : `${requests.length} request(s)`}
          </p>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Request Quotation
          </Button>
        </div>
      )}

      {/* ── Accordion — multi-expand ─────────────────────────────────────────── */}
      {requests.map((req) => {
        const resps = quotations.filter((q) => q.request_id === req.id);
        const isExpanded = expandedIds.has(req.id);
        const td = (req.trip_details as any) ?? {};
        const isResponded = req.status === "responded" || resps.length > 0;
        const isPending = !isResponded && req.status === "pending";
        const isRevised = !isResponded && req.status === "revised";

        return (
          <div
            key={req.id}
            className={cn(
              "border rounded-xl overflow-hidden transition-all",
              isResponded
                ? "border-green-300 dark:border-green-700"
                : isRevised
                ? "border-amber-300 dark:border-amber-700"
                : "border-border"
            )}
          >
            {/* Row header — click to toggle */}
            <button
              className={cn(
                "w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors",
                isResponded
                  ? "hover:bg-green-50/60 dark:hover:bg-green-950/20"
                  : "hover:bg-muted/30",
                isExpanded && (isResponded
                  ? "bg-green-50/40 dark:bg-green-950/10"
                  : "bg-muted/10")
              )}
              onClick={() => toggleExpand(req.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Status icon */}
                {isResponded ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : isPending ? (
                  <Clock className="h-5 w-5 text-muted-foreground/50 shrink-0" />
                ) : (
                  <RotateCcw className="h-5 w-5 text-amber-500 shrink-0" />
                )}

                <div className="min-w-0">
                  {/* Title + badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      Request v{req.version}
                    </span>

                    {isResponded && (
                      <Badge className="text-xs bg-green-600 hover:bg-green-600 text-white border-green-600">
                        ✓ Responded
                      </Badge>
                    )}
                    {isPending && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Pending
                      </Badge>
                    )}
                    {isRevised && (
                      <Badge className="text-xs bg-amber-500 hover:bg-amber-500 text-white border-amber-500">
                        Revision
                      </Badge>
                    )}
                    {resps.length > 0 && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        {resps.length} pricing option{resps.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* Summary line */}
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[
                      td.destination,
                      (td.days || td.nights) && `${td.days ?? "?"}D/${td.nights ?? "?"}N`,
                      (td.total_pax || td.travelers) && `${td.total_pax ?? td.travelers} pax`,
                      req.created_at && format(new Date(req.created_at), "MMM d, yyyy"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                {canRequest && req.status !== "responded" && (
                  <span
                    role="button"
                    title="Delete request"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(req.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* ── Expanded body ──────────────────────────────────────────────── */}
            {isExpanded && (
              <div
                className={cn(
                  "border-t px-4 pb-4",
                  isResponded
                    ? "bg-green-50/20 dark:bg-green-950/10"
                    : "bg-muted/5"
                )}
              >
                {/* Trip detail dump */}
                <div className="pt-3">
                  <TripDetailView tripDetails={td} />
                </div>

                {/* Sales notes */}
                {req.client_preferences && (
                  <div className="mt-3 p-2.5 rounded-md bg-muted/40 text-sm">
                    <span className="font-medium text-muted-foreground">Sales Notes: </span>
                    {req.client_preferences}
                  </div>
                )}

                {/* Request revision button (only on responded requests) */}
                {canRequest && isResponded && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => openRevision(req)}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Request Revision
                  </Button>
                )}

                {/* Waiting indicator */}
                {isPending && resps.length === 0 && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    Waiting for execution team to respond…
                  </div>
                )}

                {/* ── Pricing responses — all visible at once ──────────────── */}
                {resps.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-sm font-semibold mb-2.5">
                      Pricing Options from Execution Team
                    </p>
                    <div className="space-y-2.5">
                      {resps.map((q) => {
                        const pricing = (q.pricing_data as any) ?? {};
                        const isSlotFormat = Array.isArray(pricing.slots);

                        return (
                          <div
                            key={q.id}
                            className="p-3.5 rounded-xl border-l-4 border-green-500 bg-white dark:bg-green-950/20 shadow-sm space-y-2"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                                Quotation v{q.version}
                              </p>
                              {q.created_at && (
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(q.created_at), "MMM d, HH:mm")}
                                </p>
                              )}
                            </div>

                            {isSlotFormat ? (
                              // New slot format
                              <div className="divide-y divide-green-100 dark:divide-green-800">
                                {(pricing.slots as { label: string; price: string }[]).map(
                                  (slot, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                                    >
                                      <span className="text-sm text-green-800 dark:text-green-300 leading-snug">
                                        {slot.label || `Option ${idx + 1}`}
                                      </span>
                                      <span className="text-sm font-bold text-green-700 dark:text-green-400 shrink-0">
                                        {slot.price}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            ) : (
                              // Legacy category format
                              <div className="space-y-1">
                                {Object.entries(pricing).map(([k, v]) => (
                                  <div key={k} className="flex justify-between text-xs">
                                    <span className="text-muted-foreground capitalize">{k}</span>
                                    <span>₹{Number(v).toLocaleString("en-IN")}</span>
                                  </div>
                                ))}
                                {q.total_cost != null && (
                                  <div className="flex items-center justify-between text-sm font-bold pt-1.5 border-t border-green-200 dark:border-green-800">
                                    <span>Total</span>
                                    <div className="flex items-center gap-0.5">
                                      <IndianRupee className="h-3.5 w-3.5" />
                                      {Number(q.total_cost).toLocaleString("en-IN")}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {q.notes && (
                              <p className="text-xs text-muted-foreground italic pt-1 border-t border-green-100 dark:border-green-800">
                                {q.notes}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {requests.length === 0 && !canRequest && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No quotation requests for this lead.
        </p>
      )}

      {/* ── 8-Step Quotation Dialog ──────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-xl p-0 max-h-[94vh] flex flex-col gap-0">

          {/* ── Sticky header + step navigation ────────────────────────────── */}
          <div className="shrink-0 border-b px-6 pt-5 pb-4 bg-background">
            <DialogHeader>
              <DialogTitle>
                {isRevision ? "Request Revision" : "New Quotation Request"}
              </DialogTitle>
            </DialogHeader>

            {/* 8 step circles — all clickable for free navigation */}
            <div className="flex items-start mt-4 gap-0">
              {Array.from({ length: 8 }, (_, i) => i + 1).map((s) => {
                const Icon = STEP_ICONS[s - 1];
                const done = s < currentStep;
                const active = s === currentStep;
                const hasErr = errorSteps.has(s);

                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setCurrentStep(s)}
                    className="flex-1 flex flex-col items-center gap-0.5 py-1 focus:outline-none group"
                    title={STEP_TITLES[s - 1]}
                  >
                    {/* Circle */}
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                        active && "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30",
                        done && !hasErr && "bg-green-500 text-white",
                        done && hasErr && "bg-red-400 text-white",
                        !done && hasErr && !active && "bg-red-100 text-red-600 border-2 border-red-300 dark:bg-red-900/30",
                        !active && !done && !hasErr && "bg-muted text-muted-foreground group-hover:bg-muted/80"
                      )}
                    >
                      {done ? (hasErr ? "!" : "✓") : active ? <Icon className="h-3 w-3" /> : s}
                    </div>
                    {/* Short label */}
                    <span
                      className={cn(
                        "text-[9px] leading-none hidden sm:block text-center truncate w-full px-0.5",
                        active ? "text-primary font-semibold" : "text-muted-foreground"
                      )}
                    >
                      {STEP_SHORT[s - 1]}
                    </span>
                    {/* Connector line */}
                    {s < 8 && (
                      <div
                        className={cn(
                          "hidden sm:block absolute h-px",
                          done ? "bg-green-500" : "bg-muted"
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-xs font-semibold text-center mt-2 text-muted-foreground tracking-widest uppercase">
              {currentStep} / 8 — {STEP_TITLES[currentStep - 1]}
            </p>
          </div>

          {/* ── Scrollable form body ─────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* ════════════════ STEP 1: Trip Basics ════════════════ */}
            {currentStep === 1 && (
              <>
                <div>
                  <Label>
                    Destination <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="mt-1"
                    value={form.destination}
                    onChange={(e) => set("destination", e.target.value)}
                    placeholder="e.g. Manali, Himachal Pradesh"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>
                      Days <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min="1"
                      value={form.days}
                      onChange={(e) => set("days", e.target.value)}
                      placeholder="5"
                    />
                  </div>
                  <div>
                    <Label>Nights</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min="0"
                      value={form.nights}
                      onChange={(e) => set("nights", e.target.value)}
                      placeholder="4"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <Input
                      className="mt-1"
                      type="date"
                      value={form.travel_start}
                      onChange={(e) => set("travel_start", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input
                      className="mt-1"
                      type="date"
                      value={form.travel_end}
                      onChange={(e) => set("travel_end", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label>
                    Total Pax (people) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="1"
                    value={form.total_pax}
                    onChange={(e) => {
                      set("total_pax", e.target.value);
                      // Auto-sync vehicle pax
                      set("vehicle_pax", e.target.value);
                    }}
                    placeholder="e.g. 12"
                  />
                </div>
              </>
            )}

            {/* ════════════════ STEP 2: Accommodation & Meals ════════════════ */}
            {currentStep === 2 && (
              <>
                <div>
                  <Label className="font-semibold">
                    Hotel Category <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                    Select all that apply — each generates a separate pricing option
                  </p>
                  <div className="space-y-2">
                    {["3 Star", "4 Star", "5 Star"].map((opt) => (
                      <label
                        key={opt}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          form.accommodation.includes(opt) && "border-primary bg-primary/5"
                        )}
                      >
                        <Checkbox
                          checked={form.accommodation.includes(opt)}
                          onCheckedChange={() =>
                            set("accommodation", toggle(form.accommodation, opt))
                          }
                        />
                        <span className="text-sm font-medium">{opt} Hotel</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Accommodation Notes</Label>
                  <Textarea
                    className="mt-1 resize-none"
                    rows={2}
                    value={form.accommodation_notes}
                    onChange={(e) => set("accommodation_notes", e.target.value)}
                    placeholder="e.g. Need 2 separate rooms, near beach, early check-in required..."
                  />
                </div>

                <Separator />

                <div>
                  <Label className="font-semibold">
                    Meal Plan <span className="text-destructive">*</span>
                  </Label>
                  <RadioGroup
                    value={form.meal_plan}
                    onValueChange={(v) => set("meal_plan", v)}
                    className="mt-2 space-y-2"
                  >
                    {[
                      { value: "breakfast", label: "Breakfast Only (CP)" },
                      { value: "breakfast-dinner", label: "Breakfast + Dinner (MAP)" },
                      { value: "all-meals", label: "All Meals — Breakfast + Lunch + Dinner (AP)" },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          form.meal_plan === opt.value && "border-primary bg-primary/5"
                        )}
                      >
                        <RadioGroupItem value={opt.value} />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label className="font-semibold">
                    Food Preference <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-5 mt-2">
                    {["Vegetarian", "Non-Vegetarian"].map((pref) => (
                      <label key={pref} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={form.food_preference.includes(pref)}
                          onCheckedChange={() =>
                            set("food_preference", toggle(form.food_preference, pref))
                          }
                        />
                        <span className="text-sm">{pref}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ════════════════ STEP 3: Package Type ════════════════ */}
            {currentStep === 3 && (
              <>
                <div>
                  <Label className="font-semibold">
                    Package Type <span className="text-destructive">*</span>
                  </Label>
                  <RadioGroup
                    value={form.package_type}
                    onValueChange={(v) => set("package_type", v)}
                    className="mt-2 space-y-2"
                  >
                    <label
                      className={cn(
                        "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors",
                        form.package_type === "land" && "border-primary bg-primary/5"
                      )}
                    >
                      <RadioGroupItem value="land" className="mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold">Land Package</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Hotel + Meals + Local sightseeing only. No inter-city travel included.
                        </p>
                      </div>
                    </label>
                    <label
                      className={cn(
                        "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors",
                        form.package_type === "total" && "border-primary bg-primary/5"
                      )}
                    >
                      <RadioGroupItem value="total" className="mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold">Total Package</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Includes flights / trains / bus + all land services.
                        </p>
                      </div>
                    </label>
                  </RadioGroup>
                </div>

                {/* Total Package: travel mode */}
                {form.package_type === "total" && (
                  <div className="p-3.5 rounded-xl border bg-muted/20 space-y-2.5">
                    <Label className="font-semibold">Travel Mode Preference</Label>
                    <p className="text-xs text-muted-foreground">Select all that apply</p>
                    {["Train", "Flight", "Bus"].map((mode) => (
                      <label key={mode} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={form.travel_modes.includes(mode)}
                          onCheckedChange={() =>
                            set("travel_modes", toggle(form.travel_modes, mode))
                          }
                        />
                        <span className="text-sm">{mode}</span>
                      </label>
                    ))}
                  </div>
                )}

                {form.package_type === "land" && (
                  <div className="p-3 rounded-xl border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-sm">
                    <p className="font-medium text-blue-700 dark:text-blue-400">Land Package selected</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">
                      Vehicle details will be configured in the next step.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ════════════════ STEP 4: Transport ════════════════ */}
            {currentStep === 4 && (
              <>
                {/* Context banner */}
                {form.package_type ? (
                  <div
                    className={cn(
                      "p-3 rounded-xl border text-sm",
                      form.package_type === "land"
                        ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                        : "bg-muted/30 border-border"
                    )}
                  >
                    <p className="font-medium">
                      {form.package_type === "land"
                        ? "Land Package — all local transfers included"
                        : `Total Package — inter-city: ${form.travel_modes.join(", ") || "not specified"}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Select the vehicle for local transfers at the destination.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl border bg-muted/20 text-sm text-muted-foreground">
                    ← Please select Package Type in Step 3 first.
                  </div>
                )}

                <div>
                  <Label className="font-semibold">Vehicle Type</Label>
                  {form.total_pax && (
                    <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
                      Suggested for {form.total_pax} pax:{" "}
                      <strong>{suggestVehicle(parseInt(form.total_pax) || 0)}</strong>
                    </p>
                  )}
                  <Select
                    value={form.vehicle_type}
                    onValueChange={(v) => set("vehicle_type", v)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select vehicle type" />
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPES.map((v) => (
                        <SelectItem key={v.label} value={v.label}>
                          <span>{v.label}</span>
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            (up to {v.maxPax} pax)
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Pax Count for Vehicle</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min="1"
                    value={form.vehicle_pax}
                    onChange={(e) => set("vehicle_pax", e.target.value)}
                    placeholder={form.total_pax || "—"}
                  />
                </div>
              </>
            )}

            {/* ════════════════ STEP 5: Budget ════════════════ */}
            {currentStep === 5 && (
              <>
                <div>
                  <Label className="font-semibold">
                    Budget Category <span className="text-destructive">*</span>
                  </Label>
                  <RadioGroup
                    value={form.budget_category}
                    onValueChange={(v) => set("budget_category", v)}
                    className="mt-2 grid grid-cols-3 gap-2"
                  >
                    {[
                      { value: "low", label: "Low", desc: "Economy options" },
                      { value: "mid", label: "Mid", desc: "Comfortable stay" },
                      { value: "high", label: "High", desc: "Premium / luxury" },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex flex-col items-center gap-1 p-3 rounded-xl border cursor-pointer transition-colors text-center",
                          form.budget_category === opt.value && "border-primary bg-primary/5"
                        )}
                      >
                        <RadioGroupItem value={opt.value} />
                        <span className="text-sm font-semibold">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.desc}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label>Budget Estimate (per pax)</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ₹
                    </span>
                    <Input
                      className="pl-7"
                      type="number"
                      min="0"
                      value={form.budget_estimate}
                      onChange={(e) => set("budget_estimate", e.target.value)}
                      placeholder="e.g. 5000"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Approximate expectation per person — execution will price accordingly.
                  </p>
                </div>
              </>
            )}

            {/* ════════════════ STEP 6: Activities & Sightseeing ════════════════ */}
            {currentStep === 6 && (
              <>
                <div>
                  <Label>Sightseeing Preferences</Label>
                  <Textarea
                    className="mt-1 resize-none"
                    rows={3}
                    value={form.sightseeing}
                    onChange={(e) => set("sightseeing", e.target.value)}
                    placeholder="e.g. Rohtang Pass, Solang Valley, Hadimba Temple, Mall Road..."
                  />
                </div>
                <div>
                  <Label>Activities</Label>
                  <Textarea
                    className="mt-1 resize-none"
                    rows={3}
                    value={form.activities}
                    onChange={(e) => set("activities", e.target.value)}
                    placeholder="e.g. Campfire, DJ Night, Trekking, River Rafting, Paragliding..."
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Both fields are optional but help execution team plan the package.
                </p>
              </>
            )}

            {/* ════════════════ STEP 7: Group Details ════════════════ */}
            {currentStep === 7 && (
              <>
                <div>
                  <Label className="font-semibold">
                    Group Type <span className="text-destructive">*</span>
                  </Label>
                  <RadioGroup
                    value={form.group_type}
                    onValueChange={(v) => set("group_type", v)}
                    className="mt-2 grid grid-cols-2 gap-2"
                  >
                    {[
                      { value: "family", label: "Family" },
                      { value: "couples", label: "Couples" },
                      { value: "friends", label: "Friends Group" },
                      { value: "corporate", label: "Corporate / Students" },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors",
                          form.group_type === opt.value && "border-primary bg-primary/5"
                        )}
                      >
                        <RadioGroupItem value={opt.value} />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <Separator />

                <div>
                  <Label className="font-semibold">Passenger Breakdown</Label>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div>
                      <Label className="text-sm">
                        Adults <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min="0"
                        value={form.adults}
                        onChange={(e) => set("adults", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Children</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min="0"
                        value={form.children}
                        onChange={(e) => set("children", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Seniors</Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min="0"
                        value={form.senior_citizens}
                        onChange={(e) => set("senior_citizens", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ════════════════ STEP 8: Booking & Logistics ════════════════ */}
            {currentStep === 8 && (
              <>
                <div>
                  <Label className="font-semibold">Tickets already booked?</Label>
                  <RadioGroup
                    value={form.tickets_booked}
                    onValueChange={(v) => set("tickets_booked", v)}
                    className="mt-1.5 flex gap-5"
                  >
                    {["yes", "no"].map((v) => (
                      <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                        <RadioGroupItem value={v} />
                        <span className="text-sm capitalize">{v}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                {form.tickets_booked === "yes" && (
                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border bg-muted/20">
                    <div>
                      <Label className="text-sm">Booking Date</Label>
                      <Input
                        className="mt-1"
                        type="date"
                        value={form.booking_date}
                        onChange={(e) => set("booking_date", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Travel Mode</Label>
                      <Select
                        value={form.booking_travel_mode}
                        onValueChange={(v) => set("booking_travel_mode", v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Train">Train</SelectItem>
                          <SelectItem value="Flight">Flight</SelectItem>
                          <SelectItem value="Bus">Bus</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>
                      Pickup Location <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      className="mt-1"
                      value={form.pickup_location}
                      onChange={(e) => set("pickup_location", e.target.value)}
                      placeholder="e.g. New Delhi Rly Stn"
                    />
                  </div>
                  <div>
                    <Label>
                      Drop Location <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      className="mt-1"
                      value={form.drop_location}
                      onChange={(e) => set("drop_location", e.target.value)}
                      placeholder="e.g. Chandigarh Airport"
                    />
                  </div>
                </div>

                <div>
                  <Label>Additional Notes for Execution Team</Label>
                  <Textarea
                    className="mt-1 resize-none"
                    rows={3}
                    value={form.additional_notes}
                    onChange={(e) => set("additional_notes", e.target.value)}
                    placeholder="Special requests, client expectations, specific instructions..."
                  />
                </div>

                {/* Quick summary before submit */}
                <div className="p-3.5 rounded-xl bg-muted/30 border text-xs space-y-1.5">
                  <p className="font-semibold text-sm mb-2">Request Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div><span className="text-muted-foreground">Destination: </span>{form.destination || "—"}</div>
                    <div><span className="text-muted-foreground">Duration: </span>{form.days || "—"}D/{form.nights || "—"}N</div>
                    <div><span className="text-muted-foreground">Pax: </span>{form.total_pax || "—"}</div>
                    <div>
                      <span className="text-muted-foreground">Package: </span>
                      {form.package_type === "land" ? "Land" : form.package_type === "total" ? "Total" : "—"}
                    </div>
                    <div><span className="text-muted-foreground">Hotels: </span>{form.accommodation.join(", ") || "—"}</div>
                    <div><span className="text-muted-foreground">Budget: </span><span className="capitalize">{form.budget_category || "—"}</span></div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Sticky footer ──────────────────────────────────────────────────── */}
          <div className="shrink-0 border-t px-6 py-4 bg-background flex items-center justify-between gap-3">
            {currentStep > 1 ? (
              <Button variant="outline" onClick={() => setCurrentStep((s) => s - 1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            )}

            {currentStep < 8 ? (
              <Button onClick={() => setCurrentStep((s) => s + 1)}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setAttemptedSubmit(true);
                  submitRequest.mutate();
                }}
                disabled={submitRequest.isPending}
              >
                {submitRequest.isPending
                  ? "Submitting…"
                  : isRevision
                  ? "Submit Revision Request"
                  : "Send to Execution Team"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ───────────────────────────────────────── */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(v) => { if (!v) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quotation Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the request sent to the execution team.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmId) deleteRequest.mutate(deleteConfirmId);
                setDeleteConfirmId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
