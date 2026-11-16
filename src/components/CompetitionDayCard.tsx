import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { Check, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CompLift } from "@/lib/liftIdentity";
import type { PeakAttempt, PeakAttempts } from "@/lib/taperFollowup";
import { MEET_DAY_TIPS, MEET_LIFTS, MEET_LIFT_LABEL, attemptOrderWarning, meetResult, parseAttempts, resolveAttemptPlan, warmupLadder } from "@/lib/competitionDay";

const kgText = (kg: number | null) => kg == null ? "—" : `${String(kg).replace(".", ",")} kg`;
const emptyList = (): PeakAttempt[] => [0, 1, 2].map(() => ({ kg: null, success: null }));

export function useCompetitionDay(mesocycleId: string | null | undefined) {
  return useQuery({
    queryKey: ["competition-day", mesocycleId],
    enabled: !!mesocycleId,
    queryFn: async () => {
      const { data, error } = await supabase.from("taper_followups")
        .select("mesocycle_id, athlete_id, competition_date, openers, planned_attempts, attempts")
        .eq("mesocycle_id", mesocycleId!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: comp } = await supabase.from("competitions").select("name").eq("athlete_id", data.athlete_id).eq("comp_date", data.competition_date).maybeSingle();
      return { ...data, name: comp?.name ?? null };
    },
  });
}

