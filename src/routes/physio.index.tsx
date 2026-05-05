import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Users, ChevronRight, TrendingUp, TrendingDown, Minus, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/physio/")({
  head: () => ({
    meta: [
      { title: "Patients — EA Physio" },
      { name: "description", content: "Long-term rehab progress across all your patients." },
    ],
  }),
  component: PhysioRoster,
});

type RosterPatient = {
  link_id: string;
  patient_id: string;
  full_name: string | null;
  created_at: string;
  total_sessions: number;
  days_active: number;
  weeks_in_program: number;
  last_session_date: string | null;
  last_pain: number | null;
  avg_pain_recent: number | null;
  pain_trend: "down" | "up" | "flat" | null;
  exercises_logged: number;
  adherence_30d: number;
};

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((a.getTime() - b.getTime()) / 86_400_000));
}

function PhysioRoster() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const physioId = user!.id;

  const rosterQuery = useQuery({
    queryKey: ["physio-roster-v2", physioId],
    queryFn: async (): Promise<RosterPatient[]> => {
      const { data: links, error } = await supabase
        .from("physio_patients")
        .select("id, patient_id, created_at")
        .eq("physio_id", physioId);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.patient_id);
      if (ids.length === 0) return [];

      const [{ data: profiles }, { data: sessions }, { data: exercises }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", ids),
        supabase
          .from("rehab_sessions")
          .select("id, patient_id, session_date, overall_pain, status")
          .in("patient_id", ids)
          .order("session_date", { ascending: false }),
        supabase
          .from("rehab_exercises")
          .select("id, session_id")
          .in(
            "session_id",
            (await supabase
              .from("rehab_sessions")
              .select("id")
              .in("patient_id", ids)
            ).data?.map((s) => s.id) ?? ["00000000-0000-0000-0000-000000000000"],
          ),
      ]);

      const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      const sessionsByPatient = new Map<string, typeof sessions>();
      const sessionToPatient = new Map<string, string>();
      for (const s of sessions ?? []) {
        sessionToPatient.set(s.id, s.patient_id);
        if (!sessionsByPatient.has(s.patient_id)) sessionsByPatient.set(s.patient_id, []);
        sessionsByPatient.get(s.patient_id)!.push(s);
      }
      const exerciseCountByPatient = new Map<string, number>();
      for (const e of exercises ?? []) {
        const pid = sessionToPatient.get(e.session_id);
        if (!pid) continue;
        exerciseCountByPatient.set(pid, (exerciseCountByPatient.get(pid) ?? 0) + 1);
      }

      const today = new Date();

      return (links ?? []).map((l) => {
        const ss = sessionsByPatient.get(l.patient_id) ?? [];
        const dates = new Set(ss.map((s) => s.session_date));
        const last = ss[0] ?? null;
        const recent = ss.slice(0, 4).filter((s) => s.overall_pain != null);
        const avg =
          recent.length > 0
            ? recent.reduce((sum, s) => sum + (s.overall_pain ?? 0), 0) / recent.length
            : null;
        const older = ss.slice(4, 8).filter((s) => s.overall_pain != null);
        const olderAvg =
          older.length > 0
            ? older.reduce((sum, s) => sum + (s.overall_pain ?? 0), 0) / older.length
            : null;
        let trend: RosterPatient["pain_trend"] = null;
        if (avg != null && olderAvg != null) {
          const diff = avg - olderAvg;
          trend = diff <= -0.5 ? "down" : diff >= 0.5 ? "up" : "flat";
        }
        const adherence30 = ss.filter(
          (s) => daysBetween(today, new Date(s.session_date)) <= 30,
        ).length;
        const startDate = new Date(l.created_at);
        const weeks = Math.max(1, Math.floor(daysBetween(today, startDate) / 7));
        return {
          link_id: l.id,
          patient_id: l.patient_id,
          full_name: profMap.get(l.patient_id) ?? null,
          created_at: l.created_at,
          total_sessions: ss.length,
          days_active: dates.size,
          weeks_in_program: weeks,
          last_session_date: last?.session_date ?? null,
          last_pain: last?.overall_pain ?? null,
          avg_pain_recent: avg,
          pain_trend: trend,
          exercises_logged: exerciseCountByPatient.get(l.patient_id) ?? 0,
          adherence_30d: adherence30,
        };
      });
    },
  });

  const patients = rosterQuery.data ?? [];
  const totals = patients.reduce(
    (acc, p) => {
      acc.sessions += p.total_sessions;
      acc.days += p.days_active;
      acc.exercises += p.exercises_logged;
      return acc;
    },
    { sessions: 0, days: 0, exercises: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("physio.overviewTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("physio.overviewDescription")}</p>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link to="/physio/invites">{t("physio.invitePatient")}</Link>
        </Button>
      </div>

      {patients.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryStat label={t("physio.summary.active")} value={patients.length} />
          <SummaryStat label={t("physio.summary.sessions")} value={totals.sessions} />
          <SummaryStat label={t("physio.summary.days")} value={totals.days} />
          <SummaryStat label={t("physio.summary.exercises")} value={totals.exercises} />
        </div>
      )}

      {rosterQuery.isLoading && (
        <p className="text-sm text-muted-foreground">{t("app.loading")}</p>
      )}

      {!rosterQuery.isLoading && patients.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> {t("physio.noPatientsTitle")}
            </CardTitle>
            <CardDescription>{t("physio.noPatientsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/physio/invites">{t("physio.invitePatient")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {patients.map((p) => (
          <Link
            key={p.link_id}
            to="/physio/patients/$patientId"
            params={{ patientId: p.patient_id }}
            className="group"
          >
            <Card className="h-full transition-colors group-hover:border-primary">
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">
                      {p.full_name ?? t("physio.card.unnamed")}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {t("physio.card.weekOf", { n: p.weeks_in_program })}
                    </div>
                  </div>
                  <PainTrendBadge trend={p.pain_trend} value={p.avg_pain_recent} />
                </div>

                <div className="grid grid-cols-4 gap-2 border-t border-border pt-3 text-center">
                  <Stat label={t("physio.card.days")} value={p.days_active} />
                  <Stat label={t("physio.card.sessions")} value={p.total_sessions} />
                  <Stat label={t("physio.card.exercises")} value={p.exercises_logged} />
                  <Stat label={t("physio.card.last30")} value={p.adherence_30d} />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">
                    {p.last_session_date
                      ? t("physio.card.lastSession", {
                          date: new Date(p.last_session_date).toLocaleDateString(),
                        })
                      : t("physio.card.noSessions")}
                  </span>
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="text-xl font-bold sm:text-2xl">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function PainTrendBadge({
  trend,
  value,
}: {
  trend: "down" | "up" | "flat" | null;
  value: number | null;
}) {
  const { t } = useTranslation();
  if (value == null) {
    return (
      <Badge variant="outline" className="shrink-0">
        {t("physio.pain.noData")}
      </Badge>
    );
  }
  const Icon = trend === "down" ? TrendingDown : trend === "up" ? TrendingUp : Minus;
  const color =
    trend === "down"
      ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30"
      : trend === "up"
        ? "bg-destructive/10 text-destructive border-destructive/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={`shrink-0 ${color}`}>
      <Icon className="mr-1 h-3 w-3" />
      {t("physio.pain.label", { value: value.toFixed(1) })}
    </Badge>
  );
}
