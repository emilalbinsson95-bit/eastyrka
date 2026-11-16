import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  HEAVY_SET_PCT,
  LIFTS,
  VOLUME_WARNING_RATIO,
  blockMetricWarnings,
  plannedWeekMetrics,
  referenceMetrics,
  type MetricSet,
  type PlanWeekInput,
} from "@/lib/liftMetrics";
import type { CompLift } from "@/lib/liftIdentity";

const LABEL: Record<CompLift, string> = { squat: "Böj", bench: "Bänk", deadlift: "Mark" };
const fmt = (n: number | null | undefined) => (n == null ? "—" : (Math.round(n * 10) / 10).toFixed(1).replace(".", ","));

/**
 * Steg 2 i "tre vägar": planerad mängd och tunga set per vecka mot atletens
 * referens, plus varningarna "Mängd" och "Inga tunga set". Ändrar inga set;
 * coachen kan alltid spara förbi.
 */
export function BlockMetricsPanel({
  athleteId,
  athleteName,
  weeks,
  logs,
  baselines,
  lightWeekStarts,
  today,
  checkHeavy,
  rampWeeks,
}: {
  athleteId: string;
  athleteName: string;
  weeks: PlanWeekInput[];
  logs: Array<MetricSet & { date: string }>;
  baselines: Array<{ exercise: string; one_rm_kg: number }>;
  lightWeekStarts: string[];
  today: string;
  checkHeavy: boolean;
  rampWeeks: number;
}) {
  const qc = useQueryClient();
  const key = ["heavy-set-warning", athleteId];
  const settingQuery = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_strength_volume_profiles")
        .select("heavy_set_warning")
        .eq("athlete_id", athleteId)
        .maybeSingle();
      if (error) throw error;
      return data?.heavy_set_warning ?? true;
    },
  });
  const heavyOn = settingQuery.data ?? true;
  const toggle = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("athlete_strength_volume_profiles")
        .upsert({ athlete_id: athleteId, heavy_set_warning: value, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
      if (error) throw error;
    },
    onSuccess: (_, value) => {
      qc.setQueryData(key, value);
      toast.success(value ? "Varningen är på igen" : `Varningen är avstängd för ${athleteName}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bl = useMemo(() => Object.fromEntries(baselines.map((b) => [b.exercise, Number(b.one_rm_kg)])), [baselines]);
  const reference = useMemo(() => referenceMetrics(logs, bl, lightWeekStarts, today), [logs, bl, lightWeekStarts, today]);
  const planned = useMemo(() => plannedWeekMetrics(weeks, bl), [weeks, bl]);
  const warnings = useMemo(
    () => blockMetricWarnings({ planned, reference, checkVolume: true, checkHeavy: checkHeavy && heavyOn, rampWeeks }),
    [planned, reference, checkHeavy, heavyOn, rampWeeks],
  );
  const shownLifts = LIFTS.filter((lift) => planned.some((w) => w.metrics[lift].hardSets + w.metrics[lift].lightSets > 0));
  if (!weeks.length || !shownLifts.length) return null;

  return (
    <div className="rounded-lg border bg-card" data-testid="block-metrics-panel">
      <div className="border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary">Mängd och tunga set</div>
      <div className="space-y-2 p-3 text-xs text-muted-foreground">
        <p>
          Mängd = vikt ÷ baslinje × reps. Tunga set = minst {HEAVY_SET_PCT} % av baslinjen. Referens = snittet av de{" "}
          {reference.weeks.length || 3} senaste genomförda arbetsveckorna.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <thead>
              <tr className="text-[11px]">
                <th className="py-1 pr-2 font-medium">Lyft</th>
                <th className="py-1 pr-2 font-medium">Referens</th>
                {planned.map((w) => (
                  <th key={w.weekIndex} className="py-1 pr-2 font-medium">
                    V{w.weekIndex}
                    {w.kind !== "working" ? <span className="ml-1 font-normal">({w.kind === "deload" ? "avl." : w.kind})</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shownLifts.map((lift) => (
                <tr key={lift} className="border-t border-border">
                  <td className="py-1 pr-2 font-medium text-foreground">{LABEL[lift]}</td>
                  <td className="py-1 pr-2">
                    {reference.volume[lift] == null ? (reference.weeks.length ? "Baslinje saknas" : "—") : (
                      <>
                        <span className="text-foreground">{fmt(reference.volume[lift])}</span> · {fmt(reference.heavySets[lift])} tunga
                      </>
                    )}
                  </td>
                  {planned.map((w) => {
                    const m = w.metrics[lift];
                    const ref = reference.volume[lift];
                    const over = ref != null && ref > 0 && m.volume != null && m.volume > ref * VOLUME_WARNING_RATIO;
                    return (
                      <td key={w.weekIndex} className="py-1 pr-2">
                        {m.baselineMissing ? "Baslinje saknas" : (
                          <>
                            <span className={over ? "font-medium text-destructive" : "text-foreground"}>{fmt(m.volume)}</span> · {m.heavySets ?? 0} tunga
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!reference.weeks.length && <p>Ingen referens: inga genomförda arbetsveckor de senaste tre månaderna, så mängden jämförs inte.</p>}
        {warnings.map((w) => (
          <p key={`${w.kind}-${w.lift}`} role="status" className="font-medium text-destructive">
            {w.message}
          </p>
        ))}
        {checkHeavy && (
          <div className="flex flex-wrap items-center gap-2">
            <span>{heavyOn ? "Varningen Inga tunga set är på för den här atleten." : `Varningen Inga tunga set är avstängd för ${athleteName}.`}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              disabled={settingQuery.isLoading || settingQuery.isError || toggle.isPending}
              onClick={() => toggle.mutate(!heavyOn)}
            >
              {heavyOn ? "Stäng av för atleten" : "Slå på igen"}
            </Button>
          </div>
        )}
        {warnings.length > 0 && <p>Varningarna ändrar inga set. Du kan skapa blocket ändå.</p>}
      </div>
    </div>
  );
}
