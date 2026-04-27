import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Save, TrendingDown, TrendingUp, Plus, Settings, Calendar, BarChart3, History } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  processLogs,
  readinessClasses,
  readinessLabel,
  volumeQualityClasses,
  volumeQualityLabel,
} from "@/lib/eakoefficient";
import { cn } from "@/lib/utils";

const DEFAULT_EXERCISES = [
  "Knäböj",
  "Bänkpress",
  "Marklyft",
  "Axelpress",
  "Lår Curl",
];

export const Route = createFileRoute("/coach/athletes/$athleteId")({
  head: () => ({
    meta: [
      { title: "Athlete dashboard — EA Training System Coach" },
      { name: "description", content: "EAkoefficient analytics and programming for one athlete." },
    ],
  }),
  component: AthleteDetailPage,
});

function AthleteDetailPage() {
  const { athleteId } = useParams({ from: "/coach/athletes/$athleteId" });

  const profileQuery = useQuery({
    queryKey: ["athlete-profile", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, weight_class")
        .eq("id", athleteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/coach">
              <ArrowLeft className="mr-1 h-4 w-4" /> Roster
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {profileQuery.data?.full_name ?? "Athlete"}
          </h1>
          {profileQuery.data?.weight_class && (
            <p className="text-sm text-muted-foreground">
              Weight class: {profileQuery.data.weight_class}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link
              to="/coach/athletes/$athleteId/analytics"
              params={{ athleteId }}
            >
              <BarChart3 className="mr-1 h-4 w-4" /> Analytics
            </Link>
          </Button>
          <Button asChild>
            <Link
              to="/coach/athletes/$athleteId/cycles"
              params={{ athleteId }}
            >
              <Calendar className="mr-1 h-4 w-4" /> Mesocycles
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">EAkoefficient log</TabsTrigger>
          <TabsTrigger value="baselines">
            <Settings className="mr-1 h-3.5 w-3.5" /> Baselines
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTable athleteId={athleteId} />
        </TabsContent>

        <TabsContent value="baselines">
          <BaselinesEditor athleteId={athleteId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardTable({ athleteId }: { athleteId: string }) {
  const logsQuery = useQuery({
    queryKey: ["athlete-logs", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_logs")
        .select("*")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const baselinesQuery = useQuery({
    queryKey: ["athlete-baselines", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baselines")
        .select("exercise, one_rm_kg")
        .eq("athlete_id", athleteId);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const b of data ?? []) map[b.exercise] = Number(b.one_rm_kg);
      return map;
    },
  });

  const processed = useMemo(() => {
    const logs = logsQuery.data ?? [];
    const baselines = baselinesQuery.data ?? {};
    return processLogs(
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
  }, [logsQuery.data, baselinesQuery.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training log</CardTitle>
        <CardDescription>
          Each row is a logged set with EAkoefficient and volume quality applied.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Exercise</th>
              <th className="px-4 py-3">Set / Rep / Wt / RPE</th>
              <th className="bg-readiness-tint/30 px-4 py-3">Daily E1RM</th>
              <th className="bg-readiness-tint/30 px-4 py-3">EAkoeff %</th>
              <th className="bg-readiness-tint/30 px-4 py-3">Status</th>
              <th className="bg-volume-tint/30 px-4 py-3">E1RM Drop</th>
              <th className="bg-volume-tint/30 px-4 py-3">Volume</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logsQuery.isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!logsQuery.isLoading && processed.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No sets logged yet.
                </td>
              </tr>
            )}
            {processed.map((p) => (
              <tr key={p.source.id} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground">
                  {format(parseISO(p.source.date), "MMM d")}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{p.source.exercise}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.source.variation ?? "—"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div>
                    S:{p.source.set_number} ·{" "}
                    <span className="font-semibold">
                      {p.source.reps}×{p.source.weight_kg}kg
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    RPE {p.source.rpe}
                  </div>
                </td>
                <td className="bg-readiness-tint/20 px-4 py-3 font-bold">
                  {p.dailyE1RM.toFixed(1)} kg
                </td>
                <td className="bg-readiness-tint/20 px-4 py-3">
                  <div className="font-bold">
                    {p.eaKoefficient > 0 ? `${p.eaKoefficient.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Base: {p.baseline1RM || "—"}
                  </div>
                </td>
                <td className="bg-readiness-tint/20 px-4 py-3">
                  {p.eaKoefficient > 0 ? (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        readinessClasses(p.status),
                      )}
                    >
                      {readinessLabel(p.status)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="bg-volume-tint/20 px-4 py-3">
                  {p.source.set_number > 1 && p.set1E1RM > 0 ? (
                    <div className="flex items-center gap-1 font-semibold">
                      <TrendingDown
                        className={cn(
                          "h-3.5 w-3.5",
                          p.dropPercent >= 5
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      />
                      {p.dropPercent.toFixed(1)}%
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Set 1 ref</span>
                  )}
                </td>
                <td className="bg-volume-tint/20 px-4 py-3">
                  {p.source.set_number > 1 && p.set1E1RM > 0 ? (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        volumeQualityClasses(p.volume),
                      )}
                    >
                      {volumeQualityLabel(p.volume)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

const baselineSchema = z.object({
  exercise: z
    .string()
    .trim()
    .min(1, "Exercise required")
    .max(100, "Exercise name too long"),
  one_rm_kg: z.number().min(0).max(1000),
});

function BaselinesEditor({ athleteId }: { athleteId: string }) {
  const queryClient = useQueryClient();
  const baselinesQuery = useQuery({
    queryKey: ["athlete-baselines-list", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baselines")
        .select("id, exercise, one_rm_kg, updated_at")
        .eq("athlete_id", athleteId)
        .order("exercise", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ exercise, kg }: { exercise: string; kg: number }) => {
      const parsed = baselineSchema.parse({ exercise, one_rm_kg: kg });
      const { error } = await supabase
        .from("baselines")
        .upsert(
          {
            athlete_id: athleteId,
            exercise: parsed.exercise,
            one_rm_kg: parsed.one_rm_kg,
          },
          { onConflict: "athlete_id,exercise" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Baseline saved");
      queryClient.invalidateQueries({ queryKey: ["athlete-baselines-list", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-baselines", athleteId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("baselines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Baseline removed");
      queryClient.invalidateQueries({ queryKey: ["athlete-baselines-list", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-baselines", athleteId] });
    },
  });

  const existing = baselinesQuery.data ?? [];
  const existingExercises = new Set(existing.map((b) => b.exercise));
  const suggested = DEFAULT_EXERCISES.filter((e) => !existingExercises.has(e));

  const [newExercise, setNewExercise] = useState("");
  const [newKg, setNewKg] = useState<number>(100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>1RM Baselines</CardTitle>
        <CardDescription>
          Update these whenever the athlete tests a new rested 1RM. Required for
          EAkoefficient % to compute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {existing.map((b) => (
            <BaselineRow
              key={b.id}
              athleteId={athleteId}
              exercise={b.exercise}
              kg={Number(b.one_rm_kg)}
              updatedAt={b.updated_at}
              onSave={(kg) => upsertMutation.mutate({ exercise: b.exercise, kg })}
              onDelete={() => deleteMutation.mutate(b.id)}
            />
          ))}
          {existing.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No baselines yet — add the athlete's tested 1RMs below.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Add baseline
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="new-ex">Exercise</Label>
              <Input
                id="new-ex"
                list="suggested"
                value={newExercise}
                onChange={(e) => setNewExercise(e.target.value)}
                placeholder="e.g. Knäböj"
                maxLength={100}
              />
              <datalist id="suggested">
                {suggested.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
            <div className="w-32 space-y-1">
              <Label htmlFor="new-kg">1RM (kg)</Label>
              <Input
                id="new-kg"
                type="number"
                min={0}
                max={1000}
                step={2.5}
                value={newKg}
                onChange={(e) => setNewKg(Number(e.target.value))}
              />
            </div>
            <Button
              onClick={() => {
                if (!newExercise.trim()) {
                  toast.error("Enter an exercise name");
                  return;
                }
                upsertMutation.mutate({ exercise: newExercise.trim(), kg: newKg });
                setNewExercise("");
              }}
              disabled={upsertMutation.isPending}
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BaselineRow({
  exercise,
  kg,
  onSave,
  onDelete,
}: {
  exercise: string;
  kg: number;
  onSave: (kg: number) => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(kg);
  const dirty = value !== kg;

  return (
    <div className="flex items-end gap-2 rounded-md border border-border p-2">
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{exercise}</div>
        <Input
          type="number"
          min={0}
          max={1000}
          step={2.5}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="mt-1"
        />
      </div>
      <Button size="sm" disabled={!dirty} onClick={() => onSave(value)}>
        <Save className="mr-1 h-3.5 w-3.5" /> Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete}>
        Remove
      </Button>
    </div>
  );
}
