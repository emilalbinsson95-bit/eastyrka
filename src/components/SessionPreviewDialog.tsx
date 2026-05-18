import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Dumbbell, Footprints, HeartPulse, Utensils, Moon, Flame, Wind } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarItem } from "@/lib/calendar";
import { estimateForRpe, type AthleteBenchmarks } from "@/lib/endurancePaceHr";
import type { Discipline } from "@/lib/endurance";
import { cn } from "@/lib/utils";

type Strain = "recovery" | "easy" | "moderate" | "hard" | "very hard";

function strainBand(score: number): Strain {
  if (score < 20) return "recovery";
  if (score < 40) return "easy";
  if (score < 70) return "moderate";
  if (score < 110) return "hard";
  return "very hard";
}

function strainTone(s: Strain): string {
  switch (s) {
    case "recovery": return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30";
    case "easy": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "moderate": return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "hard": return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
    case "very hard": return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
  }
}

function fuelPrompt(s: Strain, source: CalendarItem["source"]): { icon: typeof Utensils; title: string; body: string } {
  if (source === "rehab") {
    return { icon: Wind, title: "Move with intent", body: "Quality over load — keep it pain-free and breathe through every rep." };
  }
  switch (s) {
    case "recovery":
      return { icon: Moon, title: "Rest & recover", body: "Easy day. Hydrate, stretch, sleep well — your body adapts when you're not training." };
    case "easy":
      return { icon: Wind, title: "Light fuel", body: "Normal meals are enough. Don't crush it — the point is to stay fresh." };
    case "moderate":
      return { icon: Utensils, title: "Eat normally, hydrate well", body: "A regular meal 2–3h before. Sip water throughout the day." };
    case "hard":
      return { icon: Flame, title: "Eat up", body: "Carb-up 3–4h prior. Bring a sip drink. Refuel within 60min after." };
    case "very hard":
      return { icon: Flame, title: "Big day — fuel properly", body: "Front-load carbs the day before. Pre-session meal + carbs during. Protein + carbs within 30min after, then sleep early." };
  }
}

export function SessionPreviewDialog({
  item,
  open,
  onOpenChange,
}: {
  item: CalendarItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {item && <PreviewBody item={item} />}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ item }: { item: CalendarItem }) {
  const Icon = item.source === "endurance" ? Footprints : item.source === "rehab" ? HeartPulse : Dumbbell;

  const detailQuery = useQuery({
    queryKey: ["calendar-preview", item.source, item.sourceId],
    queryFn: async () => loadDetail(item),
  });

  const dateLabel = format(parseISO(item.effectiveDate), "EEEE, MMM d");
  const detail = detailQuery.data;
  const strain = detail ? strainBand(detail.strain) : null;
  const prompt = strain ? fuelPrompt(strain, item.source) : null;
  const PromptIcon = prompt?.icon ?? Utensils;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {item.title}
        </DialogTitle>
        <DialogDescription>
          {dateLabel}
          {item.isGhost && " · suggested"}
          {item.isCancelled && ` · cancelled${item.cancelReason ? ` — ${item.cancelReason}` : ""}`}
        </DialogDescription>
      </DialogHeader>

      {detailQuery.isLoading && (
        <div className="py-6 text-sm text-muted-foreground">Loading session…</div>
      )}

      {detail && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            {detail.chips.map((c, i) => (
              <Badge key={i} variant="outline" className="font-mono">{c}</Badge>
            ))}
          </div>

          {strain && prompt && (
            <div className={cn("flex gap-3 rounded-md border p-3", strainTone(strain))}>
              <PromptIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="space-y-0.5">
                <div className="text-sm font-semibold capitalize">{prompt.title} · {strain} day</div>
                <div className="text-xs opacity-90">{prompt.body}</div>
              </div>
            </div>
          )}

          {detail.lines.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What's on the plan</div>
              <ul className="space-y-1 text-sm">
                {detail.lines.map((l, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.notes && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {detail.notes}
            </div>
          )}
        </div>
      )}
    </>
  );
}

