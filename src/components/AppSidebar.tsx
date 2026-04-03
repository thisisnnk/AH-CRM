import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Contact,
  ListTodo,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  Activity,
  CheckSquare,
  Briefcase,
  BookOpen,
  Wallet,
  Loader2,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const adminNav = [
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Leads Activity", url: "/leads-activity", icon: Activity },
  { title: "Contacts", url: "/contacts", icon: Contact },
  { title: "Tasks", url: "/tasks", icon: ListTodo },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Console", url: "/console", icon: Settings },
];

const employeeNav = [
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Leads Activity", url: "/leads-activity", icon: Activity },
  { title: "Tasks", url: "/my-tasks", icon: CheckSquare },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

const executionNav = [
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Execution", url: "/execution", icon: Briefcase },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

const accountsNav = [
  { title: "General Ledger", url: "/general-ledger", icon: Wallet },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

const itineraryNav = [
  { title: "Itineraries", url: "/itineraries", icon: BookOpen },
  { title: "Notifications", url: "/notifications", icon: Bell },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  employee: "Employee",
  execution: "Execution",
  accounts: "Accounts",
  itinerary: "Itinerary",
};

export function AppSidebar() {
  const { role, profile, signOut } = useAuth();
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const navByRole: Record<string, typeof adminNav> = {
    admin: adminNav,
    employee: employeeNav,
    execution: executionNav,
    accounts: accountsNav,
    itinerary: itineraryNav,
  };
  const items = role ? (navByRole[role] ?? employeeNav) : employeeNav;

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login");
    } catch (err) {
      console.error("Sign out error:", err);
      window.location.href = "/login";
    }
    // No reset — navigating away
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <div className="flex items-center justify-between p-4">
        {!collapsed && (
          <img
            src="https://www.adventureholidays.co/logo.png"
            alt="Adventure Holidays"
            className="h-8 object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <Menu className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <Separator className="mb-4 bg-sidebar-border" />
        {!collapsed && profile && (
          <div className="mb-3 px-1">
            <p className="text-sm font-medium text-sidebar-foreground">{profile.name}</p>
            <p className="text-xs text-sidebar-muted">{role ? ROLE_LABELS[role] ?? role : ""}</p>
          </div>
        )}
        <Button
          variant="ghost"
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {signingOut
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <LogOut className="h-4 w-4 mr-2" />}
          {!collapsed && (signingOut ? "Signing out..." : "Sign Out")}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
