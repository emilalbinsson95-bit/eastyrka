import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, addDays, startOfWeek } from "date-fns";
import { Dumbbell, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveVariantExercise } from "@/lib/exerciseVariants";
import { WEAK_POINTS, applyDeadliftStyle, applyWeakPoints, normalizeWeakIds } from "@/lib/weakPoints";
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
import { Slider } from "@/components/ui/slider";
import { STRENGTH_TEMPLATES, getTemplate } from "@/lib/strengthTemplates";
import {
  applyAdjustments,
  enforceTemplateFloors,
  buildAdjustments,
  categoryLabel,
  templateWeeklySets,
  volumeWarnings,
  DEFAULT_TUNING,
  type CoachTuning,
  type Adjustment,
  type HistoryInputs,
} from "@/lib/individualisation";
import {
  applyOverload,
  overloadSummary,
  overloadTouched,
  DEFAULT_OVERLOAD,
  type OverloadOptions,
} from "@/lib/overload";
import { cn } from "@/lib/utils";
import { DEFAULT_STRENGTH_VOLUME, volumeProfileFromRow } from "@/lib/strengthVolumeProfile";
import { summarizePeaking, peakingBasis, PEAK_REFERENCE_LABEL, type PeakReference } from "@/lib/peaking";
import { SetProtocolPicker } from "@/components/SetProtocolPicker";
import { applySetProtocols, DEFAULT_SET_PROTOCOLS, type SetProtocolOptions } from "@/lib/setProtocols";


