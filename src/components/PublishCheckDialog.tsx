import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAthleteBaselines } from "@/hooks/useAthleteBaselines";
import { cn } from "@/lib/utils";
import { planSessionDates } from "@/lib/planOverlaps";
import { prePublishChecks, type CheckArea, type CheckWeek } from "@/lib/publishCheck";

const EX_FIELDS =
  "exercise, variation, target_sets, target_reps, target_rpe, target_rir, target_pct, target_weight_kg, intensity_metric, is_technique, builder_lift";
const AREAS: CheckArea[] = ["Pass", "Vikter", "Volym", "Återhämtning", "Krockar"];

type WeekRow = {
  id: string;
  week_start_date: string;
  is_deload: boolean | null;
  training_phase: string | null;
  notes: string | null;
  planned_sessions: Array<{ day_of_week: number | null; title: string | null; planned_exercises: CheckWeek["sessions"][number]["exercises"] }>;
};
const toCheckWeek = (w: WeekRow): CheckWeek => ({
  week_start_date: w.week_start_date,
  is_deload: w.is_deload,
  training_phase: w.training_phase,
  notes: w.notes,
  sessions: (w.planned_sessions ?? []).map((s) => ({ day_of_week: s.day_of_week, title: s.title, exercises: s.planned_exercises ?? [] })),
});

/** Samlad kontroll av vikter, volym, återhämtning och krockar innan en vecka publiceras. */
export function PublishCheckDialog({
  open,
  onOpenChange,
  athleteId,
  mesocycleId,
  weekId,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteId: string;
  mesocycleId: string;
  weekId: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const baselinesQuery = useAthleteBaselines(athleteId);
  const dataQuery = useQuery({
    queryKey: ["publish-check", weekId],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const sel = `id, week_start_date, is_deload, training_phase, notes, planned_sessions(day_of_week, title, planned_exercises(${EX_FIELDS}))`;
      const { data: week, error } = await supabase.from("week_plans").select(sel).eq("id", weekId).single();
      if (error) throw error;
      const start = (week as unknown as WeekRow).week_start_date;
      const from = format(addDays(parseISO(start), -7), "yyyy-MM-dd");
      const to = format(addDays(parseISO(start), 7), "yyyy-MM-dd");
      const end = format(addDays(parseISO(start), 6), "yyyy-MM-dd");
      const [prevRes, othersRes, unavailRes] = await Promise.all([
        supabase
          .from("week_plans")
          .select(sel)
          .eq("mesocycle_id", mesocycleId)
          .lt("week_start_date", start)
          .order("week_start_date", { ascending: false })
          .limit(1),
        supabase
          .from("week_plans")
          .select("mesocycle_id, status, week_start_date, mesocycles!inner(name, status), planned_sessions(day_of_week, title, planned_exercises(id))")
          .eq("athlete_id", athleteId)
          .neq("mesocycle_id", mesocycleId)
          .neq("mesocycles.status", "archived")
          .gte("week_start_date", from)
          .lte("week_start_date", to),
        supabase
          .from("athlete_unavailability")
          .select("start_date, end_date, reason")
          .eq("athlete_id", athleteId)
          .lte("start_date", end)
          .gte("end_date", start),
      ]);
      if (prevRes.error) throw prevRes.error;
      if (othersRes.error) throw othersRes.error;
      if (unavailRes.error) throw unavailRes.error;
      const plans = planSessionDates(
        (othersRes.data ?? []).map((w) => ({
          mesocycle_id: w.mesocycle_id,
          mesocycle_name: (w.mesocycles as unknown as { name: string }).name,
          status: w.status,
          week_start_date: w.week_start_date,
          sessions: (w.planned_sessions ?? []).map((s) => ({ day_of_week: s.day_of_week, title: s.title, exerciseCount: (s.planned_exercises ?? []).length })),
        })),
      );
      return {
        week: week as unknown as WeekRow,
        prev: ((prevRes.data ?? [])[0] as unknown as WeekRow | undefined) ?? null,
        otherPlanDates: [...plans.values()].flatMap((p) => p.dates.map((d) => ({ ...d, name: p.name }))),
        unavailability: (unavailRes.data ?? []).map((u) => ({ startDate: String(u.start_date).slice(0, 10), endDate: String(u.end_date).slice(0, 10), reason: String(u.reason) })),
      };
    },
  });

  const findings = useMemo(() => {
    if (!dataQuery.data || !baselinesQuery.data) return null;
    const d = dataQuery.data;
    return prePublishChecks({
      week: toCheckWeek(d.week),
      previousWeek: d.prev ? toCheckWeek(d.prev) : null,
      baselines: baselinesQuery.data,
      otherPlanDates: d.otherPlanDates,
      unavailability: d.unavailability,
      today: format(new Date(), "yyyy-MM-dd"),
    });
  }, [dataQuery.data, baselinesQuery.data]);

  const warnCount = findings?.filter((f) => f.level === "warn").length ?? 0;
  const loading = dataQuery.isLoading || baselinesQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kontroll före publicering</DialogTitle>
          <DialogDescription>
            Vikter, volym, återhämtning och krockar med andra planer. Inget ändras; du bestämmer om veckan ska publiceras.
          </DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Kontrollerar…</p>}
        {dataQuery.isError && <p className="text-sm text-destructive">Kontrollen kunde inte köras: {(dataQuery.error as Error).message}</p>}
        {findings && findings.length === 0 && (
          <p className="flex items-center gap-2 text-sm" data-testid="publish-check-ok">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Inga anmärkningar. Veckan är redo att publiceras.
          </p>
        )}
        {findings && findings.length > 0 && (
          <div className="space-y-3" data-testid="publish-check-findings">
            {AREAS.map((area) => {
              const list = findings.filter((f) => f.area === area);
              if (!list.length) return null;
              return (
                <div key={area}>
                  <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{area}</p>
                  <ul className="space-y-1.5">
                    {list.map((f, i) => (
                      <li key={i} className={cn("flex gap-2 text-sm", f.level === "warn" ? "text-foreground" : "text-muted-foreground")}>
                        {f.level === "warn" ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Varning" />
                        ) : (
                          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-label="Info" />
                        )}
                        <span>{f.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tillbaka och ändra
          </Button>
          <Button onClick={onConfirm} disabled={(loading && !dataQuery.isError) || pending}>
            {warnCount > 0 ? "Publicera ändå" : "Publicera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
