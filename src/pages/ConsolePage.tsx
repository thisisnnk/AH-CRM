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
import { Plus, Edit, UserX, UserCheck, Phone, Mail, User, Calendar, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";

export default function ConsolePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", whatsapp: "" });

  const { data: employees = [] } = useQuery({
    queryKey: ["all-employees"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const createEmployee = useMutation({
    mutationFn: async () => {
      const { data: { session: adminSession } } = await supabase.auth.getSession();

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name } },
      });
      if (authErr) throw authErr;
      if (!authData.user) throw new Error("Failed to create user");

      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });
      }

      const { error: profileErr } = await supabase.from("profiles").update({ whatsapp: form.whatsapp, name: form.name }).eq("user_id", authData.user.id);
      if (profileErr) throw profileErr;

      const { error: roleErr } = await supabase.from("user_roles").insert({ user_id: authData.user.id, role: "employee" });
      if (roleErr) throw roleErr;
    },
    onSuccess: () => {
      toast({ title: "Employee created successfully" });
      setDialogOpen(false);
      setForm({ name: "", email: "", password: "", whatsapp: "" });
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
      const { error } = await supabase.from("profiles").update({
        name: form.name,
        whatsapp: form.whatsapp,
      }).eq("user_id", editingUser.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Employee updated" });
      setEditingUser(null);
      setForm({ name: "", email: "", password: "", whatsapp: "" });
      queryClient.invalidateQueries({ queryKey: ["all-employees"] });
    },
    onError: (err: any) => {
      toast({ title: "Error updating employee", description: err.message, variant: "destructive" });
    },
  });

  const activeCount = employees.filter((e) => e.is_active).length;
  const inactiveCount = employees.filter((e) => !e.is_active).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Console</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {employees.length} employee{employees.length !== 1 ? "s" : ""} &nbsp;·&nbsp;
            <span className="text-success">{activeCount} active</span>
            {inactiveCount > 0 && <span className="text-destructive"> · {inactiveCount} deactivated</span>}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingUser(null); setForm({ name: "", email: "", password: "", whatsapp: "" }); }}>
              <Plus className="h-4 w-4 mr-2" /> Create Employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Employee</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Full Name</Label><Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Password</Label><Input className="mt-1" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div><Label>WhatsApp Number</Label><Input className="mt-1" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+91..." /></div>
              <Button className="w-full" onClick={() => createEmployee.mutate()} disabled={createEmployee.isPending}>
                {createEmployee.isPending ? "Creating..." : "Create Employee"}
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
            <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
              Email cannot be changed from here. Contact Supabase to update the auth email.
            </div>
            <Button className="w-full" onClick={() => updateEmployee.mutate()} disabled={updateEmployee.isPending}>
              {updateEmployee.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Employee Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {employees.map((emp) => (
          <Card key={emp.id} className={!emp.is_active ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base leading-tight truncate">{emp.name}</CardTitle>
                    <Badge
                      variant={emp.is_active ? "default" : "destructive"}
                      className="text-xs mt-1"
                    >
                      {emp.is_active ? "Active" : "Deactivated"}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Edit employee"
                    onClick={() => {
                      setEditingUser(emp);
                      setForm({ name: emp.name, email: emp.email, password: "", whatsapp: emp.whatsapp ?? "" });
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
                <span className="text-muted-foreground capitalize">Employee</span>
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
        ))}
      </div>

      {employees.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          No employees yet. Click "Create Employee" to add one.
        </div>
      )}
    </div>
  );
}
