import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Users, UserPlus, MessageCircle, LogOut, Activity, Layers, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PhysioRoleSwitcher } from "@/components/PhysioRoleSwitcher";

export const Route = createFileRoute("/physio")({
  component: PhysioLayout,
});

function PhysioLayout() {
  const { user, role, loading, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role !== "physio") {
      // Non-physios shouldn't see this layout — redirect to their home
      if (role === "coach") navigate({ to: "/coach" });
      else if (role === "patient") navigate({ to: "/patient" });
      else navigate({ to: "/today" });
    }
  }, [user, role, loading, navigate]);

  if (loading || !user || role !== "physio") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/physio" className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            {t("app.name")}
            <span className="ml-2 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {t("role.physio")}
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <PhysioNavLink to="/physio" icon={<Users className="h-4 w-4" />} label={t("nav.patients")} exact />
            <PhysioNavLink to="/physio/bands" icon={<Layers className="h-4 w-4" />} label="Bands" />
            <PhysioNavLink to="/physio/invites" icon={<UserPlus className="h-4 w-4" />} label={t("nav.invites")} />
            <PhysioNavLink to="/messages" icon={<MessageCircle className="h-4 w-4" />} label={t("nav.messages")} />
            <PhysioNavLink to="/physio/me" icon={<User className="h-4 w-4" />} label={t("nav.me")} />
          </nav>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <LanguageToggle />
            <ThemeToggle />
            <PhysioRoleSwitcher />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut().then(() => navigate({ to: "/" }))}
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">{t("actions.signOut")}</span>
            </Button>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-2 py-2 md:hidden">
          <PhysioNavLink to="/physio" icon={<Users className="h-4 w-4" />} label={t("nav.patients")} exact />
          <PhysioNavLink to="/physio/bands" icon={<Layers className="h-4 w-4" />} label="Bands" />
          <PhysioNavLink to="/physio/invites" icon={<UserPlus className="h-4 w-4" />} label={t("nav.invites")} />
          <PhysioNavLink to="/messages" icon={<MessageCircle className="h-4 w-4" />} label={t("nav.messages")} />
          <PhysioNavLink to="/physio/me" icon={<User className="h-4 w-4" />} label={t("nav.me")} />
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function PhysioNavLink({
  to,
  icon,
  label,
  exact,
}: {
  to: "/physio" | "/physio/invites" | "/physio/bands" | "/physio/me" | "/messages";
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: !!exact }}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      activeProps={{
        className: cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm bg-primary/10 text-primary font-medium",
        ),
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
