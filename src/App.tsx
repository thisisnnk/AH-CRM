import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import LeadsPage from "./pages/LeadsPage";
import LeadDetailPage from "./pages/LeadDetailPage";
import ContactsPage from "./pages/ContactsPage";
import ContactDetailPage from "./pages/ContactDetailPage";
import TasksPage from "./pages/TasksPage";
import ConsolePage from "./pages/ConsolePage";
import NotificationsPage from "./pages/NotificationsPage";
import NotFound from "./pages/NotFound";
import LeadsActivityPage from "./pages/LeadsActivityPage";
import EmployeeTasksPage from "./pages/EmployeeTasksPage";
import ExecutionPage from "./pages/ExecutionPage";
import ExecutionRespondPage from "./pages/ExecutionRespondPage";
import ItinerariesPage from "./pages/ItinerariesPage";
import GeneralLedgerPage from "./pages/GeneralLedgerPage";
import { ProtectedLayout, AdminRoute, ExecutionRoute, ItineraryRoute, AccountsRoute } from "./components/ProtectedLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,                // always treat data as stale → always refetch on mount
      gcTime: 5 * 60_000,          // keep unused data in memory for 5 min
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnMount: true,
      refetchOnWindowFocus: true,  // refetch when user returns to the tab
    },
  },
});

function RootRedirect() {
  const { user, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading Adventure Holidays CRM...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (role === "execution") return <Navigate to="/execution" replace />;
  if (role === "accounts") return <Navigate to="/general-ledger" replace />;
  if (role === "itinerary") return <Navigate to="/itineraries" replace />;
  return <Navigate to="/dashboard" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Protected routes */}
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/leads-activity" element={<LeadsActivityPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/contacts/:id" element={<ContactDetailPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/my-tasks" element={<EmployeeTasksPage />} />

              {/* Execution team */}
              <Route element={<ExecutionRoute />}>
                <Route path="/execution" element={<ExecutionPage />} />
                <Route path="/execution/respond/:requestId" element={<ExecutionRespondPage />} />
              </Route>

              {/* Itinerary team */}
              <Route element={<ItineraryRoute />}>
                <Route path="/itineraries" element={<ItinerariesPage />} />
              </Route>

              {/* Accounts team */}
              <Route element={<AccountsRoute />}>
                <Route path="/general-ledger" element={<GeneralLedgerPage />} />
              </Route>

              {/* Admin only */}
              <Route element={<AdminRoute />}>
                <Route path="/console" element={<ConsolePage />} />
                <Route path="/tasks" element={<TasksPage />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
