import { useAuth } from "@/contexts/AuthContext";
import AdminDashboard from "./AdminDashboard";
import EmployeeDashboard from "./EmployeeDashboard";

export default function DashboardPage() {
  const { role } = useAuth();
  return role === "admin" ? <AdminDashboard /> : <EmployeeDashboard />;
}
