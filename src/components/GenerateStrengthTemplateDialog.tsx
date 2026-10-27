import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, addDays, startOfWeek, parseISO } from "date-fns";
import { Dumbbell, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveVariantExercise } from "@/lib/exerciseVariants";
import { WEAK_POINTS, applyDeadliftStyle, applyWeakPoints, normalizeWeakIds } from "@/lib/weakPoints";
import { applyVolumeGuards } from "@/lib/volumeGuards";
import { applySessionSetBudget } from "@/lib/sessionSetBudget";
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
import { applyCoachSingles } from "@/lib/coachSingles";
import { applyPeakSingles, suggestOpeners, OPENER_LABELS } from "@/lib/peakOpeners";
import { compLiftKey } from "@/lib/liftIdentity";
import { cn } from "@/lib/utils";
import { DEFAULT_STRENGTH_VOLUME, volumeProfileFromRow } from "@/lib/strengthVolumeProfile";
import { applyBlockVolume, evaluateBlock, type VolumeTolerance } from "@/lib/blockVolume";
import { summarizePeaking, peakingBasis, PEAK_REFERENCE_LABEL, type PeakReference } from "@/lib/peaking";
import { buildD0Weeks } from "@/lib/taperAdapter";
import { SetProtocolPicker } from "@/components/SetProtocolPicker";
import { applySetProtocols, DEFAULT_SET_PROTOCOLS, type SetProtocolOptions } from "@/lib/setProtocols";
import { generatorSettingsSchema, type GeneratorSettings } from "@/lib/seasonPlanning";
import type { Json } from "@/integrations/supabase/types";
import { peakStartDate, peakFinalSessionDates, validPeakDate, peakPeriodDays, peakWeekStartDates } from "@/lib/peakingDates";


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
  defaultDaysPerWeek, defaultPeakWeeks, defaultEndDate, blockName, blockNotes, blockFocus, defaultCompetitionDate,
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
  defaultDaysPerWeek?: number;
  defaultPeakWeeks?: number;
  defaultEndDate?: string;
  defaultCompetitionDate?: string;
  blockName?: string;
  blockNotes?: string;
  blockFocus?: "volume" | "strength" | "competition";
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
  const [competitionDate, setCompetitionDate] = useState(defaultCompetitionDate ?? "");
  const [peakEndDate, setPeakEndDate] = useState(defaultEndDate ?? (defaultCompetitionDate ? format(addDays(parseISO(defaultCompetitionDate), -1), "yyyy-MM-dd") : format(addDays(parseISO(defaultStartDate ?? nextMonday), (defaultPeakWeeks ?? 3) * 7 - 1), "yyyy-MM-dd")));
  const [peakStart, setPeakStart] = useState(defaultStartDate ?? (defaultCompetitionDate ? peakStartDate(defaultCompetitionDate, defaultPeakWeeks ?? 3) : nextMonday));
  const effectiveStartDate = template?.buildFromHistory ? peakStart : startDate;
  const peakDays = peakPeriodDays(peakStart, peakEndDate);
  const peakWeeks = Math.ceil(peakDays / 7) || 3;
  const peakDateError = template?.buildFromHistory
    ? !peakDays ? "Välj en toppning på 14–42 dagar." : !validPeakDate(competitionDate) || peakEndDate !== format(addDays(parseISO(competitionDate), -1), "yyyy-MM-dd") ? "Ange tävlingsdatum och slutdatum dagen före tävlingen." : null
    : null;
  const peakWeekStarts = peakWeekStartDates(peakStart, peakEndDate);
  const historyAnchor = template?.buildFromHistory && peakStart < format(new Date(), "yyyy-MM-dd") ? peakStart : format(new Date(), "yyyy-MM-dd");
  const [daysPerWeek, setDaysPerWeek] = useState<number>(template?.daysPerWeek ?? 4);

  // When template changes, reset days-per-week to that template's default.
  useEffect(() => {
    if (template) setDaysPerWeek(defaultDaysPerWeek ?? template.daysPerWeek);
  }, [templateId, template, defaultDaysPerWeek]);

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const since28 = useMemo(() => format(addDays(new Date(), -28), "yyyy-MM-dd"), []);
  // Logs go back 3 months: the 4-week engine filters internally, the peaking
  // block needs the full quarter.
  const since92 = useMemo(() => format(addDays(parseISO(historyAnchor), -92), "yyyy-MM-dd"), [historyAnchor]);

  // ---- athlete history (drives individualisation) ----
  const historyQuery = useQuery({
    queryKey: ["individualisation-history", athleteId, since92, historyAnchor],
    enabled: open,
    queryFn: async (): Promise<HistoryInputs & { deloadWeekStarts: string[] }> => {
      const [logs, readiness, baselines, unavail, deloads] = await Promise.all([
        supabase
          .from("training_logs")
          .select("date, exercise, variation, reps, weight_kg, rpe, set_number, is_warmup_reference, is_technique")
          .eq("athlete_id", athleteId)
          .gte("date", since92),
        supabase
          .from("readiness_surveys")
          .select("date, fatigue, work_stress, life_stress, daily_form, sleep_hours")
          .eq("athlete_id", athleteId)
          .gte("date", since92),
        supabase.from("baselines").select("exercise, one_rm_kg").eq("athlete_id", athleteId),
        supabase
          .from("athlete_unavailability")
          .select("start_date, end_date, reason")
          .eq("athlete_id", athleteId)
          .gte("end_date", since28),
        supabase.from("week_plans").select("week_start_date").eq("athlete_id", athleteId).eq("is_deload", true).gte("week_start_date", since92),
      ]);
      if (deloads.error) throw deloads.error;
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
        today: historyAnchor,
        deloadWeekStarts: (deloads.data ?? []).map((w) => w.week_start_date),
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
        .select("squat_factor, bench_factor, deadlift_factor, volume_tolerance, weekly_set_cap").eq("athlete_id", athleteId).maybeSingle();
      if (error) throw error;
      return { ...volumeProfileFromRow(data), tolerance: (data?.volume_tolerance ?? "normal") as VolumeTolerance, cap: data?.weekly_set_cap ?? null };
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

  const [peakReference, setPeakReference] = useState<PeakReference>("work3");
  const peakSummary = useMemo(() => {
    if (!template?.buildFromHistory || !historyQuery.data) return null;
    return summarizePeaking({
      today: historyQuery.data.today,
      startDate: peakStart,
      deloadWeekStarts: historyQuery.data.deloadWeekStarts,
      logs: historyQuery.data.logs,
      baselines: historyQuery.data.baselines,
    }, peakReference);
  }, [template, historyQuery.data, peakReference, peakStart]);

  const [peakOptions, setPeakOptions] = useState<GeneratorSettings["peak"]>({ singles: "unset", rpe: 8, weeks: [1, 2, 3], openers: {} });
  const openerSuggestions = useMemo(() => historyQuery.data ? suggestOpeners(historyQuery.data, styleQuery.data) : [], [historyQuery.data, styleQuery.data]);
  const chosenOpeners = Object.fromEntries(openerSuggestions.map((s) => [s.key, peakOptions.openers[s.key] ?? s.kg ?? undefined]));

  const baseWeeks = useMemo(() => {
    if (!template) return [];
    if (template.buildFromHistory) {
      if(peakDateError) return [];
      return buildD0Weeks({start:peakStart,end:peakEndDate,competition:competitionDate,days:daysPerWeek,summary:peakSummary,singles:peakOptions.singles==="yes"}).weeks;
    }
    // Apply the athlete's competition style before loads so sumo/conventional get their own 1RM.
    if (template.skipVolumeFloors) return applyDeadliftStyle(template.buildWeeks(daysPerWeek), styleQuery.data);
    return applyDeadliftStyle(enforceTemplateFloors(template.buildWeeks(daysPerWeek)), styleQuery.data);
  }, [template, daysPerWeek, peakSummary, peakWeeks, peakDays, styleQuery.data,peakStart,peakEndDate,competitionDate,peakDateError,peakOptions.singles]);


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
  const isTimeLimited = Boolean(template?.sessionSetBudget);

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
      isPeaking ? baseWeeks : baseWeeks.length === 0
        ? []
        : applyAdjustments(
            baseWeeks,
            activeAdjustments,
            historyQuery.data ?? emptyHistory,
            // Runner strength keeps its fixed dose: coach tuning may lower
            // volume but never raise it (running takes priority).
            template?.skipVolumeFloors
              ? { ...tuning, volume: Math.min(1, tuning.volume), mainLifts: Math.min(1, tuning.mainLifts), accessory: Math.min(1, tuning.accessory) }
              : tuning,
             volumeProfile,
            { skipFloors: template?.skipVolumeFloors === true, shortSessions: isTimeLimited },
          ),
    [baseWeeks, activeAdjustments, historyQuery.data, emptyHistory, tuning, volumeProfile, template, isTimeLimited],
  );

  const [overload, setOverload] = useState<OverloadOptions>(DEFAULT_OVERLOAD);
  useEffect(() => { if (daysPerWeek < 4) setOverload((o) => (o.benchConsolidation ? { ...o, benchConsolidation: false } : o)); }, [daysPerWeek]);
  const [setProtocols, setSetProtocols] = useState<SetProtocolOptions>(DEFAULT_SET_PROTOCOLS);
  const [heavySingles, setHeavySingles] = useState<GeneratorSettings["heavySingles"]>({ enabled: false, rpe: 8, weeks: [2, 3] });
  const [volumeDeltas, setVolumeDeltas] = useState({ squat: 0, bench: 0, deadlift: 0 });
  const [extraSets,setExtraSets]=useState({squat:false,bench:false,deadlift:false});
  const [roundingKg,setRoundingKg]=useState<2.5|1.25|1>(2.5);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const preferencesQuery = useQuery({
    queryKey: ["generator-preferences", athleteId], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_generator_preferences").select("settings").eq("athlete_id", athleteId).maybeSingle();
      if (error) throw error;
      return data ? generatorSettingsSchema.parse(data.settings) : null;
    },
  });
  useEffect(() => {
    if (settingsLoaded || !preferencesQuery.isSuccess) return;
    const saved = preferencesQuery.data;
    if (saved) { setTuning(saved.tuning); setSetProtocols(saved.setProtocols); if (saved.overload) setOverload(saved.overload); setVolumeDeltas(saved.volumeDeltas); setHeavySingles(saved.heavySingles); setPeakOptions(saved.peak); setExtraSets(saved.extraSets);setRoundingKg(saved.roundingKg); }
    setSettingsLoaded(true);
  }, [preferencesQuery.isSuccess, preferencesQuery.data, settingsLoaded]);
  const settings: GeneratorSettings = { tuning, overload, setProtocols, volumeDeltas, heavySingles, peak: peakOptions,extraSets,roundingKg };
  const savePreferences = useMutation({
    mutationFn: async () => {
      const parsed = generatorSettingsSchema.parse(settings);
      const { error } = await supabase.from("athlete_generator_preferences").upsert({ athlete_id: athleteId, settings: parsed as unknown as Json, updated_by: coachId, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["generator-preferences", athleteId] }); toast.success("Coachvalen är sparade för nästa block"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const blockEvals = useMemo(() => {
    const h = historyQuery.data;
    if (!h) return [];
    const bl = Object.fromEntries(h.baselines.map((b) => [b.exercise, Number(b.one_rm_kg)]));
    return evaluateBlock(h.logs, bl, volumeProfileQuery.data?.tolerance ?? "normal", h.today);
  }, [historyQuery.data, volumeProfileQuery.data]);
  const blockResult = useMemo(
    () => {
      // Coach intensity tuning is already baked into target_rpe by
      // applyAdjustments — the wave applies its RPE as a relative offset, so
      // no extra intensityOffset is passed here.
      const weeks = applyDeadliftStyle(isPeaking || isTimeLimited ? finalWeeks : applyWeakPoints(applyOverload(finalWeeks, overload), weakIds), styleQuery.data);
      if (isPeaking) return { weeks: applyVolumeGuards(weeks, volumeProfile), warnings: buildD0Weeks({start:peakStart,end:peakEndDate,competition:competitionDate,days:daysPerWeek,summary:peakSummary,singles:peakOptions.singles==="yes"}).warnings };
      if (template?.sessionSetBudget) return {
        weeks: applyVolumeGuards(applySetProtocols(applySessionSetBudget(weeks, baseWeeks, template.sessionSetBudget), setProtocols),volumeProfile),
        warnings: [] as string[],
      };
      // Runner strength keeps its fixed dose: no data-driven extra sets.
      // Suggestions are displayed, but only coach-approved deltas alter the plan.
      let adapted = { weeks, warnings: [] as string[] };
      if (!template?.skipVolumeFloors) {
        for (let step = 0; step < 6; step++) {
          const evals = blockEvals.map((ev) => ({ ...ev, delta: (Math.abs(volumeDeltas[ev.lift]) > step ? Math.sign(volumeDeltas[ev.lift]) : 0) as -1 | 0 | 1 }));
          const next = applyBlockVolume(adapted.weeks, evals, volumeProfileQuery.data?.cap);
          adapted = { weeks: next.weeks, warnings: [...new Set([...adapted.warnings, ...next.warnings])] };
        }
      }
      const effProtocols = overload.waveLoading ? { ...setProtocols, squat: "keep" as const, bench: "keep" as const, deadlift: "keep" as const } : setProtocols;
      const guarded = applyVolumeGuards(adapted.weeks, volumeProfile);
      const changedByGuards = guarded.some((w, wi) => w.sessions.some((session, si) => session.exercises.some((e, ei) => e.target_sets !== adapted.weeks[wi]?.sessions[si]?.exercises[ei]?.target_sets)));
      return { weeks: applyVolumeGuards(applyCoachSingles(applySetProtocols(guarded, effProtocols), heavySingles, Boolean(template?.skipVolumeFloors)),volumeProfile), warnings: [...adapted.warnings, ...(changedByGuards ? guarded.flatMap((w,wi)=>w.sessions.flatMap((session,si)=>session.exercises.flatMap((e,ei)=>{const before=adapted.weeks[wi]?.sessions[si]?.exercises[ei]?.target_sets;return before!=null&&before!==e.target_sets?[`${e.exercise}: ${before} → ${e.target_sets} set (slutvakt: pass/vecka).`]:[]}))) : [])] };
    },
    [finalWeeks, overload, tuning.intensity, isPeaking, isTimeLimited, template, baseWeeks, weakIds, styleQuery.data, setProtocols, blockEvals, volumeDeltas, heavySingles, volumeProfileQuery.data, volumeProfile, peakOptions, openerSuggestions],
  );
  const plannedWeeks = blockResult.weeks;

  const weeklySets = useMemo(() => {
    const m = templateWeeklySets(plannedWeeks);
    return Array.from(m.entries())
      .map(([cat, sets]) => ({ cat, sets: Math.round(sets) }))
      .filter((r) => r.sets > 0)
      .sort((a, b) => b.sets - a.sets);
  }, [plannedWeeks]);

  const warnings = useMemo(
    () => (isPeaking || isTimeLimited ? [] : volumeWarnings(plannedWeeks, volumeProfile)),
    [plannedWeeks, volumeProfile, isPeaking, isTimeLimited],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error("Pick a template");
      if (!validPeakDate(effectiveStartDate)) throw new Error("Kontrollera startdatumet.");
      if (peakDateError) throw new Error(peakDateError);
      if (isPeaking && (peakOptions.singles === "unset" || (peakOptions.singles === "yes" && !peakOptions.weeks.some((w) => w < peakWeeks)))) throw new Error("Välj om atleten behöver singlar och minst en vecka om svaret är ja.");
      if (!settingsLoaded || preferencesQuery.isError) throw new Error("Coachvalen kunde inte laddas. Försök igen.");
      if (volumeProfileQuery.isLoading || volumeProfileQuery.isError || historyQuery.isLoading || historyQuery.isError) throw new Error("Athlete history or volume profile is not available yet. Try again.");
      const weeks = plannedWeeks.length > 0 ? plannedWeeks : baseWeeks;
      if (!isPeaking && !isTimeLimited) {
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
          name: blockName ?? template.name,
          goal: blockFocus ? `${blockFocus === "volume" ? "Volymfokus" : blockFocus === "strength" ? "Styrkefokus" : "Tävlingsförberedelse"}. ${template.goal}` : template.goal,
          start_date: effectiveStartDate,
          total_weeks: weeks.length,
          days_per_week: daysPerWeek,
          notes: `${isPeaking ? `Toppningsperiod: ${peakStart} – ${peakEndDate}. Referens: ${peakSummary?.referenceLabel}; arbetsveckor ${peakSummary?.referenceWeeks?.join(", ") || "saknar underlag"}.\nÖppningsvikter (coachens preliminära val): ${openerSuggestions.map((s) => `${OPENER_LABELS[s.key]} ${chosenOpeners[s.key] ?? "saknar underlag"}${chosenOpeners[s.key] ? " kg" : ""}`).join(", ")}. Toppningssinglar: ${peakOptions.singles === "yes" ? `ja, RPE ${peakOptions.rpe}, veckor ${peakOptions.weeks.filter((w) => w < peakWeeks).join(", ")}` : "nej"}.\n` : ""}${blockNotes ? `${blockNotes}\n` : ""}Template: ${template.name} · Inspiration: ${template.inspiration}. All sessions editable.${
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
        week_start_date: isPeaking ? peakWeekStarts[w.week_index - 1] : format(addDays(parseISO(effectiveStartDate), (w.week_index - 1) * 7), "yyyy-MM-dd"),
        status: "draft" as const,
        is_deload:w.kind==="deload",
        training_phase:isPeaking ? w.sessions[0]?.notes?.match(/Fas: ([^.]+)/)?.[1]??"peak" : w.kind,
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
            target_weight_kg: e.target_weight_kg == null ? null : Math.round(e.target_weight_kg / roundingKg) * roundingKg,
            intensity_metric: e.intensity_metric,
            lengthened_partials: e.lengthened_partials ?? false,
            last_set_to_failure: e.last_set_to_failure ?? false,
            is_technique:e.variation==="Teknikpass – ej EAk",
            notes: e.notes ?? null,
            order_index: idx,
          }));
          if (exRows.length > 0) {
            const { error: exErr } = await supabase.from("planned_exercises").insert(exRows);
            if (exErr) throw exErr;
          }
        }
      }

      const { error: settingsError } = await supabase.from("athlete_generator_preferences").upsert({ athlete_id: athleteId, settings: generatorSettingsSchema.parse(settings) as unknown as Json, updated_by: coachId, updated_at: new Date().toISOString() });
      if (settingsError) toast.error("Programmet skapades, men coachvalen kunde inte sparas för nästa block.");
      return meso.id;
    },
    onSuccess: (mesoId) => {
      toast.success(
        activeAdjustments.length > 0
          ? `${template?.name} generated — ${activeAdjustments.length} individual adjustment(s) applied`
          : `${template?.name} generated`,
      );
      qc.invalidateQueries({ queryKey: ["mesocycles", athleteId] });
      qc.invalidateQueries({ queryKey: ["generator-preferences", athleteId] });
      onCreated?.(mesoId);
      setOpen(false);
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
              <Button
                key={t.id}
                type="button"
                variant="outline"
                aria-pressed={templateId === t.id}
                disabled={Boolean(blockName) && templateId !== t.id}
                onClick={() => setTemplateId(t.id)}
                className={cn(
                  "h-auto flex-col items-stretch whitespace-normal rounded-lg border p-3 text-left transition-colors hover:border-primary/50",
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
              </Button>
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
              <Label htmlFor="tpl-start">Startdatum</Label>
              <Input
                id="tpl-start"
                disabled={Boolean(blockName)}
                type="date"
                value={effectiveStartDate}
                onChange={(e) => isPeaking ? setPeakStart(e.target.value) : setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tpl-dpw">Training days / week</Label>
              <select
                id="tpl-dpw"
                disabled={Boolean(blockName)}
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
              {template && !isPeaking && daysPerWeek < template.daysPerWeek && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Fewer days than the template — key work is folded into the remaining sessions
                  (volume +{Math.round((Math.min(1.25, 1 + 0.1 * (template.daysPerWeek - daysPerWeek)) - 1) * 100)}% per day).
                </p>
              )}
              {template && !isPeaking && daysPerWeek > template.daysPerWeek && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Extra days added as targeted hypertrophy / weak-point work; main-lift sets trimmed
                  ~{Math.round((1 - Math.max(0.8, 1 - 0.075 * (daysPerWeek - template.daysPerWeek))) * 100)}% to keep weekly load in range.
                </p>
              )}
            </div>
          </div>

          {/* ---- peaking options ---- */}
          {!isPeaking && <SetProtocolPicker value={setProtocols} onChange={setSetProtocols} shortSessions={isTimeLimited} />}
          {isPeaking && (
            <div className="rounded-lg border bg-card">
              <div className="border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary">
                Peaking options
              </div>
              <div className="space-y-3 p-3">
                <div><Label htmlFor="peak-end">Slutdatum</Label><Input id="peak-end" type="date" disabled={Boolean(blockName)} value={peakEndDate} onChange={(e) => setPeakEndDate(e.target.value)} /></div>
                <div><Label htmlFor="peak-meet">Tävlingsdatum</Label><Input id="peak-meet" type="date" disabled={Boolean(blockName)} value={competitionDate} onChange={(e) => { setCompetitionDate(e.target.value); if (validPeakDate(e.target.value)) setPeakEndDate(format(addDays(parseISO(e.target.value), -1), "yyyy-MM-dd")); }} /></div>
                {validPeakDate(competitionDate) && <p className="text-xs text-muted-foreground">Sista lätta pass före anpassning till träningsdagar: mark D−7, böj D−4, bänk D−3. Vila D−2 och D−1.</p>}
                {peakDateError && <p className="text-sm text-destructive">{peakDateError}</p>}
                <p className="text-sm">{peakDays || "–"} dagar · {peakWeeks} träningsperioder</p>
                <div>
                  <Label>Referensvolym</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["work3", "recent", "median", "robust"] as PeakReference[]).map((r) => (
                      <Button key={r} type="button" size="sm" variant={peakReference === r ? "default" : "outline"} aria-pressed={peakReference === r} onClick={() => setPeakReference(r)}>{r === "work3" ? "3 arbetsveckor" : r === "recent" ? "6-veckorssnitt" : r === "median" ? "12-veckorsmedian" : "Högsta referensen"}</Button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{PEAK_REFERENCE_LABEL[peakReference]}. Loggade avlastningsveckor räknas inte som arbetsveckor. Framtida toppning använder senaste tillgängliga arbete; kontrollera underlaget igen när starten närmar sig.</p>
                </div>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">Behöver atleten tunga singlar under toppningen?</legend>
                  <div className="flex gap-2">
                    {(["yes", "no"] as const).map((choice) => <Button key={choice} type="button" variant={peakOptions.singles === choice ? "default" : "outline"} aria-pressed={peakOptions.singles === choice} onClick={() => setPeakOptions((p) => ({ ...p, singles: choice }))}>{choice === "yes" ? "Ja, tunga singlar" : "Nej, utan singlar"}</Button>)}
                  </div>
                  {peakOptions.singles === "unset" && <p className="text-xs text-muted-foreground">Coachen behöver välja ja eller nej före generering.</p>}
                  {peakOptions.singles === "yes" && <>
                    <div><Label htmlFor="peak-single-rpe">Singelns högsta RPE</Label><Input id="peak-single-rpe" type="number" min={7} max={9} step={.5} value={peakOptions.rpe} onChange={(e) => setPeakOptions((p) => ({ ...p, rpe: Math.round(Math.max(7, Math.min(9, Number(e.target.value) || 8)) * 2) / 2 }))} /></div>
                    <div className="flex flex-wrap gap-4">{Array.from({ length: peakWeeks - 1 }, (_, i) => i + 1).map((n) => <label key={n} className="flex items-center gap-2"><Checkbox checked={peakOptions.weeks.includes(n)} onCheckedChange={(v) => setPeakOptions((p) => ({ ...p, weeks: v === true ? [...p.weeks, n] : p.weeks.filter((w) => w !== n) }))} />Vecka {n}</label>)}</div>
                    <p className="text-xs text-muted-foreground">En singel per tävlingslyft och vald vecka ersätter toppsetet. Inga tunga singlar på tävlingsveckan.</p>
                  </>}
                </fieldset>
                <fieldset className="space-y-3 border-t border-border pt-3">
                  <legend className="text-sm font-medium">Preliminära öppningsvikter</legend>
                  <p className="text-xs text-muted-foreground">RTS-tabellens singel @ RPE 8 från medianen av upp till tre senaste mätset inom 42 dagar, avrundat nedåt till 2,5 kg. Ett beräknat förslag, inte ett officiellt RTS-recept eller en garanti.</p>
                  <div className="grid gap-3 sm:grid-cols-3">{openerSuggestions.map((s) => <div key={s.key}>
                    <Label htmlFor={`opener-${s.key}`}>{OPENER_LABELS[s.key]} (kg)</Label>
                    <Input id={`opener-${s.key}`} type="number" min={2.5} step={2.5} value={chosenOpeners[s.key] ?? ""} placeholder="Coachens vikt" onChange={(e) => setPeakOptions((p) => ({ ...p, openers: { ...p.openers, [s.key]: e.target.value === "" ? undefined : Math.max(2.5, Number(e.target.value) || 2.5) } }))} />
                    <p className="mt-1 text-xs text-muted-foreground">{s.kg ? `Förslag ${s.kg} kg · ${s.count} mätset · senast ${s.latest}${s.count < 3 ? " · begränsat underlag" : ""}` : "Inget aktuellt mätset med RPE 7–10 och 1–5 reps. Ange vikten själv."}</p>
                  </div>)}</div>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPeakOptions((p) => ({ ...p, openers: {} }))}>Återställ historikförslagen</Button>
                </fieldset>
              </div>
            </div>
          )}

          {!isPeaking && !isTimeLimited && !template?.skipVolumeFloors && <fieldset className="space-y-3 border-t border-border pt-3">
            <legend className="text-sm font-medium">Coachvalda tunga singlar</legend>
            <div className="flex items-center gap-2"><Checkbox id="heavy-singles" checked={heavySingles.enabled} onCheckedChange={(v) => setHeavySingles((s) => ({ ...s, enabled: v === true }))} /><Label htmlFor="heavy-singles">En singel per huvudlyft och vald vecka</Label></div>
            {heavySingles.enabled && <><div><Label htmlFor="heavy-single-rpe">Singelns RPE</Label><Input id="heavy-single-rpe" type="number" min={8} max={9.5} step={.5} value={heavySingles.rpe} onChange={(e) => setHeavySingles((s) => ({ ...s, rpe: Math.max(8, Math.min(9.5, Number(e.target.value) || 8)) }))} /></div><div className="flex flex-wrap gap-4">{[1,2,3].map((n) => <label key={n} className="flex items-center gap-2"><Checkbox checked={heavySingles.weeks.includes(n)} onCheckedChange={(v) => setHeavySingles((s) => ({ ...s, weeks: v === true ? [...s.weeks, n] : s.weeks.filter((w) => w !== n) }))} />Vecka {n}</label>)}</div></>}
          </fieldset>}
          {/* ---- overload pushing ---- */}
          {!isPeaking && !isTimeLimited && (
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-primary">
                Tillägg
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
                    title: "Tung singel (RPE 8)",
                    desc: "En ren singel på cirka 90–92 % före arbetsseten. Singeln blir dagens mätset för EAk.",
                  },
                  {
                    key: "waveLoading" as const,
                    title: "Vågladdning",
                    desc: "Tre veckor: 5/4 reps @ RPE 7 → 4/3 reps @ RPE 8 → 3/2 reps @ RPE 8,5 → deload. Vågen styr reps och RPE på huvudlyften; valt setupplägg gäller då bara assistansen.",
                  },
                  {
                    key: "benchConsolidation" as const,
                    title: "Bänkkonsolidering",
                    desc: "Samlar bänken i ett tungt pausbänkpass, ett volympass och ett pass med smal grepp i stället för flera halvtunga. Visas vid 4 eller fler dagar.",
                  },
                ]
              ).filter((o) => o.key !== "benchConsolidation" || daysPerWeek >= 4).map((o) => {
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

          {!isPeaking && !isTimeLimited && (
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
                Volymunderlag och nedtrappning
              </div>
              <div className="space-y-1 p-3 text-xs text-muted-foreground">
                {historyQuery.isLoading && <p>Reading training history…</p>}
                {peakSummary?.thin && (
                  <p className="text-destructive">
                    Ofullständigt underlag: {peakSummary.referenceWeeks?.length ?? 0} arbetsveckor. Kontrollera volym och vikter före publicering.
                  </p>
                )}
                {peakSummary && peakingBasis(peakSummary).map((line) => <p key={line}>{line}</p>)}
                {blockResult.warnings.map(w=><p key={w} className="text-destructive">{w}</p>)}
                <div className="overflow-x-auto"><table className="w-full text-left"><caption className="text-left font-medium text-foreground">Planerade arbetsset per lyft</caption><thead><tr><th>Period</th><th>Böj</th><th>Bänk</th><th>Mark</th></tr></thead><tbody>{plannedWeeks.map((w, i) => <tr key={w.week_index}><td>{peakWeekStarts[i]} · {i === 0 && peakDays % 7 ? `${peakDays % 7} dagar` : "7 dagar"}</td>{(["squat", "bench", "deadlift"] as const).map((key) => <td key={key}>{w.sessions.flatMap((session) => session.exercises).filter((e) => compLiftKey(e.exercise) === key).reduce((n, e) => n + e.target_sets, 0)}</td>)}</tr>)}</tbody></table></div>
                <p>Kurvan är ett coachförslag. Styrkeforskningen stödjer minskad volym, men inte dessa exakta veckoprocent. Set, reps och tonnage är inte samma volymmått.</p>
                <p><a className="text-primary underline" href="https://doi.org/10.1519/SSC.0000000000000125" target="_blank" rel="noreferrer">Pritchard m.fl. 2015: maximal styrka och toppning</a> · <a className="text-primary underline" href="https://pubmed.ncbi.nlm.nih.gov/34846328/" target="_blank" rel="noreferrer">Enkät om styrkelyftares toppning</a>. RTS-tabellen används för viktskattning, inte som forskningsstöd för kurvan.</p>
              </div>
            </div>
          )}

          {!isPeaking && !isTimeLimited && blockEvals.length > 0 && (
            <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Volym från förra blocket (per lyft)</p>
              {blockEvals.map((e) => (
                <p key={e.lift}><b className="text-foreground">{e.lift === "squat" ? "Knäböj" : e.lift === "bench" ? "Bänk" : "Mark"} {e.delta > 0 ? "+1" : e.delta < 0 ? "−1" : "±0"} set/vecka</b> — {e.reason}</p>
              ))}
              {blockResult.warnings.map((w) => <p key={w} className="text-destructive">{w}</p>)}
            </div>
          )}
          {!isPeaking && !isTimeLimited && !template?.skipVolumeFloors && <div className="space-y-2 border-t border-border pt-3">
            <h3 className="text-sm font-medium">Godkänd setjustering per vecka</h3>
            <div className="grid grid-cols-3 gap-2">{(["squat", "bench", "deadlift"] as const).map((lift) => <div key={lift}><Label htmlFor={`delta-${lift}`}>{lift === "squat" ? "Knäböj" : lift === "bench" ? "Bänk" : "Mark"}</Label><Input id={`delta-${lift}`} type="number" min={-6} max={6} step={1} value={volumeDeltas[lift]} onChange={(e) => setVolumeDeltas((prev) => ({ ...prev, [lift]: Math.max(-6, Math.min(6, Math.trunc(Number(e.target.value)))) }))} /></div>)}</div>
            {blockResult.warnings.map((w) => <p key={w} className="text-xs text-destructive">{w}</p>)}
          </div>}
          <div className="space-y-3 border-t border-border pt-3">
            <h3 className="text-sm font-medium">Tillåt extra set efter dagens ordination</h3>
            <div className="flex flex-wrap gap-4">{(["squat","bench","deadlift"] as const).map(lift=><label key={lift} className="flex items-center gap-2 text-sm"><Checkbox checked={extraSets[lift]} onCheckedChange={checked=>setExtraSets(prev=>({...prev,[lift]:checked===true}))}/>{OPENER_LABELS[lift]}</label>)}</div>
            <Label>Viktsteg i träning</Label><div className="flex gap-2">{([2.5,1.25,1] as const).map(step=><Button key={step} variant={roundingKg===step?"default":"outline"} size="sm" onClick={()=>setRoundingKg(step)}>{step.toString().replace(".",",")} kg</Button>)}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><span className="text-xs text-muted-foreground">{preferencesQuery.isError ? "Kunde inte hämta sparade coachval." : preferencesQuery.data ? "Sparade coachval från tidigare block" : "Inga tidigare coachval sparade"}</span><Button variant="outline" size="sm" disabled={!settingsLoaded || savePreferences.isPending || preferencesQuery.isError} onClick={() => savePreferences.mutate()}>{savePreferences.isPending ? "Sparar…" : "Spara coachval"}</Button></div>
          {/* ---- coach tuning sliders ---- */}
          {isTimeLimited && <p className="text-xs text-muted-foreground">För att hålla passen korta används högst mallens 12 arbetsset och fem övningar per pass. Volymval kan minska antalet set, men inte lägga till fler. Annat setupplägg eller längre vila kan förlänga passet.</p>}
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
            disabled={!template || Boolean(peakDateError) || !validPeakDate(effectiveStartDate) || (isPeaking && (peakOptions.singles === "unset" || (peakOptions.singles === "yes" && !peakOptions.weeks.some((w) => w < peakWeeks)))) || !settingsLoaded || preferencesQuery.isError || mutation.isPending || volumeProfileQuery.isLoading || volumeProfileQuery.isError || historyQuery.isLoading || historyQuery.isError}
          >
            {mutation.isPending ? "Generating…" : "Generate mesocycle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