/** Competition day: warmups, three coach suggestions and filled-in attempts per lift. */
export function CompetitionDayCard({ mesocycleId, embedded = false }: { mesocycleId: string; embedded?: boolean }) {
  const qc = useQueryClient();
  const query = useCompetitionDay(mesocycleId);
  const row = query.data;
  const [attempts, setAttempts] = useState<PeakAttempts>({});
  useEffect(() => { if (row) setAttempts(parseAttempts(row.attempts)); }, [row]);
  const plan = useMemo(() => resolveAttemptPlan(row?.planned_attempts, row?.openers), [row]);
  const today = format(new Date(), "yyyy-MM-dd");
  const canFill = !!row && today >= row.competition_date;
  const result = meetResult(attempts);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("save_competition_attempts", { _mesocycle_id: mesocycleId, _attempts: attempts as unknown as Json });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competition-day"] });
      qc.invalidateQueries({ queryKey: ["peaking-followup"] });
      toast.success("Tävlingsförsöken är sparade.");
    },
    onError: (e: Error) => toast.error(e.message || "Kunde inte spara försöken."),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Laddar tävlingsdagen…</p>;
  if (!row) return null;

  const update = (lift: CompLift, index: number, patch: Partial<PeakAttempt>) => setAttempts((current) => {
    const list = [...(current[lift] ?? emptyList())];
    while (list.length < 3) list.push({ kg: null, success: null });
    const next = { ...list[index], ...patch };
    if (patch.success != null && next.kg == null) next.kg = plan[lift][index];
    list[index] = next;
    return { ...current, [lift]: list };
  });

  const body = (
    <div className="space-y-5">
      <details className="rounded-md border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Inför tävlingen</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{MEET_DAY_TIPS.map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </details>
      {MEET_LIFTS.map((lift) => {
        const planned = plan[lift];
        const warmups = warmupLadder(lift, planned[0]);
        const list = attempts[lift] ?? emptyList();
        const warning = attemptOrderWarning([0, 1, 2].map((i) => list[i]?.kg ?? null));
        return (
          <section key={lift} className="space-y-3 border-t border-border pt-4" aria-label={MEET_LIFT_LABEL[lift]}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{MEET_LIFT_LABEL[lift]}</h3>
              <p className="font-mono text-xs text-muted-foreground">Bästa: {kgText(result.best[lift])}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {planned.map((kg, i) => (
                <div key={i} className="rounded-md bg-secondary px-2 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Förslag {i + 1}</p>
                  <p className="font-mono font-semibold">{kgText(kg)}</p>
                </div>
              ))}
            </div>
            {warmups.length > 0 ? (
              <div className="text-sm">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Uppvärmning till öppningen</p>
                <p className="font-mono">{warmups.map((w) => `${String(w.kg).replace(".", ",")}×${w.reps}`).join(" · ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">Sista uppvärmningen 5–8 minuter före första försöket. Kortare vila mellan de lätta seten.</p>
              </div>
            ) : <p className="text-xs text-muted-foreground">Coachen har inte satt någon öppningsvikt för det här lyftet ännu.</p>}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dina försök <span className="normal-case tracking-normal sm:hidden">· ✓ godkänt, ✕ underkänt</span></p>
              {[0, 1, 2].map((i) => {
                const attempt = list[i] ?? { kg: null, success: null };
                return (
                  <div key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-2">
                    <span className="font-mono text-sm">{i + 1}</span>
                    <Input type="number" inputMode="decimal" min={0} step={2.5} disabled={!canFill}
                      aria-label={`${MEET_LIFT_LABEL[lift]} försök ${i + 1} kg`}
                      placeholder={planned[i] != null ? String(planned[i]) : "kg"}
                      value={attempt.kg ?? ""}
                      onChange={(e) => update(lift, i, { kg: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full sm:w-28" />
                    <Button type="button" size="sm" variant={attempt.success === true ? "default" : "outline"} disabled={!canFill}
                      aria-pressed={attempt.success === true}
                      onClick={() => update(lift, i, { success: attempt.success === true ? null : true })}>
                      <Check className="h-3.5 w-3.5 sm:mr-1" /><span className="sr-only sm:not-sr-only">Godkänt</span>
                    </Button>
                    <Button type="button" size="sm" variant={attempt.success === false ? "destructive" : "outline"} disabled={!canFill}
                      aria-pressed={attempt.success === false}
                      onClick={() => update(lift, i, { success: attempt.success === false ? null : false })}>
                      <X className="h-3.5 w-3.5 sm:mr-1" /><span className="sr-only sm:not-sr-only">Underkänt</span>
                    </Button>
                  </div>
                );
              })}
              {warning && <p className="text-xs text-destructive">{warning}</p>}
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="font-mono text-sm">Total: <span className="font-semibold">{kgText(result.total)}</span></p>
        {canFill
          ? <Button onClick={() => save.mutate()} disabled={save.isPending}>Spara försök</Button>
          : <p className="text-xs text-muted-foreground">Försöken fylls i på tävlingsdagen.</p>}
      </div>
    </div>
  );

  if (embedded) return body;
  return (
    <Card className={cn("border-primary/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" />{row.name || "Tävlingsdag"}</CardTitle>
        <CardDescription>{format(parseISO(row.competition_date), "EEEE d MMMM yyyy", { locale: sv })} · uppvärmning, viktförslag och dina försök</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

/** Shows on the day plan from competition day until a week after, while results are missing. */
export function CompetitionDayToday({ athleteId, dateStr }: { athleteId: string; dateStr: string }) {
  const query = useQuery({
    queryKey: ["competition-day-today", athleteId, dateStr],
    queryFn: async () => {
      const from = format(addDays(parseISO(dateStr), -7), "yyyy-MM-dd");
      const { data, error } = await supabase.from("taper_followups")
        .select("mesocycle_id, competition_date, attempts, mesocycles!inner(status)")
        .eq("athlete_id", athleteId).gte("competition_date", from).lte("competition_date", dateStr)
        .neq("mesocycles.status", "archived").order("competition_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).find((row) => {
        if (row.competition_date === dateStr) return true;
        const parsed = parseAttempts(row.attempts);
        return MEET_LIFTS.some((lift) => !(parsed[lift] ?? []).some((a) => a.success != null));
      }) ?? null;
    },
  });
  if (!query.data) return null;
  return <CompetitionDayCard mesocycleId={query.data.mesocycle_id} />;
}
