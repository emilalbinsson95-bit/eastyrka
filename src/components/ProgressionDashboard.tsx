import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Activity,
  ClipboardCheck,
  Gauge,
  Plus,
  Ruler,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FUNCTION_TEST_PRESETS: { type: string; unit: string }[] = [
  { type: "ROM (knee flex)", unit: "deg" },
  { type: "ROM (knee ext)", unit: "deg" },
  { type: "ROM (shoulder flex)", unit: "deg" },
  { type: "Single-leg hop", unit: "cm" },
  { type: "Balance hold", unit: "s" },
  { type: "Y-balance", unit: "cm" },
  { type: "Isometric strength", unit: "kg" },
];

const SIDES = ["left", "right", "bilateral", "na"] as const;
type Side = (typeof SIDES)[number];

export interface ProgressionDashboardProps {
  patientId: string;
  /** Whether the current viewer can add/remove function tests (physio only). */
  canEdit: boolean;
  patientName?: string;
}

export function ProgressionDashboard({
  patientId,
  canEdit,
  patientName,
}: ProgressionDashboardProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {patientName ? `Progression — ${patientName}` : "My progression"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Per-exercise load, daily stiffness, function tests and adherence.
        </p>
      </div>

      <ExerciseProgressionCard patientId={patientId} />
      <StiffnessTrendCard patientId={patientId} />
      <FunctionTestsCard patientId={patientId} canEdit={canEdit} />
      <AdherenceCard patientId={patientId} />
    </div>
  );
}

/* -------------------------------------------------- */
/* Card 1: per-exercise progression                    */
/* -------------------------------------------------- */

