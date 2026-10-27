import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { summarizeEakDecisions, type DecisionRow } from "@/lib/eakDecisions";

const LABELS = { red: "Bromsa", yellow: "Bevaka", push: "Redo för mer" };
function percent(value: number | null) { return value == null ? "—" : `${value.toFixed(0)} %`; }
function outcome(value: { n: number; mean: number | null }) { return value.mean == null ? "— (n=0)" : `${value.mean > 0 ? "+" : ""}${value.mean.toFixed(1)} % (n=${value.n})`; }

export function EakDecisionPanel({ athletes }: { athletes: Array<{ athlete_id: string; full_name: string | null }> }) {
  const ids = athletes.map((a) => a.athlete_id).sort();
  const query = useQuery({
    queryKey: ["eak-decision-summary", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const now = new Date();
      const cutoff = new Date(now); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
      const rows: DecisionRow[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await supabase.from("eak_meso_evaluations").select("athlete_id,status,coach_decision,plan_changed,outcome_dl_next,created_at").in("athlete_id", ids).gte("created_at", cutoff.toISOString()).order("created_at", { ascending: false }).order("id").range(start, start + 999);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) break;
      }
      return summarizeEakDecisions(rows, now);
    },
  });
  if (!ids.length) return null;
  const summaries = new Map((query.data ?? []).map((s) => [s.athleteId, s]));
  return <section aria-labelledby="eak-decisions-title" className="space-y-3 border-t pt-5">
    <h2 id="eak-decisions-title" className="text-base font-semibold">Påverkade EAk dina beslut?</h2>
    <p className="text-xs text-muted-foreground">Senaste 12 månaderna. Beskrivande sammanställning, inte bevis för att en planändring orsakade utfallet. Godkända avser besvarade förslag; planändringar avser beslut med ja/nej-svar.</p>
    {query.isLoading && <p className="text-sm text-muted-foreground">Hämtar beslut…</p>}
    {query.isError && <p role="alert" className="text-sm text-destructive">Kunde inte hämta besluten.</p>}
    {!query.isLoading && !query.isError && athletes.map((a) => {
      const s = summaries.get(a.athlete_id);
      return <details key={a.athlete_id} className="border-b pb-3">
        <summary className="cursor-pointer text-sm"><span className="font-medium">{a.full_name ?? "Atlet"}</span><span className="ml-2 text-muted-foreground">{s?.count ?? 0} förslag · Godkända {percent(s?.approvedPct ?? null)} · Ändrade planen {percent(s?.changedPct ?? null)}</span></summary>
        <p className="mt-2 text-xs text-muted-foreground">{s?.decided ?? 0} besvarade förslag. Utfall: nästa utvärderings ΔL_M.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="py-2 pr-3">Signal</th><th className="pr-3">Ändrad plan</th><th>Oförändrad plan</th></tr></thead><tbody>{s?.outcomes.map((o) => <tr key={o.status} className="border-b"><td className="py-2 pr-3">{LABELS[o.status]}</td><td className="pr-3 font-mono">{outcome(o.changed)}</td><td className="font-mono">{outcome(o.unchanged)}</td></tr>)}</tbody></table>
        </div>
      </details>;
    })}
  </section>;
}