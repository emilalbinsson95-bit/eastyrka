import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Calendar, History, User as UserIcon, LogOut, Activity, MessageCircle, Footprints } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";

export const Route = createFileRoute("/_app")({
  component: AthleteLayout,
});

function AthleteLayout() {
  const { user, role, loading, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // Detect first-time athletes (no readiness survey ever) → onboarding.
  const onboardingCheck = useQuery({
    queryKey: ["onboarding-check", user?.id],
    enabled: !!user && role === "athlete",
    queryFn: async () => {
      const localFlag =
        typeof window !== "undefined" &&
        localStorage.getItem(`ea-onboarded-${user!.id}`) === "1";
      if (localFlag) return { needsOnboarding: false };
      const { count, error } = await supabase
        .from("readiness_surveys")
        .select("id", { count: "exact", head: true })
        .eq("athlete_id", user!.id);
      if (error) return { needsOnboarding: false };
      return { needsOnboarding: (count ?? 0) === 0 };
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    // Send the user to the layout that matches their active role.
    if (role !== "athlete") {
      if (role === "coach") navigate({ to: "/coach" });
      else if (role === "physio") navigate({ to: "/physio" });
      else if (role === "patient") navigate({ to: "/patient" });
      return;
    }
    if (
      onboardingCheck.data?.needsOnboarding &&
      !location.pathname.startsWith("/onboarding")
    ) {
      navigate({ to: "/onboarding" });
    }
  }, [user, role, loading, navigate, onboardingCheck.data, location.pathname]);

  if (loading || !user || role !== "athlete") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">{t("app.loading")}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-[calc(5rem+env(safe-area-inset-bottom))]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/today" className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            {t("app.name")}
          </Link>
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
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom tab bar (mobile-first) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          <TabLink to="/today" icon={<Calendar className="h-5 w-5" />} label={t("nav.today")} />
          <TabLink to="/endurance" icon={<Footprints className="h-5 w-5" />} label="Endurance" />
          <TabLink to="/history" icon={<History className="h-5 w-5" />} label={t("nav.history")} />
          <TabLink to="/messages" icon={<MessageCircle className="h-5 w-5" />} label={t("nav.messages")} />
          <TabLink to="/me" icon={<UserIcon className="h-5 w-5" />} label={t("nav.me")} />
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