type Detail = { chips: string[]; lines: string[]; strain: number; notes?: string | null };

async function loadDetail(item: CalendarItem): Promise<Detail> {
  if (item.source === "planned") return loadStrength(item.sourceId);
  if (item.source === "endurance") return loadEndurance(item.sourceId);
  return loadRehab(item.sourceId);
}

async function loadStrength(plannedSessionId: string): Promise<Detail> {
  const { data: session } = await supabase
    .from("planned_sessions")
    .select("title, notes, planned_exercises(exercise, variation, target_sets, target_reps, target_rpe, target_weight_kg)")
    .eq("id", plannedSessionId)
    .maybeSingle();

  const exs = (session?.planned_exercises ?? []) as Array<{
    exercise: string; variation: string | null; target_sets: number; target_reps: number;
    target_rpe: number | null; target_weight_kg: number | null;
  }>;
  const totalSets = exs.reduce((a, e) => a + (e.target_sets ?? 0), 0);
  const avgRpe = exs.length
    ? exs.reduce((a, e) => a + (e.target_rpe ?? 7), 0) / exs.length
    : 7;
  // Strain heuristic: total sets weighted by RPE (sets 15, RPE 8 → 24; sets 25, RPE 9 → 45)
  const strain = totalSets * (avgRpe / 5);

  const lines = exs.map((e) => {
    const label = [e.exercise, e.variation].filter(Boolean).join(" — ");
    const parts: string[] = [`${e.target_sets}×${e.target_reps}`];
    if (e.target_weight_kg) parts.push(`@${e.target_weight_kg}kg`);
    if (e.target_rpe != null) parts.push(`RPE ${e.target_rpe}`);
    return `${label} · ${parts.join(" ")}`;
  });

  return {
    chips: [`${exs.length} exercises`, `${totalSets} sets`, `avg RPE ${avgRpe.toFixed(1)}`],
    lines,
    strain,
    notes: session?.notes ?? null,
  };
}

async function loadEndurance(sessionId: string): Promise<Detail> {
  const { data: session } = await supabase
    .from("endurance_sessions")
    .select("title, discipline, mode, planned_total_seconds, planned_avg_rpe, notes, athlete_id")
    .eq("id", sessionId)
    .maybeSingle();

  const { data: steps } = await supabase
    .from("endurance_steps")
    .select("id, order_index, parent_id, is_group, repeat_count, discipline, duration_seconds, target_rpe, notes")
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  let benchmarks: AthleteBenchmarks = {
    ten_k_pb_seconds: null, max_hr: null, resting_hr: null, ftp_watts: null, css_per_100m_seconds: null,
  };
  if (session?.athlete_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("ten_k_pb_seconds, max_hr, resting_hr, ftp_watts, css_per_100m_seconds")
      .eq("id", session.athlete_id as string)
      .maybeSingle();
    if (prof) benchmarks = prof as AthleteBenchmarks;
  }
  const sessionDiscipline = (session?.discipline ?? "run") as Discipline;

  const planned = session?.planned_total_seconds ?? 0;
  const totalFromSteps = sumStepSeconds(steps ?? []);
  const totalSeconds = planned || totalFromSteps;
  const avgRpe = session?.planned_avg_rpe ?? avgStepRpe(steps ?? []) ?? 5;
  const strain = (totalSeconds / 60) * (avgRpe / 5);

  const chips: string[] = [];
  if (session?.discipline) chips.push(String(session.discipline));
  if (totalSeconds) chips.push(formatMin(totalSeconds));
  chips.push(`avg RPE ${Number(avgRpe).toFixed(1)}`);
  const avgEst = estimateForRpe(sessionDiscipline, Number(avgRpe), benchmarks);
  if (avgEst.paceLabel) chips.push(avgEst.paceLabel);
  if (avgEst.wattLabel) chips.push(avgEst.wattLabel);
  if (avgEst.hrLabel) chips.push(avgEst.hrLabel);

  const tag = (disc: Discipline | null | undefined, rpe: number | null | undefined): string => {
    if (rpe == null) return "";
    const est = estimateForRpe((disc ?? sessionDiscipline) as Discipline, rpe, benchmarks);
    const bits = [est.paceLabel, est.wattLabel, est.hrLabel].filter(Boolean);
    return bits.length ? ` → ${bits.join(" · ")}` : "";
  };

  const lines: string[] = [];
  if (session?.mode === "structured") {
    const tops = (steps ?? []).filter((s) => !s.parent_id);
    for (const s of tops) {
      if (s.is_group) {
        const kids = (steps ?? []).filter((k) => k.parent_id === s.id);
        const kidStr = kids
          .map((k) => `${formatMM(k.duration_seconds)} @ RPE ${k.target_rpe ?? "-"}${tag(k.discipline as Discipline | null, k.target_rpe)}`)
          .join(" + ");
        lines.push(`${s.repeat_count}× (${kidStr})`);
      } else {
        lines.push(`${formatMM(s.duration_seconds)} @ RPE ${s.target_rpe ?? "-"}${tag(s.discipline as Discipline | null, s.target_rpe)}`);
      }
    }
  } else if (totalSeconds) {
    lines.push(`${formatMin(totalSeconds)} steady · RPE ${Number(avgRpe).toFixed(1)}${tag(sessionDiscipline, Number(avgRpe))}`);
  }

  return { chips, lines, strain, notes: session?.notes ?? null };
}

