import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { repRecordKey, repRecords, type MaxRepsLog } from "@/lib/percentRows";

/** Max-rep sets: the last set of a percent row marked "Max reps". */
export function useMaxRepsLogs(athleteId: string) {
  return useQuery({
    queryKey: ["max-reps-logs", athleteId],
    queryFn: async (): Promise<MaxRepsLog[]> => {
      const { data, error } = await supabase.from("training_logs")
        .select("date, exercise, variation, reps, set_number, is_warmup_reference, planned_exercises!inner(target_pct, target_sets, last_set_max_reps)")
        .eq("athlete_id", athleteId).eq("planned_exercises.last_set_max_reps", true).eq("is_warmup_reference", false)
        .order("date").limit(2000);
      if (error) throw error;
      return (data ?? []).flatMap((row) => {
        const pe = row.planned_exercises as unknown as { target_pct: number | null; target_sets: number } | null;
        if (!pe || pe.target_pct == null || row.set_number !== pe.target_sets) return [];
        return [{ exercise: row.exercise, variation: row.variation, pct: Number(pe.target_pct), reps: row.reps, date: row.date }];
      });
    },
  });
}

/** Best earlier result on the same exercise, variant and percent (excluding `beforeDate`). */
export function previousRepRecord(logs: MaxRepsLog[] | undefined, exercise: string, variation: string | null | undefined, pct: number, beforeDate: string) {
  if (!logs) return null;
  return repRecords(logs.filter((l) => l.date < beforeDate)).get(repRecordKey(exercise, variation, pct)) ?? null;
}

const pctText = (pct: number) => `${String(pct).replace(".", ",")} %`;

export function RepRecordsCard({ athleteId }: { athleteId: string }) {
  const { t } = useTranslation();
  const query = useMaxRepsLogs(athleteId);
  const records = [...repRecords(query.data ?? []).values()].sort((a, b) => b.date.localeCompare(a.date));
  if (!records.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" />{t("repRecords.title")}</CardTitle>
        <CardDescription>{t("repRecords.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {records.map((r) => (
            <li key={`${r.exercise}-${r.variation}-${r.pct}`} className="flex items-center justify-between gap-3 py-2">
              <span>{r.exercise}{r.variation ? ` · ${r.variation}` : ""} <span className="text-muted-foreground">{t("repRecords.at", { pct: pctText(r.pct) })}</span></span>
              <span className="font-mono">{t("repRecords.reps", { count: r.reps })} <span className="text-xs text-muted-foreground">{r.date}</span></span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Coach view: sets logged above the row's RPE ceiling (step 4). */
export function RpeCapEventsCard({ athleteId }: { athleteId: string }) {
  const query = useQuery({
    queryKey: ["rpe-cap-events", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("training_logs")
        .select("id, date, exercise, variation, set_number, reps, weight_kg, rpe, planned_exercises!inner(rpe_cap, target_pct)")
        .eq("athlete_id", athleteId).not("planned_exercises.rpe_cap", "is", null).eq("is_warmup_reference", false)
        .order("date", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []).flatMap((row) => {
        const pe = row.planned_exercises as unknown as { rpe_cap: number | null; target_pct: number | null } | null;
        if (!pe?.rpe_cap || row.rpe == null || Number(row.rpe) <= Number(pe.rpe_cap)) return [];
        return [{ ...row, cap: Number(pe.rpe_cap), pct: pe.target_pct }];
      }).slice(0, 20);
    },
  });
  if (!query.data?.length) return null;
  const n = (v: number) => String(v).replace(".", ",");
  return (
    <Card>
      <CardHeader>
        <CardTitle>RPE-tak passerat</CardTitle>
        <CardDescription>Set på procentrader där loggad RPE låg över radens tak. Atleten fick förslaget att sänka 5 % på resterande set.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {query.data.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{e.date} · {e.exercise}{e.variation ? ` · ${e.variation}` : ""} · set {e.set_number}</span>
              <span className="font-mono">{e.reps} × {n(Number(e.weight_kg))} kg @ RPE {n(Number(e.rpe))} (tak {n(e.cap)}{e.pct != null ? `, ${n(Number(e.pct))} %` : ""})</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
