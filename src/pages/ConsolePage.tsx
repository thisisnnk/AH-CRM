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
import { Plus, Edit, UserX, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
      // Save current admin session before signUp replaces it
      const { data: { session: adminSession } } = await supabase.auth.getSession();

      // Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name } },
      });
      if (authErr) throw authErr;
      if (!authData.user) throw new Error("Failed to create user");

      // Restore admin session so subsequent DB calls run as admin
      if (adminSession) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });
      }

      // Update profile with whatsapp
      const { error: profileErr } = await supabase.from("profiles").update({ whatsapp: form.whatsapp, name: form.name }).eq("user_id", authData.user.id);
      if (profileErr) throw profileErr;

      // Assign employee role
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
      console.error("Create employee error:", err);
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
      console.error("Toggle active error:", err);
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
      console.error("Update employee error:", err);
      toast({ title: "Error updating employee", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Console</h1>
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
            <div className="space-y-4">
              <div><Label>Full Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div><Label>WhatsApp Number</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+91..." /></div>
              <Button className="w-full" onClick={() => createEmployee.mutate()} disabled={createEmployee.isPending}>
                {createEmployee.isPending ? "Creating..." : "Create Employee"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Full Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>WhatsApp Number</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
            <Button className="w-full" onClick={() => updateEmployee.mutate()} disabled={updateEmployee.isPending}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4">
        {employees.map((emp) => (
          <Card key={emp.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{emp.name}</p>
                  <Badge variant={emp.is_active ? "default" : "destructive"} className="text-xs">
                    {emp.is_active ? "Active" : "Deactivated"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{emp.email}</p>
                {emp.whatsapp && <p className="text-xs text-muted-foreground">{emp.whatsapp}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setEditingUser(emp);
                    setForm({ name: emp.name, email: emp.email, password: "", whatsapp: emp.whatsapp ?? "" });
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => toggleActive.mutate({ userId: emp.user_id, isActive: emp.is_active ?? true })}
                >
                  {emp.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
