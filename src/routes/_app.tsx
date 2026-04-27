import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Calendar, History, User as UserIcon, LogOut, Activity, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { NotificationsBell } from "@/components/NotificationsBell";

export const Route = createFileRoute("/_app")({
  component: AthleteLayout,
});

function AthleteLayout() {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    // Only bounce to coach if the user has no athlete role at all.
    // Coaches who have enabled athlete view stay here.
    if (role !== "athlete") {
      navigate({ to: "/coach" });
    }
  }, [user, role, loading, navigate]);

  if (loading || !user || role !== "athlete") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/today" className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            EA Training System
          </Link>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <RoleSwitcher />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut().then(() => navigate({ to: "/" }))}
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom tab bar (mobile-first) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          <TabLink to="/today" icon={<Calendar className="h-5 w-5" />} label="Today" />
          <TabLink to="/history" icon={<History className="h-5 w-5" />} label="History" />
          <TabLink to="/messages" icon={<MessageCircle className="h-5 w-5" />} label="Messages" />
          <TabLink to="/me" icon={<UserIcon className="h-5 w-5" />} label="Me" />
        </div>
      </nav>
    </div>
  );
}

function TabLink({
  to,
  icon,
  label,
}: {
  to: "/today" | "/history" | "/me" | "/messages";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{
        className: cn(
          "flex flex-col items-center gap-1 py-3 text-xs text-primary",
        ),
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
