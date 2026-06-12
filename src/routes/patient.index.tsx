import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, CheckCircle2, Flame, Sparkles, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StiffnessCheckInCard } from "@/components/StiffnessCheckInCard";

export const Route = createFileRoute("/patient/")({
  head: () => ({
    meta: [
      { title: "My rehab — EA" },
      { name: "description", content: "Your next rehab session and progress." },
    ],
  }),
  component: PatientHome,
});

function PatientHome() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const patientId = user!.id;

  const sessionsQuery = useQuery({
    queryKey: ["patient-sessions", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_sessions")
        .select("id, session_date, title, status, overall_pain")
        .eq("patient_id", patientId)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const feedbackQuery = useQuery({
    queryKey: ["patient-feedback-all", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_session_feedback")
        .select("session_id, created_at, pain_after")
        .eq("patient_id", patientId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sessions = sessionsQuery.data ?? [];
  const feedback = feedbackQuery.data ?? [];
  const doneIds = new Set(feedback.map((f) => f.session_id));

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date));
  const nextSession =
    upcoming.find((s) => !doneIds.has(s.id) && s.session_date <= today) ??
    upcoming.find((s) => s.session_date >= today) ??
    sessions[0];

  const doneDays = new Set(
    feedback.map((f) => new Date(f.created_at).toISOString().slice(0, 10)),
  );
  let streak = 0;
  const cursor = new Date();
  while (doneDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const totalDone = feedback.length;
  const totalPlanned = sessions.length;

  // 14-day adherence calendar.
  const calendar: { date: string; label: string; done: boolean; isToday: boolean }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    calendar.push({
      date: iso,
      label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      done: doneDays.has(iso),
      isToday: i === 0,
    });
  }
  const last14Done = calendar.filter((c) => c.done).length;

  const past = sessions.filter((s) => s.id !== nextSession?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("patient.greeting")}</h1>
        <p className="text-sm text-muted-foreground">{t("patient.subtitle")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Flame className="h-4 w-4 text-orange-500" />} label={t("patient.stats.streak")} value={String(streak)} />
        <Stat icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} label={t("patient.stats.done")} value={String(totalDone)} />
        <Stat icon={<CalendarDays className="h-4 w-4 text-primary" />} label={t("patient.stats.planned")} value={String(totalPlanned)} />
      </div>

      <StiffnessCheckInCard />

      {nextSession ? (
        <Link
          to="/patient/sessions/$sessionId"
          params={{ sessionId: nextSession.id }}
          className="block"
        >
          <Card className="border-primary/40 bg-primary/5 transition-colors hover:border-primary">
            <CardHeader>
              <CardDescription className="flex items-center gap-1 text-primary">
                <Sparkles className="h-3.5 w-3.5" /> {t("patient.nextSession")}
              </CardDescription>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="truncate">{nextSession.title ?? t("patient.rehabSession")}</span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {new Date(nextSession.session_date).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <Button className="mt-3 w-full sm:w-auto">{t("patient.startSession")}</Button>
            </CardContent>
          </Card>
        </Link>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> {t("patient.noSessionsTitle")}
            </CardTitle>
            <CardDescription>{t("patient.noSessionsDesc")}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* 14-day adherence */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("patient.adherenceTitle")}</CardTitle>
          <CardDescription>
            {last14Done} {t("patient.sessionsLogged")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-1">
            {calendar.map((c) => (
              <div key={c.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className={`h-10 w-full rounded ${
                    c.done
                      ? "bg-primary"
                      : "bg-muted"
                  } ${c.isToday ? "ring-2 ring-primary/60 ring-offset-1 ring-offset-background" : ""}`}
                  title={c.date}
                />
                <span className="text-[10px] text-muted-foreground">{c.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {past.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t("patient.earlierSessions")}</h2>
          <div className="space-y-2">
            {past.map((s) => {
              const done = doneIds.has(s.id);
              return (
                <Link
                  key={s.id}
                  to="/patient/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  className="group block"
                >
                  <Card className="transition-colors group-hover:border-primary">
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {s.title ?? t("patient.rehabSession")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.session_date).toLocaleDateString()}
                        </div>
                      </div>
                      {done ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" /> {t("patient.logged")}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {t("patient.notLogged")}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon} <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
