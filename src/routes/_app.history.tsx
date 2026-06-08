import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  readinessClasses,
  readinessLabel,
  processLogs,
} from "@/lib/eakoefficient";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/history")({
  head: () => ({
    meta: [
      { title: "History — EA Training System" },
      { name: "description", content: "Your past sessions and EAkoefficient trends." },
    ],
  }),
  component: HistoryPage,
});

interface LogRow {
  id: string;
  date: string;
  exercise: string;
  variation: string | null;
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe: number;
  edited_by_athlete_at: string | null;
  original_reps: number | null;
  original_rpe: number | null;
}

function HistoryPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const qc = useQueryClient();

  const logsQuery = useQuery({
    queryKey: ["logs-history", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_logs")
        .select(
          "id, date, exercise, variation, set_number, reps, weight_kg, rpe, edited_by_athlete_at, original_reps, original_rpe",
        )
        .eq("athlete_id", userId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LogRow[];
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

  const updateLog = useMutation({
    mutationFn: async ({
      id,
      reps,
      rpe,
      weight_kg,
    }: {
      id: string;
      reps: number;
      rpe: number;
      weight_kg: number;
    }) => {
      const { error } = await supabase
        .from("training_logs")
        .update({ reps, rpe, weight_kg, edited_by_athlete_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Set updated — your coach will see the change");
      qc.invalidateQueries({ queryKey: ["logs-history", userId] });
    },
    onError: (e) => toast.error((e as Error).message),
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
    const meta = new Map(logs.map((l) => [l.id, l]));
    const byDate = new Map<string, Array<{ p: typeof processed[number]; row: LogRow }>>();
    for (const p of processed) {
      const row = meta.get(p.source.id)!;
      const arr = byDate.get(p.source.date) ?? [];
      arr.push({ p, row });
      byDate.set(p.source.date, arr);
    }
    return Array.from(byDate.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [logsQuery.data, baselinesQuery.data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">
          Every set you've logged. Tap the pencil to fix reps or RPE — your coach will see the change.
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
            {sets.map(({ p, row }) => (
              <SetRow
                key={p.source.id}
                p={p}
                row={row}
                onSave={(reps, rpe) =>
                  updateLog.mutateAsync({ id: p.source.id, reps, rpe })
                }
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SetRow({
  p,
  row,
  onSave,
}: {
  p: ReturnType<typeof processLogs>[number];
  row: LogRow;
  onSave: (reps: number, rpe: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [reps, setReps] = useState(p.source.reps);
  const [rpe, setRpe] = useState(p.source.rpe);
  const [saving, setSaving] = useState(false);

  const wasEdited = !!row.edited_by_athlete_at;

  return (
    <div
      className={cn(
        "rounded-md border p-2 text-sm",
        wasEdited
          ? "border-amber-500/50 bg-amber-500/5"
          : "border-border",
      )}
    >
      {!editing ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{p.source.exercise}</div>
            <div className="text-xs text-muted-foreground">
              Set {p.source.set_number} · {p.source.reps}×{p.source.weight_kg}kg @RPE{p.source.rpe}
            </div>
            {wasEdited && (
              <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                Edited{" "}
                {row.original_reps != null && row.original_reps !== p.source.reps && (
                  <>· reps {row.original_reps}→{p.source.reps} </>
                )}
                {row.original_rpe != null && Number(row.original_rpe) !== p.source.rpe && (
                  <>· RPE {row.original_rpe}→{p.source.rpe}</>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
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
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="font-medium">{p.source.exercise} · Set {p.source.set_number}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`reps-${p.source.id}`} className="text-xs">Reps</Label>
              <Input
                id={`reps-${p.source.id}`}
                type="number"
                min={1}
                max={50}
                value={reps}
                onChange={(e) => setReps(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`rpe-${p.source.id}`} className="text-xs">RPE</Label>
              <Input
                id={`rpe-${p.source.id}`}
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={rpe}
                onChange={(e) => setRpe(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setReps(p.source.reps);
                setRpe(p.source.rpe);
                setEditing(false);
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </Button>
            <Button
              size="sm"
              disabled={saving || (reps === p.source.reps && rpe === p.source.rpe)}
              onClick={async () => {
                setSaving(true);
                try {
                  await onSave(reps, rpe);
                  setEditing(false);
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Save className="mr-1 h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