function ExerciseProgressionCard({ patientId }: { patientId: string }) {
  const query = useQuery({
    queryKey: ["progression-exercises", patientId],
    queryFn: async () => {
      const { data: sessions, error: sErr } = await supabase
        .from("rehab_sessions")
        .select("id, session_date")
        .eq("patient_id", patientId)
        .order("session_date", { ascending: true });
      if (sErr) throw sErr;
      const ids = (sessions ?? []).map((s) => s.id);
      if (ids.length === 0) return [];
      const dateById = new Map(sessions!.map((s) => [s.id, s.session_date]));
      const { data: exs, error: eErr } = await supabase
        .from("rehab_exercises")
        .select(
          "session_id, name, sets, reps, load_kg, band_min_kg, band_max_kg",
        )
        .in("session_id", ids);
      if (eErr) throw eErr;

      type Entry = {
        date: string;
        load: number | null;
        reps: number | null;
        sets: number | null;
      };
      const grouped = new Map<string, { display: string; entries: Entry[] }>();
      for (const e of exs ?? []) {
        const date = dateById.get(e.session_id);
        if (!date) continue;
        const key = e.name.trim().toLowerCase();
        const bandMid =
          e.band_min_kg != null && e.band_max_kg != null
            ? (Number(e.band_min_kg) + Number(e.band_max_kg)) / 2
            : null;
        const load = e.load_kg != null ? Number(e.load_kg) : bandMid;
        if (!grouped.has(key))
          grouped.set(key, { display: e.name, entries: [] });
        grouped.get(key)!.entries.push({
          date,
          load,
          reps: e.reps,
          sets: e.sets,
        });
      }
      return Array.from(grouped.entries())
        .map(([key, { display, entries }]) => {
          entries.sort((a, b) => a.date.localeCompare(b.date));
          // Max load per day
          const byDay = new Map<string, number>();
          for (const e of entries) {
            if (e.load == null) continue;
            byDay.set(e.date, Math.max(byDay.get(e.date) ?? 0, e.load));
          }
          const chart = Array.from(byDay.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, load]) => ({ date, load }));
          const first = chart[0]?.load ?? null;
          const last = chart[chart.length - 1]?.load ?? null;
          const delta = first != null && last != null ? last - first : null;
          const lastEntry = entries[entries.length - 1];
          return {
            key,
            name: display,
            sessions: entries.length,
            chart,
            current: last,
            delta,
            lastReps: lastEntry?.reps ?? null,
            lastSets: lastEntry?.sets ?? null,
          };
        })
        .sort((a, b) => b.sessions - a.sessions);
    },
  });

  const list = query.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" /> Exercise progression
        </CardTitle>
        <CardDescription>
          Max load per day per exercise (band kg used when no free-weight load
          is logged).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!query.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No rehab exercises logged yet.
          </p>
        )}
        {list.map((ex) => (
          <div key={ex.key} className="rounded-md border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{ex.name}</div>
                <div className="text-xs text-muted-foreground">
                  {ex.sessions} log{ex.sessions === 1 ? "" : "s"} ·{" "}
                  {ex.lastSets ?? "—"}×{ex.lastReps ?? "—"} latest
                </div>
              </div>
              <DeltaPill current={ex.current} delta={ex.delta} unit="kg" />
            </div>
            {ex.chart.length >= 2 && (
              <div className="mt-3 h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={ex.chart}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) =>
                        new Date(d).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      }
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      labelFormatter={(d) =>
                        new Date(d).toLocaleDateString()
                      }
                      formatter={(v: number) => [`${v} kg`, "Load"]}
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
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------- */
/* Card 2: stiffness trend                            */
/* -------------------------------------------------- */

function StiffnessTrendCard({ patientId }: { patientId: string }) {
  const query = useQuery({
    queryKey: ["progression-stiffness", patientId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("patient_checkins")
        .select("date, stiffness")
        .eq("patient_id", patientId)
        .gte("date", since.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const series = query.data ?? [];
  const latest = series[series.length - 1] ?? null;
  const avg7 = useMemo(() => {
    const last7 = series.slice(-7);
    if (last7.length === 0) return null;
    return (
      last7.reduce((acc, r) => acc + Number(r.stiffness), 0) / last7.length
    );
  }, [series]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" /> Stiffness (30 days)
        </CardTitle>
        <CardDescription>
          Daily self-rated stiffness on a 0–10 scale.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No check-ins yet. The patient adds these from their home screen.
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-4 text-sm">
              <span>
                Latest:{" "}
                <span className="font-semibold">{latest?.stiffness}/10</span>{" "}
                <span className="text-muted-foreground">({latest?.date})</span>
              </span>
              {avg7 != null && (
                <span className="text-muted-foreground">
                  7-day avg: {avg7.toFixed(1)}
                </span>
              )}
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={series}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) =>
                      new Date(d).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelFormatter={(d) => new Date(d).toLocaleDateString()}
                    formatter={(v: number) => [`${v}/10`, "Stiffness"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="stiffness"
                    stroke="hsl(0 84% 60%)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------- */
/* Card 3: function tests                              */
/* -------------------------------------------------- */

function FunctionTestsCard({
  patientId,
  canEdit,
}: {
  patientId: string;
  canEdit: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["progression-function-tests", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("function_tests")
        .select(
          "id, test_type, value_numeric, unit, side, tested_at, notes, recorded_by",
        )
        .eq("patient_id", patientId)
        .order("tested_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [testType, setTestType] = useState(FUNCTION_TEST_PRESETS[0].type);
  const [unit, setUnit] = useState(FUNCTION_TEST_PRESETS[0].unit);
  const [value, setValue] = useState("");
  const [side, setSide] = useState<Side>("na");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      if (value === "") throw new Error("Value required");
      const { error } = await supabase.from("function_tests").insert({
        patient_id: patientId,
        recorded_by: user!.id,
        test_type: testType,
        unit,
        value_numeric: Number(value),
        side,
        tested_at: date,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Test recorded");
      setValue("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["progression-function-tests", patientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("function_tests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["progression-function-tests", patientId] }),
  });

  const rows = query.data ?? [];
  // Group by test_type + side for trend mini-cards
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { type: string; side: Side; unit: string; entries: typeof rows }
    >();
    for (const r of rows) {
      const key = `${r.test_type}__${r.side}`;
      if (!map.has(key))
        map.set(key, {
          type: r.test_type,
          side: r.side as Side,
          unit: r.unit,
          entries: [],
        });
      map.get(key)!.entries.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5 text-primary" /> Function tests
        </CardTitle>
        <CardDescription>
          ROM, hop, balance and isometric strength tests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tests recorded yet.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {grouped.map((g) => {
            const first = Number(g.entries[0].value_numeric);
            const last = Number(g.entries[g.entries.length - 1].value_numeric);
            const delta = last - first;
            return (
              <div
                key={`${g.type}-${g.side}`}
                className="rounded-md border border-border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{g.type}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.side !== "na" && `${g.side} · `}
                      {g.entries.length} entr{g.entries.length === 1 ? "y" : "ies"}
                    </div>
                  </div>
                  <DeltaPill current={last} delta={delta} unit={g.unit} />
                </div>
                <div className="mt-2 text-xs">
                  <ul className="space-y-0.5">
                    {g.entries.slice(-4).map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-muted-foreground">
                          {new Date(e.tested_at).toLocaleDateString()}
                        </span>
                        <span className="font-medium">
                          {Number(e.value_numeric)} {e.unit}
                        </span>
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => remove.mutate(e.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {canEdit && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <div className="text-sm font-medium">Add test</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Test</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={testType}
                  onChange={(e) => {
                    const preset = FUNCTION_TEST_PRESETS.find(
                      (p) => p.type === e.target.value,
                    );
                    setTestType(e.target.value);
                    if (preset) setUnit(preset.unit);
                  }}
                >
                  {FUNCTION_TEST_PRESETS.map((p) => (
                    <option key={p.type} value={p.type}>
                      {p.type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Value</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Side</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={side}
                  onChange={(e) => setSide(e.target.value as Side)}
                >
                  {SIDES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="sm:col-span-1">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => add.mutate()}
              disabled={add.isPending}
            >
              <Plus className="mr-1 h-4 w-4" /> Add test
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------- */
/* Card 4: adherence                                  */
/* -------------------------------------------------- */

function AdherenceCard({ patientId }: { patientId: string }) {
  const query = useQuery({
    queryKey: ["progression-adherence", patientId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 28);
      const iso = since.toISOString().slice(0, 10);

      const [{ data: sessions, error: sErr }, { data: feedback, error: fErr }] =
        await Promise.all([
          supabase
            .from("rehab_sessions")
            .select("id, session_date, status")
            .eq("patient_id", patientId)
            .gte("session_date", iso),
          supabase
            .from("patient_session_feedback")
            .select("session_id, created_at")
            .eq("patient_id", patientId)
            .gte("created_at", since.toISOString()),
        ]);
      if (sErr) throw sErr;
      if (fErr) throw fErr;
      return { sessions: sessions ?? [], feedback: feedback ?? [] };
    },
  });

  const data = query.data;
  const planned = data?.sessions.length ?? 0;
  const doneIds = new Set(data?.feedback.map((f) => f.session_id) ?? []);
  const completed =
    data?.sessions.filter(
      (s) => s.status === "completed" || doneIds.has(s.id),
    ).length ?? 0;
  const pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;

  // streak (days with feedback going back from today)
  const doneDays = new Set(
    (data?.feedback ?? []).map((f) =>
      new Date(f.created_at).toISOString().slice(0, 10),
    ),
  );
  let streak = 0;
  const cursor = new Date();
  while (doneDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" /> Adherence (28d)
        </CardTitle>
        <CardDescription>
          Sessions completed vs prescribed over the last four weeks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Completed" value={`${completed}/${planned}`} />
          <Stat label="Adherence" value={`${pct}%`} />
          <Stat label="Streak" value={`${streak}d`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-bold">{value}</div>
    </div>
  );
}

function DeltaPill({
  current,
  delta,
  unit,
}: {
  current: number | null;
  delta: number | null;
  unit: string;
}) {
  if (current == null) {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        —
      </span>
    );
  }
  const positive = (delta ?? 0) > 0;
  const negative = (delta ?? 0) < 0;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium">
      <Activity className="h-3 w-3 text-primary" />
      <span>
        {current} {unit}
      </span>
      {delta != null && delta !== 0 && (
        <span
          className={
            positive
              ? "text-green-600 dark:text-green-400"
              : negative
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground"
          }
        >
          {positive ? (
            <TrendingUp className="inline h-3 w-3" />
          ) : (
            <TrendingDown className="inline h-3 w-3" />
          )}
          {delta > 0 ? "+" : ""}
          {delta.toFixed(delta % 1 === 0 ? 0 : 1)}
        </span>
      )}
    </span>
  );
}