async function loadRehab(sessionId: string): Promise<Detail> {
  const { data: session } = await supabase
    .from("rehab_sessions")
    .select("title, subjective_notes, rehab_exercises(name, sets, reps, hold_seconds, load_kg, resistance_band)")
    .eq("id", sessionId)
    .maybeSingle();

  const exs = (session?.rehab_exercises ?? []) as Array<{
    name: string; sets: number | null; reps: number | null; hold_seconds: number | null;
    load_kg: number | null; resistance_band: string | null;
  }>;
  const totalSets = exs.reduce((a, e) => a + (e.sets ?? 0), 0);
  // Rehab is always "recovery" band — strain low on purpose
  const strain = Math.min(15, totalSets);
  const lines = exs.map((e) => {
    const parts: string[] = [];
    if (e.sets || e.reps) parts.push(`${e.sets ?? "-"}×${e.reps ?? "-"}`);
    if (e.hold_seconds) parts.push(`hold ${e.hold_seconds}s`);
    if (e.load_kg) parts.push(`${e.load_kg}kg`);
    if (e.resistance_band) parts.push(e.resistance_band);
    return `${e.name}${parts.length ? " · " + parts.join(" ") : ""}`;
  });
  return {
    chips: [`${exs.length} exercises`, `${totalSets} sets`],
    lines,
    strain,
    notes: session?.subjective_notes ?? null,
  };
}

type StepLite = { id?: string; order_index: number; parent_id: string | null; is_group: boolean; repeat_count: number; duration_seconds: number | null; target_rpe: number | null };
function sumStepSeconds(steps: StepLite[]): number {
  const byParent = new Map<string | null, StepLite[]>();
  for (const s of steps) {
    const arr = byParent.get(s.parent_id) ?? [];
    arr.push(s);
    byParent.set(s.parent_id, arr);
  }
  function walk(parentId: string | null, mult: number): number {
    const kids = byParent.get(parentId) ?? [];
    let total = 0;
    for (const k of kids) {
      if (k.is_group) total += walk((k as { id?: string }).id ?? null, mult * (k.repeat_count || 1));
      else total += (k.duration_seconds ?? 0) * mult;
    }
    return total;
  }
  return walk(null, 1);
}

function avgStepRpe(steps: StepLite[]): number | null {
  const leaves = steps.filter((s) => !s.is_group && s.target_rpe != null);
  if (!leaves.length) return null;
  return leaves.reduce((a, s) => a + (s.target_rpe ?? 0), 0) / leaves.length;
}

function formatMin(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}min` : `${h}h`;
}
function formatMM(sec: number | null): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
