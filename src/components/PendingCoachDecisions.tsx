import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lookupBaseline } from "@/lib/eakoefficient";
import { seasonBlocksSchema } from "@/lib/seasonPlanning";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PendingCoachDecisions({ athletes }: { athletes: Array<{ athlete_id: string; full_name: string | null }> }) {
  const [open, setOpen] = useState(false);
  const ids = athletes.map(a => a.athlete_id);
  const query = useQuery({ queryKey: ["pending-coach-decisions", ids], enabled: ids.length > 0, queryFn: async () => {
    const [evaluations, logs, decisions, baselines, peaks, seasons] = await Promise.all([
      supabase.from("eak_meso_evaluations").select("id, athlete_id, lift").in("athlete_id",ids).eq("coach_decision","pending"),
      supabase.from("training_logs").select("id, athlete_id, exercise, weight_kg, variation, rpe").in("athlete_id",ids).eq("reps",1).eq("is_warmup_reference",false).eq("is_technique",false),
      supabase.from("baseline_max_decisions").select("training_log_id").in("athlete_id",ids),
      supabase.from("baselines").select("athlete_id, exercise, one_rm_kg").in("athlete_id",ids),
      supabase.from("taper_followups").select("mesocycle_id, athlete_id, flags").in("athlete_id",ids),
      supabase.from("athlete_season_plans").select("id, athlete_id, blocks").in("athlete_id",ids),
    ]);
    for (const result of [evaluations, logs, decisions, baselines, peaks, seasons]) if(result.error) throw result.error;
    const items: Array<{id: string; athleteId: string; kind: "eak"|"max"|"peak"|"season"; label: string}> = (evaluations.data ?? []).map(e => ({id:e.id, athleteId:e.athlete_id,kind:"eak",label:`EAk · ${e.lift}`}));
    const seen = new Set((decisions.data ?? []).map(d => d.training_log_id));
    for (const log of logs.data ?? []) {
      const map = Object.fromEntries((baselines.data ?? []).filter(b => b.athlete_id === log.athlete_id).map(b => [b.exercise,Number(b.one_rm_kg)]));
      if(!seen.has(log.id) && !log.variation && Number(log.weight_kg) > (lookupBaseline(map,log.exercise) ?? Infinity)) items.push({id:log.id, athleteId:log.athlete_id,kind:"max",label:`Maxförslag · ${log.exercise} ${log.weight_kg} kg @ ${log.rpe}`});
    }
    for (const peak of peaks.data ?? []) {
      if(!Array.isArray(peak.flags)) continue;
      peak.flags.forEach((flag,index) => { if(flag && typeof flag === "object" && !Array.isArray(flag) && flag.decision === "pending") items.push({id:`${peak.mesocycle_id}-${index}`,athleteId:peak.athlete_id,kind:"peak",label:`Toppning · ${String(flag.message ?? "Flagga")}`}); });
    }
    const today = new Date().toISOString().slice(0,10);
    for(const season of seasons.data ?? []) {
      const parsed = seasonBlocksSchema.safeParse(season.blocks);
      if (!parsed.success) continue;
      for (const block of parsed.data) if((!block.mesocycleId && block.startDate < today) || block.inactive) items.push({id:`${season.id}-${block.id}`,athleteId:season.athlete_id,kind:"season",label:`Inaktuellt block · ${block.name}`});
    }
    return items;
  }});
  const items = query.data ?? [];
  return <section className="space-y-2 border-y border-border py-4">
    <Button variant="outline" onClick={() => setOpen(true)}>Väntande beslut <Badge variant="secondary" className="ml-2">{items.length}</Badge></Button>
    {query.isError && <p role="alert" className="text-sm text-destructive">Kunde inte hämta alla väntande beslut.</p>}
    <div className="flex flex-wrap gap-3">{athletes.map(a => { const count = items.filter(i => i.athleteId === a.athlete_id).length; return count ? <Button key={a.athlete_id} size="sm" variant="ghost" onClick={() => setOpen(true)}>{a.full_name} · {count}</Button> : null; })}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>Väntande coachbeslut</DialogTitle></DialogHeader>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Inga väntande beslut.</p> : items.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-2 text-sm"><div><p className="font-medium">{athletes.find(a => a.athlete_id === item.athleteId)?.full_name}</p><p>{item.label}</p></div><Button asChild variant="outline" size="sm">{item.kind === "eak" ? <Link to="/coach/athletes/$athleteId/analytics" params={{athleteId:item.athleteId}}>Granska</Link> : item.kind === "peak" ? <Link to="/coach/athletes/$athleteId/peaking" params={{athleteId:item.athleteId}}>Granska</Link> : item.kind === "season" ? <Link to="/coach/athletes/$athleteId/cycles" params={{athleteId:item.athleteId}}>Granska</Link> : <Link to="/coach/athletes/$athleteId" params={{athleteId:item.athleteId}}>Granska</Link>}</Button></div>)}
    </DialogContent></Dialog>
  </section>;
}