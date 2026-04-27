import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  readinessClasses,
  readinessLabel,
  processLogs,
} from "@/lib/eakoefficient";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/history")({
  head: () => ({
    meta: [
      { title: "History — EAkoefficient" },
      { name: "description", content: "Your past sessions and EAkoefficient trends." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { user } = useAuth();
  const userId = user!.id;

  const logsQuery = useQuery({
    queryKey: ["logs-history", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_logs")
        .select("*")
        .eq("athlete_id", userId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const baselinesQuery = useQuery({
    queryKey: ["baselines", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baselines")
        .select("exercise, one_rm_kg")
        .eq("athlete_id", userId);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.exercise] = Number(r.one_rm_kg);
      return map;
    },
  });

  const grouped = useMemo(() => {
    const logs = logsQuery.data ?? [];
    const baselines = baselinesQuery.data ?? {};
    const processed = processLogs(
      logs.map((l) => ({
        id: l.id,
        date: l.date,
        exercise: l.exercise,
        variation: l.variation,
        set_number: l.set_number,
        reps: l.reps,
        weight_kg: Number(l.weight_kg),
        rpe: Number(l.rpe),
      })),
      baselines,
    );
    const byDate = new Map<string, typeof processed>();
    for (const p of processed) {
      const arr = byDate.get(p.source.date) ?? [];
      arr.push(p);
      byDate.set(p.source.date, arr);
    }
    return Array.from(byDate.entries()).sort((a, b) =>
      a[0] < b[0] ? 1 : -1,
    );
  }, [logsQuery.data, baselinesQuery.data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">
          Every set you've logged, with EAkoefficient applied.
        </p>
      </div>

      {logsQuery.isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      )}

      {!logsQuery.isLoading && grouped.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No sets logged yet. Get to the gym!
          </CardContent>
        </Card>
      )}

      {grouped.map(([date, sets]) => (
        <Card key={date}>
          <CardHeader>
            <CardTitle className="text-base">
              {format(parseISO(date), "EEEE, MMM d, yyyy")}
            </CardTitle>
            <CardDescription>
              {sets.length} set{sets.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sets.map((p) => (
              <div
                key={p.source.id}
                className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
              >
                <div>
                  <span className="font-medium">{p.source.exercise}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Set {p.source.set_number} · {p.source.reps}×{p.source.weight_kg}kg
                    @RPE{p.source.rpe}
                  </span>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    readinessClasses(p.status),
                  )}
                >
                  {p.eaKoefficient > 0
                    ? `${p.eaKoefficient.toFixed(0)}% · ${readinessLabel(p.status)}`
                    : `${p.dailyE1RM.toFixed(0)}kg E1RM`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
