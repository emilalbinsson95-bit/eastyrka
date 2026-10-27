import { chartStrengthSeries } from "@/lib/chartMetrics";
import type { ChartLog } from "@/lib/chartMetrics";
import { lookupBaseline, isReadinessLift, baselineExerciseKey } from "@/lib/eakoefficient";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Area, ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type BaselineHistory = { exercise: string; one_rm_kg: number; recorded_at: string; note: string | null };
export function StrengthHistoryCharts({ logs, baselines, history, since }: { logs: ChartLog[]; baselines: Record<string,number>; history: BaselineHistory[]; since: string }) {
  const measurements = chartStrengthSeries(logs,baselines).filter(p=>isReadinessLift(p.exercise,p.variation));
  const keys = [...new Set(measurements.map(p=>p.key))];
  return <div className="space-y-4">{keys.map(key=>{
    const points=measurements.filter(p=>p.key===key);const first=points[0];if(!first)return null;
    const changes=history.filter(h=>baselineExerciseKey(h.exercise)===baselineExerciseKey(first.exercise)).sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at));
    const today=new Date().toISOString().slice(0,10);
    const dates=[...new Set([since,today,...points.map(p=>p.date),...changes.map(h=>h.recorded_at.slice(0,10))])].sort().filter(d=>d>=since && d<=today);
    const data=dates.map(date=>{
      const measurement=points.find(p=>p.date===date);const prior=points.filter(p=>p.date<=date).at(-1);
      const baselineChange=changes.find(h=>h.recorded_at.slice(0,10)===date);
      const effective=changes.filter(h=>h.recorded_at.slice(0,10)<=date).at(-1);
      // Never back-project a future baseline into an unknown earlier period.
      const baseline=changes.length ? effective?.one_rm_kg ?? null : lookupBaseline(baselines,first.exercise)??null;
      return {date,e1rm:measurement?.e1rm??null,rolling:prior?.rolling??null,baseline,band:baseline?[baseline*.97,baseline*1.03]:null,low:baseline?baseline*.92:null,decision:baselineChange?baseline:null,note:baselineChange?.note??null,eak:baseline&&prior?prior.rolling/baseline*100:null};
    });
    return <Card key={key}><CardHeader><CardTitle className="text-base">{first.exercise}{first.variation?` · ${first.variation}`:""}</CardTitle><CardDescription>Mätset och snitt av tre pass. Band 97–103 %, nedre gräns 92 %. Baslinjen ändras på beslutsdatumet.</CardDescription></CardHeader><CardContent><div className="h-72" role="img" aria-label={`E1RM och baslinje för ${first.exercise}`}><ResponsiveContainer><ComposedChart data={data}><CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/><XAxis dataKey="date" fontSize={10}/><YAxis domain={["auto","auto"]} fontSize={10} unit=" kg"/><Tooltip content={({active,payload})=>{const point=payload?.[0]?.payload as typeof data[number]|undefined;return active&&point?<div className="rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground"><p>{point.date}</p><p>Mätset: {point.e1rm?.toFixed(1)??"—"} kg</p><p>Snitt: {point.rolling?.toFixed(1)??"—"} kg</p><p>Baslinje: {point.baseline??"saknas"} kg</p><p>EAk: {point.eak?.toFixed(1)??"—"} %</p>{point.decision!=null&&<p>Coachbeslut: {point.note??"Ny baslinje"}</p>}</div>:null;}}/><Legend wrapperStyle={{fontSize:11}}/><Area type="stepAfter" dataKey="band" name="97–103 %" fill="var(--chart-2)" fillOpacity={.12} stroke="none"/><Line dataKey="low" type="stepAfter" name="92 %" stroke="var(--muted-foreground)" strokeDasharray="3 3" dot={false}/><Line dataKey="baseline" type="stepAfter" name="Baslinje" stroke="var(--foreground)" dot={false} connectNulls={false}/><Line dataKey="rolling" type="linear" name="Snitt 3 mätpass" stroke="var(--chart-1)" strokeWidth={2} dot={false}/><Scatter dataKey="e1rm" name="Mätset" fill="var(--muted-foreground)"/><Scatter dataKey="decision" name="Coachbeslut" fill="var(--foreground)" shape="diamond"/></ComposedChart></ResponsiveContainer></div></CardContent></Card>;
  })}</div>;
}