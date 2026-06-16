import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Trash2, ChevronRight, Activity, MessageCircle, TrendingUp, TrendingDown, Minus, Dumbbell, Calendar } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/physio/patients/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient — EA Physio" },
      { name: "description", content: "Patient rehab progress and session history." },
    ],
  }),
  component: PatientDetail,
});

function PatientDetail() {
  const { patientId } = Route.useParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const physioId = user!.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["patient-profile", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["physio-patient-sessions", physioId, patientId],
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

  const progressionQuery = useQuery({
    queryKey: ["physio-patient-progression", physioId, patientId],
    queryFn: async () => {
      const { data: sessions, error: sErr } = await supabase
        .from("rehab_sessions")
        .select("id, session_date")
        .eq("patient_id", patientId)
        .order("session_date", { ascending: true });
      if (sErr) throw sErr;
      const sessionIds = (sessions ?? []).map((s) => s.id);
      if (sessionIds.length === 0) return [];
      const dateById = new Map(sessions!.map((s) => [s.id, s.session_date]));
      const { data: exs, error: eErr } = await supabase
        .from("rehab_exercises")
        .select("id, session_id, name, sets, reps, load_kg, hold_seconds, pain_rating, perceived_exertion")
        .in("session_id", sessionIds);
      if (eErr) throw eErr;

      type Entry = {
        date: string;
        sets: number | null;
        reps: number | null;
        load_kg: number | null;
        hold_seconds: number | null;
        pain_rating: number | null;
        perceived_exertion: number | null;
        volume: number | null;
      };
      const grouped = new Map<string, Entry[]>();
      for (const e of exs ?? []) {
        const date = dateById.get(e.session_id);
        if (!date) continue;
        const volume =
          e.sets != null && e.reps != null && e.load_kg != null
            ? Number(e.sets) * Number(e.reps) * Number(e.load_kg)
            : null;
        const key = e.name.trim().toLowerCase();
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push({
          date,
          sets: e.sets,
          reps: e.reps,
          load_kg: e.load_kg != null ? Number(e.load_kg) : null,
          hold_seconds: e.hold_seconds,
          pain_rating: e.pain_rating,
          perceived_exertion: e.perceived_exertion,
          volume,
        });
      }
      return Array.from(grouped.entries())
        .map(([key, entries]) => {
          entries.sort((a, b) => a.date.localeCompare(b.date));
          const days = new Set(entries.map((e) => e.date)).size;
          const first = entries[0];
          const last = entries[entries.length - 1];
          const loadDelta =
            first.load_kg != null && last.load_kg != null
              ? last.load_kg - first.load_kg
              : null;
          const volumeDelta =
            first.volume != null && last.volume != null
              ? last.volume - first.volume
              : null;
          const painDelta =
            first.pain_rating != null && last.pain_rating != null
              ? last.pain_rating - first.pain_rating
              : null;
          const displayName =
            (exs ?? []).slice().reverse().find((e) => e.name.trim().toLowerCase() === key)?.name ??
            key;
          // Build per-day max load series for chart.
          const byDay = new Map<string, number>();
          for (const e of entries) {
            if (e.load_kg == null) continue;
            byDay.set(e.date, Math.max(byDay.get(e.date) ?? 0, e.load_kg));
          }
          const chart = Array.from(byDay.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, load]) => ({ date, load }));
          return {
            key,
            name: displayName,
            sessions: entries.length,
            days,
            firstDate: first.date,
            lastDate: last.date,
            currentLoad: last.load_kg,
            startLoad: first.load_kg,
            loadDelta,
            currentVolume: last.volume,
            volumeDelta,
            currentPain: last.pain_rating,
            painDelta,
            chart,
            entries,
          };
        })
        .sort((a, b) => b.sessions - a.sessions);
    },
  });

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [overallPain, setOverallPain] = useState<string>("");

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("rehab_sessions")
        .insert({
          physio_id: physioId,
          patient_id: patientId,
          session_date: date,
          title: title || null,
          subjective_notes: subjective || null,
          objective_notes: objective || null,
          overall_pain: overallPain === "" ? null : Number(overallPain),
          status: "planned",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(t("physio.patient.sessionCreated"));
      qc.invalidateQueries({ queryKey: ["physio-patient-sessions", physioId, patientId] });
      qc.invalidateQueries({ queryKey: ["physio-roster", physioId] });
      setTitle("");
      setSubjective("");
      setObjective("");
      setOverallPain("");
      navigate({
        to: "/physio/patients/$patientId/sessions/$sessionId",
        params: { patientId, sessionId: d.id },
      });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeSession = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rehab_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("physio.patient.sessionRemoved"));
      qc.invalidateQueries({ queryKey: ["physio-patient-sessions", physioId, patientId] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/physio">
            <ArrowLeft className="mr-1 h-4 w-4" /> {t("physio.patient.back")}
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/physio/patients/$patientId/progression" params={{ patientId }}>
              <TrendingUp className="mr-1 h-4 w-4" /> Progression
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/physio/patients/$patientId/calendar" params={{ patientId }}>
              <Calendar className="mr-1 h-4 w-4" /> Calendar
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/messages">
              <MessageCircle className="mr-1 h-4 w-4" /> {t("physio.patient.message")}
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {profileQuery.data?.full_name ?? t("role.patient")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("physio.patient.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> {t("physio.patient.newSession")}
          </CardTitle>
          <CardDescription>{t("physio.patient.newSessionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="date">{t("physio.patient.date")}</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="title">{t("physio.patient.title")}</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("physio.patient.titlePlaceholder")}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="overallpain">{t("physio.patient.baselinePain")}</Label>
            <Input
              id="overallpain"
              type="number"
              min={0}
              max={10}
              value={overallPain}
              onChange={(e) => setOverallPain(e.target.value)}
              className="max-w-[120px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="subjective">{t("physio.patient.subjective")}</Label>
            <Textarea
              id="subjective"
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
              placeholder={t("physio.patient.subjectivePlaceholder")}
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="objective">{t("physio.patient.objective")}</Label>
            <Textarea
              id="objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder={t("physio.patient.objectivePlaceholder")}
              rows={2}
            />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full sm:w-auto">
            {create.isPending ? t("physio.patient.creating") : t("physio.patient.createSession")}
          </Button>
        </CardContent>
      </Card>

      <PlansCard physioId={physioId} patientId={patientId} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" /> {t("physio.patient.progressionTitle")}
          </CardTitle>
          <CardDescription>{t("physio.patient.progressionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {progressionQuery.isLoading && (
            <p className="text-sm text-muted-foreground">{t("app.loading")}</p>
          )}
          {!progressionQuery.isLoading && (progressionQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">{t("physio.patient.noExercises")}</p>
          )}
          {(progressionQuery.data ?? []).map((ex) => (
            <div key={ex.key} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{ex.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("physio.patient.daysCount", { count: ex.days })} ·{" "}
                    {t("physio.patient.logsCount", { count: ex.sessions })} ·{" "}
                    {t("physio.patient.since", { date: new Date(ex.firstDate).toLocaleDateString() })}
                  </div>
                </div>
                <DeltaBadge current={ex.currentLoad} delta={ex.loadDelta} unit="kg" />
              </div>
              {ex.chart.length >= 2 && (
                <div className="mt-3 h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ex.chart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                        labelFormatter={(d) => new Date(d).toLocaleDateString()}
                        formatter={(v: number) => [`${v} kg`, t("physio.patient.loadChart")]}
                      />
                      <Line
                        type="monotone"
                        dataKey="load"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <Mini
                  label={t("physio.patient.loadStartNow")}
                  value={
                    ex.startLoad != null && ex.currentLoad != null
                      ? `${ex.startLoad}→${ex.currentLoad}kg`
                      : "—"
                  }
                />
                <Mini
                  label={t("physio.patient.volumeDelta")}
                  value={
                    ex.volumeDelta != null
                      ? `${ex.volumeDelta >= 0 ? "+" : ""}${Math.round(ex.volumeDelta)}`
                      : "—"
                  }
                />
                <Mini
                  label={t("physio.patient.painNow")}
                  value={ex.currentPain != null ? `${ex.currentPain}/10` : "—"}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("physio.patient.sessionHistory")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessionsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">{t("app.loading")}</p>
          )}
          {!sessionsQuery.isLoading && (sessionsQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">{t("physio.patient.noSessionsYet")}</p>
          )}
          {(sessionsQuery.data ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
            >
              <Link
                to="/physio/patients/$patientId/sessions/$sessionId"
                params={{ patientId, sessionId: s.id }}
                className="flex flex-1 items-center gap-3 min-w-0"
              >
                <Activity className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.title ?? t("physio.patient.session")}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {new Date(s.session_date).toLocaleDateString()}
                    {s.overall_pain != null && ` · pain ${s.overall_pain}/10`}
                    {" · "}
                    {s.status}
                  </div>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeSession.mutate(s.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function DeltaBadge({
  current,
  delta,
  unit,
}: {
  current: number | null;
  delta: number | null;
  unit: string;
}) {
  const { t } = useTranslation();
  if (current == null) {
    return (
      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
        {t("physio.patient.noLoad")}
      </span>
    );
  }
  const Icon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const color =
    delta == null || delta === 0
      ? "border-border text-muted-foreground"
      : delta > 0
        ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
        : "border-destructive/30 bg-destructive/10 text-destructive";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs ${color}`}>
      <Icon className="mr-1 h-3 w-3" />
      {current}
      {unit}
      {delta != null && delta !== 0 && (
        <span className="ml-1 opacity-80">
          ({delta > 0 ? "+" : ""}
          {delta}
          {unit})
        </span>
      )}
    </span>
  );
}
