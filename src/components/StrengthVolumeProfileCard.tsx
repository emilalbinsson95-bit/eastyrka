import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_STRENGTH_VOLUME, volumeProfileFromRow, type StrengthVolumeProfile } from "@/lib/strengthVolumeProfile";
import { volumeCategory, type VolumeCategory } from "@/lib/strengthTemplates";
import { VOLUME_LANDMARKS } from "@/lib/individualisation";

const SLIDER_MIN = 0.6;
const SLIDER_MAX = 1.4;
const MEDIAN_WEEKS = 12;

/** Lift key shown on the card -> volume category counted from the logs. */
const LIFT_CATEGORY: Record<keyof StrengthVolumeProfile, VolumeCategory> = {
  squat: "squat",
  bench: "horizontal-press",
  deadlift: "hinge",
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function weekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Median weekly working sets per lift over the last 12 weeks, expressed as a
 * slider factor: median sets divided by the midpoint of the category's
 * MEV–MRV range (the volume the "Baseline" position roughly represents).
 */
function medianFactors(logs: Array<{ exercise: string; variation: string | null; date: string }>): Partial<Record<keyof StrengthVolumeProfile, { sets: number; factor: number }>> {
  const perWeek = new Map<string, Map<VolumeCategory, number>>();
  for (const log of logs) {
    const cat = volumeCategory({ exercise: log.exercise, variation: log.variation ?? undefined });
    const week = perWeek.get(weekStart(log.date)) ?? new Map<VolumeCategory, number>();
    week.set(cat, (week.get(cat) ?? 0) + 1);
    perWeek.set(weekStart(log.date), week);
  }
  const out: Partial<Record<keyof StrengthVolumeProfile, { sets: number; factor: number }>> = {};
  for (const [lift, cat] of Object.entries(LIFT_CATEGORY) as Array<[keyof StrengthVolumeProfile, VolumeCategory]>) {
    const weeklySets = [...perWeek.values()]
      .map((week) => week.get(cat) ?? 0)
      .filter((sets) => sets > 0); // only weeks the lift was actually trained
    const med = median(weeklySets);
    if (med == null) continue;
    const [mev, mrv] = VOLUME_LANDMARKS[cat];
    const midpoint = (mev + mrv) / 2;
    const factor = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, med / midpoint));
    out[lift] = { sets: med, factor };
  }
  return out;
}

export function StrengthVolumeProfileCard({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["strength-volume-profile", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_strength_volume_profiles")
        .select("squat_factor, bench_factor, deadlift_factor, deadlift_style")
        .eq("athlete_id", athleteId).maybeSingle();
      if (error) throw error;
      return { ...volumeProfileFromRow(data), style: (data?.deadlift_style ?? null) as "conventional" | "sumo" | null };
    },
  });
  const [style, setStyle] = useState<"conventional" | "sumo" | null>(null);
  useEffect(() => { if (query.data) setStyle(query.data.style); }, [query.data]);
  const [draft, setDraft] = useState<StrengthVolumeProfile>(DEFAULT_STRENGTH_VOLUME);
  useEffect(() => { if (query.data) setDraft({ squat: query.data.squat, bench: query.data.bench, deadlift: query.data.deadlift }); }, [query.data]);

  const medianQuery = useQuery({
    queryKey: ["strength-volume-median", athleteId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - MEDIAN_WEEKS * 7);
      const { data, error } = await supabase.from("training_logs")
        .select("exercise, variation, date")
        .eq("athlete_id", athleteId)
        .gte("date", since.toISOString().slice(0, 10))
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const medians = useMemo(() => medianFactors(medianQuery.data ?? []), [medianQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("athlete_strength_volume_profiles").upsert({
        athlete_id: athleteId,
        squat_factor: draft.squat,
        bench_factor: draft.bench,
        deadlift_factor: draft.deadlift,
        deadlift_style: style,
        updated_at: new Date().toISOString(),
      }, { onConflict: "athlete_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["strength-volume-profile", athleteId] }); qc.invalidateQueries({ queryKey: ["deadlift-style", athleteId] }); toast.success("Volume profile saved"); },
    onError: (error: Error) => toast.error(error.message),
  });

  const changed = (Object.keys(draft) as Array<keyof StrengthVolumeProfile>)
    .some((key) => draft[key] !== (query.data ?? DEFAULT_STRENGTH_VOLUME)[key]) || style !== (query.data?.style ?? null);

  return <Card>
    <CardHeader>
      <CardTitle>Strength volume profile</CardTitle>
      <CardDescription>Set how much squat, bench and deadlift-pattern work this athlete usually tolerates. The center dot is the template baseline; each step changes the planned sets by 5%. The shaded marker shows the athlete's median weekly sets over the last 12 weeks. This is a coaching preference, not a bodyweight or sex-based estimate.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {query.isError && <p role="alert" className="text-sm text-destructive">Could not load the volume profile. Try again.</p>}
      {([ ["squat", "Squat"], ["bench", "Bench"], ["deadlift", "Deadlift / hinge"] ] as const).map(([key, title]) => {
        const med = medians[key];
        const pct = med ? ((med.factor - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100 : null;
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`strength-volume-${key}-${athleteId}`}>{title}</Label>
              <span className="font-mono text-sm tabular-nums">{draft[key] === 1 ? "Baseline" : `${draft[key] > 1 ? "+" : "−"}${Math.round(Math.abs(draft[key] - 1) * 100)}% sets`}</span>
            </div>
            <div className="relative">
              {pct != null && (
                <div
                  aria-hidden
                  data-testid={`median-marker-${key}`}
                  className="pointer-events-none absolute top-1/2 z-10 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/50"
                  style={{ left: `${pct}%` }}
                  title={`Median: ${med!.sets} sets/week`}
                />
              )}
              <Slider id={`strength-volume-${key}-${athleteId}`} aria-label={`${title} volume`} value={[draft[key]]} min={SLIDER_MIN} max={SLIDER_MAX} step={0.05} disabled={query.isLoading || query.isError || save.isPending} onValueChange={([value]) => { if (value != null) setDraft((prev) => ({ ...prev, [key]: value })); }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Less</span>
              <span>{med ? `Median last ${MEDIAN_WEEKS} wks: ${med.sets} sets/wk` : "•"}</span>
              <span>More</span>
            </div>
          </div>
        );
      })}
      <div className="space-y-2">
        <Label>Competition deadlift style</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Competition deadlift style">
          {([[null, "Not set"], ["conventional", "Conventional"], ["sumo", "Sumo"]] as const).map(([value, text]) => (
            <Button key={text} type="button" size="sm" role="radio" aria-checked={style === value} variant={style === value ? "default" : "outline"} disabled={query.isLoading || save.isPending} onClick={() => setStyle(value)}>{text}</Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Used by generated programs. Sumo: comp pull is sumo, conventional pulls can appear as accessories. Conventional: no sumo work is programmed.</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={!changed || save.isPending} onClick={() => { setDraft(query.data ? { squat: query.data.squat, bench: query.data.bench, deadlift: query.data.deadlift } : DEFAULT_STRENGTH_VOLUME); setStyle(query.data?.style ?? null); }}>Reset</Button>
        <Button type="button" disabled={!changed || query.isError || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save profile"}</Button>
      </div>
    </CardContent>
  </Card>;
}
