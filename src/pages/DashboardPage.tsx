import { useAuth } from "@/contexts/AuthContext";
import AdminDashboard from "./AdminDashboard";
import EmployeeDashboard from "./EmployeeDashboard";
import ExecutionDashboard from "./ExecutionDashboard";
import AccountsDashboard from "./AccountsDashboard";
import ItineraryDashboard from "./ItineraryDashboard";

export default function DashboardPage() {
  const { role } = useAuth();
  if (role === "admin") return <AdminDashboard />;
  if (role === "execution") return <ExecutionDashboard />;
  if (role === "accounts") return <AccountsDashboard />;
  if (role === "itinerary") return <ItineraryDashboard />;
  return <EmployeeDashboard />;
}