export function GenerateStrengthTemplateDialog({
  athleteId,
  coachId,
  athleteName,
  onCreated,
  defaultTemplateId,
  defaultStartDate,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger,
}: {
  athleteId: string;
  coachId: string;
  athleteName: string;
  onCreated?: (mesoId: string) => void;
  /** Preselect a template (e.g. "peak-3w" when launched from a competition). */
  defaultTemplateId?: string;
  /** Preselect a start date (yyyy-MM-dd). */
  defaultStartDate?: string;
  /** Controlled open state — use together with hideTrigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [templateId, setTemplateId] = useState<string>(defaultTemplateId ?? STRENGTH_TEMPLATES[0].id);
  const nextMonday = useMemo(
    () => format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7), "yyyy-MM-dd"),
    [],
  );
  const [startDate, setStartDate] = useState(defaultStartDate ?? nextMonday);

  const template = getTemplate(templateId);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(template?.daysPerWeek ?? 4);

  // When template changes, reset days-per-week to that template's default.
  useEffect(() => {
    if (template) setDaysPerWeek(template.daysPerWeek);
  }, [templateId, template]);

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const since28 = useMemo(() => format(addDays(new Date(), -28), "yyyy-MM-dd"), []);
  // Logs go back 3 months: the 4-week engine filters internally, the peaking
  // block needs the full quarter.
  const since92 = useMemo(() => format(addDays(new Date(), -92), "yyyy-MM-dd"), []);

  // ---- athlete history (drives individualisation) ----
  const historyQuery = useQuery({
    queryKey: ["individualisation-history", athleteId, since92],
    enabled: open,
    queryFn: async (): Promise<HistoryInputs> => {
      const [logs, readiness, baselines, unavail] = await Promise.all([
        supabase
          .from("training_logs")
          .select("date, exercise, variation, reps, weight_kg, rpe")
          .eq("athlete_id", athleteId)
          .gte("date", since92),
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
      const merged = new Map<string, number>();
      try {
        const { deriveBaselinesFromLogs } = await import("@/lib/baselineFromLogs");
        for (const d of await deriveBaselinesFromLogs(athleteId)) merged.set(d.exercise, d.oneRmKg);
      } catch {
        /* ignore */
      }
      for (const b of baselines.data ?? []) {
        if (Number(b.one_rm_kg) > 0) merged.set(b.exercise, Number(b.one_rm_kg));
      }
      return {
        today,
        logs: (logs.data ?? []) as HistoryInputs["logs"],
        readiness: (readiness.data ?? []) as HistoryInputs["readiness"],
        baselines: [...merged].map(([exercise, one_rm_kg]) => ({ exercise, one_rm_kg })),
        unavailability: (unavail.data ?? []) as HistoryInputs["unavailability"],
      };
    },
  });

  const volumeProfileQuery = useQuery({
    queryKey: ["strength-volume-profile", athleteId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_strength_volume_profiles")
        .select("squat_factor, bench_factor, deadlift_factor").eq("athlete_id", athleteId).maybeSingle();
      if (error) throw error;
      return volumeProfileFromRow(data);
    },
  });
  const volumeProfile = volumeProfileQuery.data ?? DEFAULT_STRENGTH_VOLUME;

  const [weakIds, setWeakIds] = useState<string[]>([]);
  const styleQuery = useQuery({
    queryKey: ["deadlift-style", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_strength_volume_profiles").select("deadlift_style").eq("athlete_id", athleteId).maybeSingle();
      if (error) throw error;
      return (data?.deadlift_style ?? null) as "conventional" | "sumo" | null;
    },
  });
  const weakQuery = useQuery({
    queryKey: ["athlete-weak-points", athleteId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_weak_points")
        .select("weak_points").eq("athlete_id", athleteId).maybeSingle();
      if (error) throw error;
      return (data?.weak_points ?? []) as string[];
    },
  });
  useEffect(() => {
    if (weakQuery.data) setWeakIds(normalizeWeakIds(weakQuery.data));
  }, [weakQuery.data]);
  const toggleWeak = (id: string) =>
    setWeakIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : normalizeWeakIds([id, ...prev]),
    );

  const [peakReference, setPeakReference] = useState<PeakReference>("robust");
  const peakSummary = useMemo(() => {
    if (!template?.buildFromHistory || !historyQuery.data) return null;
    return summarizePeaking({
      today: historyQuery.data.today,
      logs: historyQuery.data.logs,
      baselines: historyQuery.data.baselines,
    }, peakReference);
  }, [template, historyQuery.data, peakReference]);

  const [openers, setOpeners] = useState(false);

  const baseWeeks = useMemo(() => {
    if (!template) return [];
    if (template.buildFromHistory && peakSummary) {
      return template.buildFromHistory(daysPerWeek, peakSummary, { openers });
    }
    if (template.skipVolumeFloors) return template.buildWeeks(daysPerWeek);
    return enforceTemplateFloors(template.buildWeeks(daysPerWeek));
  }, [template, daysPerWeek, peakSummary, openers]);


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

  const isPeaking = Boolean(template?.buildFromHistory);

  // A peak is already derived from history — only the load prescription and
  // genuine fatigue cuts apply; never let the engine add volume back into a taper.
  const visibleAdjustments: Adjustment[] = useMemo(
    () =>
      (suggestion?.adjustments ?? []).filter(
        (a) => !isPeaking || a.kind === "loads" || (a.kind === "global-volume" && (a.multiplier ?? 1) < 1),
      ),
    [suggestion, isPeaking],
  );

  const activeAdjustments: Adjustment[] = useMemo(
    () => visibleAdjustments.filter((a) => a.defaultOn && !offIds.has(a.id)),
    [visibleAdjustments, offIds],
  );

  const toggle = (id: string) =>
    setOffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- coach tuning sliders ----
  const [tuning, setTuning] = useState<CoachTuning>(DEFAULT_TUNING);
  const setTune = (k: keyof CoachTuning, v: number) =>
    setTuning((t) => ({ ...t, [k]: v }));
  const tuningTouched =
    tuning.volume !== 1 || tuning.intensity !== 0 || tuning.accessory !== 1 || tuning.mainLifts !== 1;

  const emptyHistory: HistoryInputs = useMemo(
    () => ({ today, logs: [], readiness: [], baselines: [], unavailability: [] }),
    [today],
  );

  const finalWeeks = useMemo(
    () =>
      baseWeeks.length === 0
        ? []
        : applyAdjustments(
            baseWeeks,
            activeAdjustments,
            historyQuery.data ?? emptyHistory,
            tuning,
             volumeProfile,
            { skipFloors: template?.skipVolumeFloors === true },
          ),
    [baseWeeks, activeAdjustments, historyQuery.data, emptyHistory, tuning, volumeProfile, template],
  );

  const [overload, setOverload] = useState<OverloadOptions>(DEFAULT_OVERLOAD);
  const [setProtocols, setSetProtocols] = useState<SetProtocolOptions>(DEFAULT_SET_PROTOCOLS);
  const plannedWeeks = useMemo(
    () => {
      const weeks = applyDeadliftStyle(isPeaking ? finalWeeks : applyWeakPoints(applyOverload(finalWeeks, overload), weakIds), styleQuery.data);
      return isPeaking ? weeks : applySetProtocols(applyVolumeGuards(weeks), setProtocols);
    },
    [finalWeeks, overload, isPeaking, weakIds, styleQuery.data, setProtocols],
  );

  const weeklySets = useMemo(() => {
    const m = templateWeeklySets(plannedWeeks);
    return Array.from(m.entries())
      .map(([cat, sets]) => ({ cat, sets: Math.round(sets) }))
      .filter((r) => r.sets > 0)
      .sort((a, b) => b.sets - a.sets);
  }, [plannedWeeks]);

  const warnings = useMemo(
    () => (isPeaking ? [] : volumeWarnings(plannedWeeks, volumeProfile)),
    [plannedWeeks, volumeProfile, isPeaking],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error("Pick a template");
      if (volumeProfileQuery.isLoading || volumeProfileQuery.isError || historyQuery.isLoading || historyQuery.isError) throw new Error("Athlete history or volume profile is not available yet. Try again.");
      const weeks = plannedWeeks.length > 0 ? plannedWeeks : baseWeeks;
      if (!isPeaking) {
        const { error: wpErr } = await supabase.from("athlete_weak_points").upsert(
          { athlete_id: athleteId, weak_points: weakIds, updated_at: new Date().toISOString() },
          { onConflict: "athlete_id" },
        );
        if (wpErr) throw wpErr;
      }


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
          } Athlete volume profile: squat ×${volumeProfile.squat.toFixed(2)}, bench ×${volumeProfile.bench.toFixed(2)}, deadlift ×${volumeProfile.deadlift.toFixed(2)}.${
            tuningTouched
              ? ` Coach tuning: volume ×${tuning.volume.toFixed(2)}, main lifts ×${tuning.mainLifts.toFixed(2)}, accessories ×${tuning.accessory.toFixed(2)}, RPE ${tuning.intensity >= 0 ? "+" : ""}${tuning.intensity}.`
              : ""
          }${
            overloadTouched(overload)
              ? ` Overload: ${overloadSummary(overload).join("; ")}.`
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
            ...resolveVariantExercise(e.exercise, e.variation),
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
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <Dumbbell className="mr-1 h-4 w-4" />
            Generate from template
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Strength templates
          </DialogTitle>
          <DialogDescription>
            For {athleteName}. Pre-built 4-week blocks: effort is set with RPE (how many reps you
            had left in each set), with priority on your competition lifts. Everything is editable
            after generation.
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
                {Array.from(
                  { length: (template?.maxDays ?? 6) - (template?.minDays ?? 3) + 1 },
                  (_, i) => (template?.minDays ?? 3) + i,
                ).map((n) => (
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

          {/* ---- peaking options ---- */}
          {!isPeaking && <SetProtocolPicker value={setProtocols} onChange={setSetProtocols} />}
          {isPeaking && (
            <div className="rounded-lg border bg-card">
              <div className="border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary">
                Peaking options
              </div>
              <div className="space-y-3 p-3">
                <div>
                  <span className="block text-sm font-medium">Reference volume</span>
                  <span className="block text-xs text-muted-foreground">
                    The "normal" weekly volume the taper cuts from.
                  </span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {(["recent", "median", "robust"] as PeakReference[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setPeakReference(r)}
                        className={cn(
                          "rounded-md border p-2 text-left text-xs transition-colors",
                          peakReference === r ? "border-primary/40 bg-primary/5" : "border-border",
                        )}
                      >
                        <span className="block font-medium capitalize">
                          {r === "recent" ? "6-week mean" : r === "median" ? "12-week median" : "Robust (recommended)"}
                        </span>
                        <span className="block text-muted-foreground">{PEAK_REFERENCE_LABEL[r]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-md border p-2 transition-colors",
                    openers ? "border-primary/40 bg-primary/5" : "border-border",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={openers}
                    onChange={(e) => setOpeners(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium">Opener singles (optional)</span>
                    <span className="block text-xs text-muted-foreground">
                      Adds one single at ~opener weight (RPE 8) before the top set in weeks 1–2.
                      Research shows no measurable performance effect — pure confidence rep.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ---- overload pushing ---- */}
          {!isPeaking && (
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-primary">
                Overload pushing
              </div>
              {overloadTouched(overload) && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline"
                  onClick={() => setOverload(DEFAULT_OVERLOAD)}
                >
                  Reset
                </button>
              )}
            </div>
            <div className="space-y-2 p-3">
              {(
                [
                  {
                    key: "overWarmSingles" as const,
                    title: "Heavy over-warm singles (RPE 8)",
                    desc: "Work up to one clean single at ~90–92% before working sets — keeps neural familiarity with heavy bar speeds.",
                  },
                  {
                    key: "waveLoading" as const,
                    title: "Structured wave loading",
                    desc: "Tre veckor: 5/4 reps @ RPE 7 → 4/3 reps @ RPE 8 → 3/2 reps @ RPE 8,5 → deload. Vikten följer reps och RPE; procent är uppskattningar.",
                  },
                  {
                    key: "benchConsolidation" as const,
                    title: "Reduce weekly bench redundancy",
                    desc: "Consolidates bench into heavy comp-pause, hypertrophy and close-grip days instead of several semi-heavy ones.",
                  },
                ]
              ).map((o) => {
                const on = overload[o.key];
                return (
                  <label
                    key={o.key}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-md border p-2 transition-colors",
                      on ? "border-primary/40 bg-primary/5" : "border-border",
                    )}
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) =>
                        setOverload((prev) => ({ ...prev, [o.key]: v === true }))
                      }
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{o.title}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{o.desc}</p>
                    </div>
                  </label>
                );
              })}

              <div className="rounded-md border p-2">
                <Label htmlFor="stance" className="text-sm font-medium">
                  Commit to one deadlift stance
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Trains one stance for the whole block; the second pull of the week becomes an RDL
                  or deficit builder instead of splitting main-stance adaptations.
                </p>
                <select
                  id="stance"
                  value={overload.deadliftStance}
                  onChange={(e) =>
                    setOverload((prev) => ({
                      ...prev,
                      deadliftStance: e.target.value as OverloadOptions["deadliftStance"],
                    }))
                  }
                  className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="keep">Keep template (both stances / as written)</option>
                  <option value="conventional">Conventional only</option>
                  <option value="sumo">Sumo only</option>
                </select>
              </div>
            </div>
          </div>
          )}

          {!isPeaking && (
            <div className="rounded-lg border bg-card">
              <div className="border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary">
                {t("generate.weakPointsTitle")}
              </div>
              <div className="space-y-3 p-3">
                <p className="text-xs text-muted-foreground">
                  {t("generate.weakPointsDesc")}
                </p>
                {(["squat", "bench", "deadlift"] as const).map((lift) => (
                  <div key={lift}>
                    <div className="mb-1 text-xs font-medium capitalize">{lift}</div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {WEAK_POINTS.filter((w) => w.lift === lift).map((w) => {
                        const on = weakIds.includes(w.id);
                        return (
                          <label key={w.id} className={cn("flex cursor-pointer gap-2 rounded-md border p-2", on ? "border-primary/40 bg-primary/5" : "border-border")}>
                            <Checkbox checked={on} onCheckedChange={() => toggleWeak(w.id)} className="mt-0.5" aria-label={w.label} />
                            <div className="min-w-0">
                              <div className="text-sm">{w.label}</div>
                              <p className="text-[11px] text-muted-foreground">{w.variation.exercise} + {w.accessory.exercise}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---- what the peak is based on ---- */}
          {isPeaking && (
            <div className="rounded-lg border bg-card">
              <div className="border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary">
                Based on the last 3 months
              </div>
              <div className="space-y-1 p-3 text-xs text-muted-foreground">
                {historyQuery.isLoading && <p>Reading training history…</p>}
                {peakSummary?.thin && (
                  <p className="text-destructive">
                    Only {peakSummary.logDays} logged training days in the last 3 months — the peak
                    falls back to conventional volumes. Check every session before publishing.
                  </p>
                )}
                {peakSummary &&
                  peakingBasis(peakSummary).map((line) => <p key={line}>{line}</p>)}
              </div>
            </div>
          )}

          {/* ---- coach tuning sliders ---- */}
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Athlete volume baseline: squat {Math.round(volumeProfile.squat * 100)}%, bench {Math.round(volumeProfile.bench * 100)}%, deadlift {Math.round(volumeProfile.deadlift * 100)}%. Set this on the athlete's Baselines page; the preview below includes it.
          </div>
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-primary">
                Coach tuning
              </div>
              {tuningTouched && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground underline"
                  onClick={() => setTuning(DEFAULT_TUNING)}
                >
                  Reset
                </button>
              )}
            </div>
            <div className="space-y-3 p-3">
              {(
                [
                  {
                    key: "volume" as const,
                    label: "Total volume",
                    value: tuning.volume,
                    min: 0.7,
                    max: 1.3,
                    step: 0.05,
                    fmt: (v: number) => `${v >= 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)}%`,
                  },
                  {
                    key: "mainLifts" as const,
                    label: "Main lifts (SBD)",
                    value: tuning.mainLifts,
                    min: 0.7,
                    max: 1.3,
                    step: 0.05,
                    fmt: (v: number) => `${v >= 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)}%`,
                  },
                  {
                    key: "accessory" as const,
                    label: "Accessories",
                    value: tuning.accessory,
                    min: 0.5,
                    max: 1.5,
                    step: 0.05,
                    fmt: (v: number) => `${v >= 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)}%`,
                  },
                  {
                    key: "intensity" as const,
                    label: "Intensity (RPE)",
                    value: tuning.intensity,
                    min: -1.5,
                    max: 1.5,
                    step: 0.5,
                    fmt: (v: number) => (v === 0 ? "as written" : `${v > 0 ? "+" : ""}${v} RPE`),
                  },
                ]
              ).map((s) => (
                <div key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-mono tabular-nums">{s.fmt(s.value)}</span>
                  </div>
                  <Slider
                    value={[s.value]}
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    onValueChange={([v]) => setTune(s.key, v)}
                  />
                </div>
              ))}

              {weeklySets.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2">
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Weekly sets (working weeks)
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {weeklySets.map((r) => (
                      <Badge key={r.cat} variant="outline" className="font-mono text-[10px]">
                        {categoryLabel(r.cat)} {r.sets}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {warnings.map((w) => (
                <p
                  key={`${w.category}-${w.level}`}
                  className={cn(
                    "text-[11px]",
                    w.level === "above-mrv" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {w.message}
                </p>
              ))}
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
              {suggestion && !suggestion.insufficientData && visibleAdjustments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  History looks on track — the template fits as-is.
                </p>
              )}
              {visibleAdjustments.map((a) => {
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
            disabled={!template || mutation.isPending || volumeProfileQuery.isLoading || volumeProfileQuery.isError || historyQuery.isLoading || historyQuery.isError}
          >
            {mutation.isPending ? "Generating…" : "Generate mesocycle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
