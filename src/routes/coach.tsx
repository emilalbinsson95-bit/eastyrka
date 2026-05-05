import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Users, BookOpen, Mail, LogOut, Activity, MessageCircle, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";

export const Route = createFileRoute("/coach")({
  component: CoachLayout,
});

function CoachLayout() {
  const { user, role, loading, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    // Send the user to the layout that matches their active role.
    if (role !== "coach") {
      if (role === "physio") navigate({ to: "/physio" });
      else if (role === "patient") navigate({ to: "/patient" });
      else if (role === "athlete") navigate({ to: "/today" });
    }
  }, [user, role, loading, navigate]);

  if (loading || !user || role !== "coach") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">{t("app.loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/coach" className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            {t("app.name")}
            <span className="ml-2 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {t("role.coach")}
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <CoachNavLink to="/coach" icon={<Users className="h-4 w-4" />} label={t("nav.athletes")} exact />
            <CoachNavLink to="/coach/exercises" icon={<BookOpen className="h-4 w-4" />} label={t("nav.exercises")} />
            <CoachNavLink to="/messages" icon={<MessageCircle className="h-4 w-4" />} label={t("nav.messages")} />
            <CoachNavLink to="/coach/invites" icon={<Mail className="h-4 w-4" />} label={t("nav.invites")} />
            <CoachNavLink to="/coach/me" icon={<User className="h-4 w-4" />} label={t("nav.me")} />
          </nav>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <LanguageToggle />
            <ThemeToggle />
            <RoleSwitcher />
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
        {/* Mobile nav */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-2 py-2 md:hidden">
          <CoachNavLink to="/coach" icon={<Users className="h-4 w-4" />} label={t("nav.athletes")} exact />
          <CoachNavLink to="/coach/exercises" icon={<BookOpen className="h-4 w-4" />} label={t("nav.exercises")} />
          <CoachNavLink to="/messages" icon={<MessageCircle className="h-4 w-4" />} label={t("nav.messages")} />
          <CoachNavLink to="/coach/invites" icon={<Mail className="h-4 w-4" />} label={t("nav.invites")} />
          <CoachNavLink to="/coach/me" icon={<User className="h-4 w-4" />} label={t("nav.me")} />
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function CoachNavLink({
  to,
  icon,
  label,
  exact,
}: {
  to: "/coach" | "/coach/exercises" | "/coach/invites" | "/coach/me" | "/messages";
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
