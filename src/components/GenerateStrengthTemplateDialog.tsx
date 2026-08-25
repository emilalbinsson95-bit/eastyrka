import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, addDays, startOfWeek } from "date-fns";
import { Dumbbell, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { STRENGTH_TEMPLATES, getTemplate } from "@/lib/strengthTemplates";
import {
  applyAdjustments,
  buildAdjustments,
  type Adjustment,
  type HistoryInputs,
} from "@/lib/individualisation";
import { cn } from "@/lib/utils";

export function GenerateStrengthTemplateDialog({
  athleteId,
  coachId,
  athleteName,
  onCreated,
}: {
  athleteId: string;
  coachId: string;
  athleteName: string;
  onCreated?: (mesoId: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>(STRENGTH_TEMPLATES[0].id);
  const nextMonday = useMemo(
    () => format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7), "yyyy-MM-dd"),
    [],
  );
  const [startDate, setStartDate] = useState(nextMonday);

  const template = getTemplate(templateId);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(template?.daysPerWeek ?? 4);

  // When template changes, reset days-per-week to that template's default.
  useEffect(() => {
    if (template) setDaysPerWeek(template.daysPerWeek);
  }, [templateId, template]);

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const since28 = useMemo(() => format(addDays(new Date(), -28), "yyyy-MM-dd"), []);

  // ---- athlete history (drives individualisation) ----
  const historyQuery = useQuery({
    queryKey: ["individualisation-history", athleteId, since28],
    enabled: open,
    queryFn: async (): Promise<HistoryInputs> => {
      const [logs, readiness, baselines, unavail] = await Promise.all([
        supabase
          .from("training_logs")
          .select("date, exercise, variation, reps, weight_kg, rpe")
          .eq("athlete_id", athleteId)
          .gte("date", since28),
        supabase
          .from("readiness_surveys")
          .select("date, fatigue, work_stress, life_stress, daily_form, sleep_hours")
          .eq("athlete_id", athleteId)
          .gte("date", since28),
        supabase.from("baselines").select("exercise, one_rm_kg").eq("athlete_id", athleteId),
        supabase
          .from("athlete_unavailability")
          .select("start_date, end_date, reason")
          .eq("athlete_id", athleteId)
          .gte("end_date", since28),
      ]);
      if (logs.error) throw logs.error;
      if (readiness.error) throw readiness.error;
      if (baselines.error) throw baselines.error;
      if (unavail.error) throw unavail.error;
      return {
        today,
        logs: (logs.data ?? []) as HistoryInputs["logs"],
        readiness: (readiness.data ?? []) as HistoryInputs["readiness"],
        baselines: (baselines.data ?? []).map((b) => ({
          exercise: b.exercise,
          one_rm_kg: Number(b.one_rm_kg),
        })),
        unavailability: (unavail.data ?? []) as HistoryInputs["unavailability"],
      };
    },
  });

  const baseWeeks = useMemo(
    () => (template ? template.buildWeeks(daysPerWeek) : []),
    [template, daysPerWeek],
  );

  const suggestion = useMemo(() => {
    if (!historyQuery.data || baseWeeks.length === 0) return null;
    return buildAdjustments(baseWeeks, historyQuery.data);
  }, [historyQuery.data, baseWeeks]);

  const [offIds, setOffIds] = useState<Set<string>>(new Set());
  // Reset opt-outs whenever the suggestion set changes.
  const suggestionKey = suggestion?.adjustments.map((a) => a.id).join("|") ?? "";
  useEffect(() => {
    setOffIds(new Set());
  }, [suggestionKey]);

  const activeAdjustments: Adjustment[] = useMemo(
    () => (suggestion?.adjustments ?? []).filter((a) => a.defaultOn && !offIds.has(a.id)),
    [suggestion, offIds],
  );

  const toggle = (id: string) =>
    setOffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error("Pick a template");
      const weeks =
        historyQuery.data && activeAdjustments.length > 0
          ? applyAdjustments(baseWeeks, activeAdjustments, historyQuery.data)
          : baseWeeks;

      // 1. Mesocycle
      const { data: meso, error: mesoErr } = await supabase
        .from("mesocycles")
        .insert({
          coach_id: coachId,
          athlete_id: athleteId,
          name: template.name,
          goal: template.goal,
          start_date: startDate,
          total_weeks: template.weeks,
          days_per_week: daysPerWeek,
          notes: `Template: ${template.name} · Inspiration: ${template.inspiration}. All sessions editable.${
            activeAdjustments.length > 0
              ? ` Individualised from history: ${activeAdjustments.map((a) => a.title).join("; ")}.`
              : ""
          }`,
        })
        .select("id")
        .single();
      if (mesoErr) throw mesoErr;

      // 2. Week plans
      const weekRows = weeks.map((w) => ({
        coach_id: coachId,
        athlete_id: athleteId,
        mesocycle_id: meso.id,
        week_index: w.week_index,
        week_start_date: format(addDays(new Date(startDate), (w.week_index - 1) * 7), "yyyy-MM-dd"),
        status: "draft" as const,
        notes: w.notes ?? null,
      }));
      // Weeks may overlap with other plans/templates on the same dates — that's allowed.
      const { data: insertedWeeks, error: wErr } = await supabase
        .from("week_plans")
        .insert(weekRows)
        .select("id, week_index");
      if (wErr) throw wErr;


      const weekIdByIdx = new Map<number, string>();
      for (const r of insertedWeeks ?? []) {
        if (r.week_index != null) weekIdByIdx.set(r.week_index, r.id);
      }

      // 3. Sessions + exercises, per week. Templates already own day placement +
      // frequency shaping (see strengthTemplates.ts adaptSessions). Wipe any
      // pre-existing planned_sessions on these week_plans first so re-running
      // (or recovering from a partial failure) doesn't stack duplicates.
      const wpIds = Array.from(weekIdByIdx.values());
      if (wpIds.length > 0) {
        const { error: delErr } = await supabase
          .from("planned_sessions")
          .delete()
          .in("week_plan_id", wpIds);
        if (delErr) throw delErr;
      }

      for (const w of weeks) {
        const wpId = weekIdByIdx.get(w.week_index);
        if (!wpId) continue;

        const mapped = [...w.sessions]
          .sort((a, b) => a.day_of_week - b.day_of_week)
          .map((s) => ({
            day: s.day_of_week,
            title: s.title,
            notes: s.notes ?? null,
            exercises: s.exercises,
          }));


        for (const s of mapped) {
          const { data: ps, error: psErr } = await supabase
            .from("planned_sessions")
            .insert({
              week_plan_id: wpId,
              day_of_week: s.day,
              title: s.title,
              notes: s.notes,
            })
            .select("id")
            .single();
          if (psErr) throw psErr;

          const exRows = s.exercises.map((e, idx) => ({
            planned_session_id: ps.id,
            exercise: e.exercise,
            variation: e.variation ?? null,
            target_sets: e.target_sets,
            target_reps: e.target_reps,
            target_rpe: e.target_rpe ?? null,
            target_rir: e.target_rir ?? null,
            target_weight_kg: e.target_weight_kg ?? null,
            intensity_metric: e.intensity_metric,
            lengthened_partials: e.lengthened_partials ?? false,
            last_set_to_failure: e.last_set_to_failure ?? false,
            notes: e.notes ?? null,
            order_index: idx,
          }));
          if (exRows.length > 0) {
            const { error: exErr } = await supabase.from("planned_exercises").insert(exRows);
            if (exErr) throw exErr;
          }
        }
      }

      return meso.id;
    },
    onSuccess: (mesoId) => {
      toast.success(
        activeAdjustments.length > 0
          ? `${template?.name} generated — ${activeAdjustments.length} individual adjustment(s) applied`
          : `${template?.name} generated`,
      );
      qc.invalidateQueries({ queryKey: ["mesocycles", athleteId] });
      setOpen(false);
      onCreated?.(mesoId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Dumbbell className="mr-1 h-4 w-4" />
          Generate from template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Strength templates
          </DialogTitle>
          <DialogDescription>
            For {athleteName}. Pre-built mesocycles inspired by Milo Wolf, Mike Tuscherer & Josef
            Eriksson. Everything is editable after generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {STRENGTH_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors hover:border-primary/50",
                  templateId === t.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{t.name}</div>
                  <Badge variant="outline" className="text-[10px]">
                    {t.daysPerWeek}d × {t.weeks}w
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t.short}</div>
                <div className="mt-2 text-[11px] text-muted-foreground italic">
                  {t.inspiration}
                </div>
              </button>
            ))}
          </div>

          {template && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="mb-1 font-medium text-foreground">Goal</div>
              <p className="text-muted-foreground">{template.goal}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="tpl-start">Start date (Monday)</Label>
              <Input
                id="tpl-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tpl-dpw">Training days / week</Label>
              <select
                id="tpl-dpw"
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {[3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} days{template && n === template.daysPerWeek ? " (template default)" : ""}
                  </option>
                ))}
              </select>
              {template && daysPerWeek < template.daysPerWeek && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Fewer days than the template — key work is folded into the remaining sessions
                  (volume +{Math.round((Math.min(1.25, 1 + 0.1 * (template.daysPerWeek - daysPerWeek)) - 1) * 100)}% per day).
                </p>
              )}
              {template && daysPerWeek > template.daysPerWeek && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Extra days added as targeted hypertrophy / weak-point work; main-lift sets trimmed
                  ~{Math.round((1 - Math.max(0.8, 1 - 0.075 * (daysPerWeek - template.daysPerWeek))) * 100)}% to keep weekly load in range.
                </p>
              )}
            </div>
          </div>

          {/* ---- individualisation preview ---- */}
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-primary">
                Individualisation
              </div>
              {historyQuery.isLoading && (
                <span className="text-xs text-muted-foreground">Reading history…</span>
              )}
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto p-3">
              {suggestion == null && !historyQuery.isLoading && (
                <p className="text-xs text-muted-foreground">Pick a template to see suggestions.</p>
              )}
              {suggestion && suggestion.insufficientData && (
                <p className="text-xs text-muted-foreground">
                  Not enough recent history for {athleteName} — generating the plain template.
                </p>
              )}
              {suggestion && !suggestion.insufficientData && suggestion.adjustments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  History looks on track — the template fits as-is.
                </p>
              )}
              {suggestion?.adjustments.map((a) => {
                const on = a.defaultOn && !offIds.has(a.id);
                return (
                  <label
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-md border p-2 transition-colors",
                      on ? "border-primary/40 bg-primary/5" : "border-border opacity-60",
                    )}
                  >
                    <Checkbox checked={on} onCheckedChange={() => toggle(a.id)} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{a.title}</span>
                        <Badge
                          variant={a.severity === "warn" ? "destructive" : "outline"}
                          className="font-mono text-[10px]"
                        >
                          {a.effect}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.reason}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!template || mutation.isPending}
          >
            {mutation.isPending ? "Generating…" : "Generate mesocycle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
