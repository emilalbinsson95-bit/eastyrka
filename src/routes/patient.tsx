import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Activity, ClipboardList, MessageCircle, User as UserIcon, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";

export const Route = createFileRoute("/patient")({
  component: PatientLayout,
});

function PatientLayout() {
  const { user, role, loading, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role !== "patient") {
      if (role === "coach") navigate({ to: "/coach" });
      else if (role === "physio") navigate({ to: "/physio" });
      else navigate({ to: "/today" });
    }
  }, [user, role, loading, navigate]);

  if (loading || !user || role !== "patient") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/patient" className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            EA Training System
            <span className="ml-2 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Patient
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <ThemeToggle />
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

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-3xl grid-cols-3">
          <TabLink to="/patient" icon={<ClipboardList className="h-5 w-5" />} label="Sessions" />
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
  to: "/patient" | "/messages" | "/me";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="relative flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{
        className: cn(
          "relative flex flex-col items-center gap-1 py-2.5 text-xs text-primary font-medium",
          "before:absolute before:inset-x-6 before:top-0 before:h-0.5 before:rounded-full before:bg-primary",
        ),
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
