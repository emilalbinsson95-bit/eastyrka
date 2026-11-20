import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addDays, format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAthleteBaselines } from "@/hooks/useAthleteBaselines";
import { cn } from "@/lib/utils";
import { LIFTS } from "@/lib/liftMetrics";
import type { CompLift } from "@/lib/liftIdentity";
import { ADHERENCE_OK_PCT, reviewBlocks, stallFindings, type LiftReview, type ReviewLog, type ReviewWeek } from "@/lib/blockReview";

const LABEL: Record<CompLift, string> = { squat: "Knäböj", bench: "Bänkpress", deadlift: "Marklyft" };
const VERDICT: Record<LiftReview["verdict"], string> = { stronger: "Starkare", flat: "Oförändrat", weaker: "Svagare", unknown: "För få mätningar" };
const n0 = (n: number) => Math.round(n).toString();
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n * 10) / 10).toFixed(1).replace(".", ",")}`;
const day = (iso: string) => format(parseISO(iso), "d MMM", { locale: sv });

/**
 * Uppföljning mellan block (starkare? följdes planen?) och coachförslag när ett
 * tävlingslyft stått still två block i rad. Bara visning; inget ändras.
 */
export function BlockReviewCard({ athleteId, compact = false }: { athleteId: string; compact?: boolean }) {
  const baselinesQuery = useAthleteBaselines(athleteId);
  const dataQuery = useQuery({
    queryKey: ["block-review", athleteId],
    queryFn: async () => {
      const since = format(addDays(new Date(), -400), "yyyy-MM-dd");
      const [mesoRes, weeksRes, logsRes, pushRes] = await Promise.all([
        supabase.from("mesocycles").select("id, name, start_date, total_weeks").eq("athlete_id", athleteId).gte("start_date", since),
        supabase
          .from("week_plans")
          .select("week_start_date, is_deload, training_phase, mesocycle_id, planned_sessions(day_of_week, title, planned_exercises(id, exercise, variation, target_sets, target_reps, target_weight_kg, target_rpe, target_pct, is_technique, builder_lift))")
          .eq("athlete_id", athleteId)
          .eq("status", "published")
          .gte("week_start_date", since),
        supabase
          .from("training_logs")
          .select("date, exercise, variation, set_number, reps, weight_kg, rpe, is_warmup_reference, is_technique, planned_exercise_id, created_at")
          .eq("athlete_id", athleteId)
          .gte("date", since)
          .order("date")
          .limit(10000),
        supabase.from("push_state").select("lift, enabled").eq("athlete_id", athleteId),
      ]);
      for (const r of [mesoRes, weeksRes, logsRes, pushRes]) if (r.error) throw r.error;
      const logs: ReviewLog[] = (logsRes.data ?? []).map((l) => ({
        ...l,
        exercise: (l.exercise ?? "").trim(),
        weight_kg: Number(l.weight_kg),
        rpe: Number(l.rpe),
        reps: Number(l.reps),
      })) as ReviewLog[];
      const push: Partial<Record<CompLift, boolean>> = { squat: false, bench: false, deadlift: false };
      for (const p of pushRes.data ?? []) {
        const lift: CompLift | null = p.lift === "squat" ? "squat" : p.lift === "bench" ? "bench" : p.lift === "sumo" || p.lift === "conventional" ? "deadlift" : null;
        if (lift && p.enabled) push[lift] = true;
      }
      return { mesocycles: mesoRes.data ?? [], weeks: (weeksRes.data ?? []) as unknown as ReviewWeek[], logs, push };
    },
  });

  const reviews = useMemo(() => {
    if (!dataQuery.data || !baselinesQuery.data) return [];
    return reviewBlocks({ ...dataQuery.data, baselines: baselinesQuery.data, today: format(new Date(), "yyyy-MM-dd") });
  }, [dataQuery.data, baselinesQuery.data]);
  const stalls = useMemo(() => stallFindings(reviews, { pushEnabled: dataQuery.data?.push }), [reviews, dataQuery.data?.push]);
  const shown = reviews.slice(0, compact ? 2 : 6);
  // Följsamheten gäller hela blocket: visa den en gång i stället för per lyft.
  const adherenceNote = stalls.flatMap((s) => s.suggestions).find((t) => t.startsWith("Följsamheten")) ?? null;

  if (dataQuery.isLoading || baselinesQuery.isLoading) return null;
  if (compact && !reviews.length) return null;

  return (
    <Card data-testid="block-review-card">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Uppföljning mellan block</CardTitle>
            <CardDescription>
              Blev atleten starkare och följdes planen? e1RM i tävlingslyften i början mot slutet av blocket (median av upp till tre mätpass). Starkare = minst +2 %. Toppningar visas men räknas inte när stillastående bedöms.
            </CardDescription>
          </div>
          {compact && (
            <Button asChild size="sm" variant="outline">
              <Link to="/coach/athletes/$athleteId/analytics" params={{ athleteId }}>Alla block</Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dataQuery.isError && <p className="text-sm text-destructive">Kunde inte läsa blocken: {(dataQuery.error as Error).message}</p>}
        {stalls.length > 0 && (
          <div className="space-y-3 rounded-md border border-destructive/40 p-3" data-testid="stall-findings">
            <p className="text-sm font-semibold">Står still två block i rad</p>
            {adherenceNote && <p className="text-sm">{adherenceNote}</p>}
            {stalls.map((s) => (
              <div key={s.lift} className="space-y-1">
                <p className="text-sm font-medium">
                  {LABEL[s.lift]}:{" "}
                  <span className="font-normal text-muted-foreground">
                    {s.blocks.map((b) => `${b.name} (${day(b.start)}) ${signed(b.changePct)} %`).join(", ")}
                  </span>
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {s.suggestions.filter((t) => t !== adherenceNote).map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Förslag. Inget i programmet ändras förrän du gör det.</p>
          </div>
        )}
        {!shown.length ? (
          <p className="text-sm text-muted-foreground">Inga publicerade block det senaste året.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 text-left font-medium">Block</th>
                  <th className="py-1 pr-3 text-left font-medium">Följsamhet</th>
                  {LIFTS.map((l) => (
                    <th key={l} className="py-1 pr-3 text-left font-medium">{LABEL[l]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => (
                  <tr key={b.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3">
                      <Link to="/coach/athletes/$athleteId/cycles/$cycleId" params={{ athleteId, cycleId: b.id }} className="font-medium hover:underline">
                        {b.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {day(b.start)}–{day(b.end)} · {b.isPeak ? "toppning" : `${b.workingWeeks} arbetsv.`}{!b.finished && " · pågår"}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={cn(b.adherencePct != null && b.adherencePct < ADHERENCE_OK_PCT && "font-medium text-destructive")}>
                        {b.adherencePct == null ? "—" : `${b.adherencePct} %`}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {b.sessionsLogged}/{b.sessionsPlanned} pass · {b.setsLogged}/{b.setsPlanned} set
                        {b.rpeDiff != null && ` · RPE ${signed(b.rpeDiff)}`}
                      </div>
                    </td>
                    {LIFTS.map((l) => {
                      const r = b.lifts[l];
                      return (
                        <td key={l} className="py-2 pr-3">
                          {r.e1Start == null || r.e1End == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="font-mono">
                              {n0(r.e1Start)} → {n0(r.e1End)}
                            </span>
                          )}
                          <div>
                            <Badge
                              variant={r.verdict === "stronger" ? "default" : r.verdict === "weaker" ? "destructive" : "outline"}
                              className="mt-0.5 px-1.5 py-0 text-[10px]"
                            >
                              {VERDICT[r.verdict]}
                              {r.changePct != null && ` ${signed(r.changePct)} %`}
                            </Badge>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Följsamhet = loggade pass av planerade hittills (flyttat en dag räknas). Set = huvudlyft och varianter. RPE = loggad minus mål.
        </p>
      </CardContent>
    </Card>
  );
}
