import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit, UserX, UserCheck, Phone, Mail, User, Calendar, Shield, KeyRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { PageLoadingBar } from "@/components/PageLoadingBar";

const SUPER_ADMIN_EMAIL = "admin@adventureholidays.co";

export default function ConsolePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", whatsapp: "", role: "employee" });

  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ["all-employees"],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (!profiles) return [];

      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const roleMap = Object.fromEntries((roles ?? []).map((r) => [r.user_id, r.role]));

      return profiles.map((p) => ({ ...p, role: roleMap[p.user_id] ?? "employee" }));
    },
    staleTime: 2 * 60_000,
  });

  const createEmployee = useMutation({
    mutationFn: async () => {
      // Step 1 — capture admin tokens before signUp hijacks the session
      const { data: { session: adminSession } } = await supabase.auth.getSession();
      if (!adminSession) throw new Error("Admin session not found. Please refresh and try again.");

      // Step 2 — create the auth user (Supabase auto-signs in as the new user here)
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name } },
      });
      if (authErr) throw authErr;
      if (!authData.user) throw new Error("Failed to create user");

      // Step 3 — restore admin session
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });

      // Step 4 — use SECURITY DEFINER RPC so role/profile writes are guaranteed
      // to succeed regardless of session timing issues
      const { error: rpcErr } = await supabase.rpc("admin_set_user_role", {
        p_user_id: authData.user.id,
        p_role: form.role,
        p_name: form.name,
        p_whatsapp: form.whatsapp || null,
      });
      if (rpcErr) throw rpcErr;
    },
    onSuccess: () => {
      toast({ title: "User created successfully" });
      setDialogOpen(false);
      setForm({ name: "", email: "", password: "", whatsapp: "", role: "employee" });
      queryClient.invalidateQueries({ queryKey: ["all-employees"] });
    },
    onError: (err: any) => {
      toast({ title: "Error creating employee", description: err.message, variant: "destructive" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active: !isActive }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-employees"] });
      toast({ title: "Employee status updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error updating status", description: err.message, variant: "destructive" });
    },
  });

  const updateEmployee = useMutation({
    mutationFn: async () => {
      if (!editingUser) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const body: any = {
        userId: editingUser.user_id,
        name: form.name,
        whatsapp: form.whatsapp,
      };
      if (form.password) body.password = form.password;

      const { error } = await supabase.functions.invoke("admin-update-user", {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "User updated successfully" });
      setEditingUser(null);
      setForm({ name: "", email: "", password: "", whatsapp: "", role: "employee" });
      queryClient.invalidateQueries({ queryKey: ["all-employees"] });
    },
    onError: (err: any) => {
      toast({ title: "Error updating employee", description: err.message, variant: "destructive" });
    },
  });

  const sendPasswordReset = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Password reset email sent", description: `A reset link has been sent to ${SUPER_ADMIN_EMAIL}` });
    },
    onError: (err: any) => {
      toast({ title: "Error sending reset email", description: err.message, variant: "destructive" });
    },
  });

  const activeCount = employees.filter((e) => e.is_active).length;
  const inactiveCount = employees.filter((e) => !e.is_active).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageLoadingBar loading={employeesLoading} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Console</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {employees.length} user{employees.length !== 1 ? "s" : ""} &nbsp;·&nbsp;
            <span className="text-success">{activeCount} active</span>
            {inactiveCount > 0 && <span className="text-destructive"> · {inactiveCount} deactivated</span>}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingUser(null); setForm({ name: "", email: "", password: "", whatsapp: "", role: "employee" }); }}>
              <Plus className="h-4 w-4 mr-2" /> Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Full Name</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Password</Label><Input className="mt-1" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div><Label>WhatsApp Number</Label><Input className="mt-1" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+91..." /></div>
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee (Sales)</SelectItem>
                    <SelectItem value="execution">Execution</SelectItem>
                    <SelectItem value="accounts">Accounts</SelectItem>
                    <SelectItem value="itinerary">Itinerary</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => createEmployee.mutate()} disabled={createEmployee.isPending}>
                {createEmployee.isPending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{editingUser?.name}</p>
                <p className="text-xs text-muted-foreground">{editingUser?.email}</p>
              </div>
            </div>
            <Separator />
            <div><Label>Full Name</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>WhatsApp Number</Label><Input className="mt-1" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+91..." /></div>
            <div>
              <Label>New Password</Label>
              <Input className="mt-1" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to keep unchanged" />
            </div>
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
              Email cannot be changed. All data stays linked to this account via email ID.
            </div>
            <Button className="w-full" onClick={() => updateEmployee.mutate()} disabled={updateEmployee.isPending}>
              {updateEmployee.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Employee Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {employees.map((emp) => {
          const isSuperAdmin = emp.email === SUPER_ADMIN_EMAIL;
          const isAdmin = emp.role === "admin";
          return (
            <Card key={emp.id} className={`${!emp.is_active ? "opacity-60" : ""} ${isSuperAdmin ? "ring-2 ring-primary/40" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isSuperAdmin ? "bg-primary/20" : "bg-primary/10"}`}>
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base leading-tight truncate">{emp.name}</CardTitle>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant={emp.is_active ? "default" : "destructive"} className="text-xs">
                          {emp.is_active ? "Active" : "Deactivated"}
                        </Badge>
                        {isSuperAdmin && (
                          <Badge className="text-xs bg-primary text-primary-foreground">Super Admin</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {isSuperAdmin ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Send password reset email"
                        onClick={() => sendPasswordReset.mutate(emp.email)}
                        disabled={sendPasswordReset.isPending}
                      >
                        <KeyRound className="h-4 w-4 text-primary" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit employee"
                          onClick={() => {
                            setEditingUser(emp);
                            setForm({ name: emp.name, email: emp.email, password: "", whatsapp: emp.whatsapp ?? "", role: emp.role ?? "employee" });
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={emp.is_active ? "Deactivate employee" : "Activate employee"}
                          onClick={() => toggleActive.mutate({ userId: emp.user_id, isActive: emp.is_active ?? true })}
                        >
                          {emp.is_active ? <UserX className="h-4 w-4 text-destructive" /> : <UserCheck className="h-4 w-4 text-success" />}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>

              <Separator />

              <CardContent className="pt-3 space-y-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground truncate">{emp.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{emp.whatsapp || "—"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground capitalize">
                    {isSuperAdmin ? "Super Admin" : emp.role === "admin" ? "Admin" : emp.role === "execution" ? "Execution" : emp.role === "accounts" ? "Accounts" : emp.role === "itinerary" ? "Itinerary" : "Employee"}
                  </span>
                </div>
                {emp.created_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">
                      Joined {format(new Date(emp.created_at), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {employeesLoading && employees.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">Loading employees...</div>
      )}
      {!employeesLoading && employees.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          No users yet. Click "Create User" to add one.
        </div>
      )}
    </div>
  );
}
