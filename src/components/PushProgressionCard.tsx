import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, Undo2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { savePushSettings, undoPushDecision, finishPushExposure } from "@/lib/pushProgression.functions";
import { PUSH_LIFTS, PUSH_LABELS, PUSH_STEPS, type PushLift } from "@/lib/pushProgression";
import { lookupBaseline } from "@/lib/eakoefficient";
import type { Database } from "@/integrations/supabase/types";

type State = Database["public"]["Tables"]["push_state"]["Row"];
const reasons:Record<string,string>={all_main_sets_completed:"Alla huvudset klarade",second_miss:"Andra missen – planetta sänkt 5 %",missed_reps:"Färre reps än ordinerat",incomplete_or_changed_load:"Obekräftade set eller ändrad vikt",block_cap:"Blockets 6 %-tak",eak_below_92:"EAk under 92",eak_bad:"Paus – EAk-granskning",peaking:"Paus – toppning",plan_changed:"Planettan har ändrats",cooldown:"Fem dagar mellan beslut",light_phase:"Avlastning eller återgång",disabled_or_not_main:"Push av eller inget huvudpass"};
export function PushProgressionCard({athleteId}:{athleteId:string}) {
 const qc=useQueryClient();const undo=useServerFn(undoPushDecision);
 const query=useQuery({queryKey:["push-state",athleteId],queryFn:async()=>{
  const [states,logs,baselines]=await Promise.all([supabase.from("push_state").select("*").eq("athlete_id",athleteId),supabase.from("push_log").select("*").eq("athlete_id",athleteId).order("created_at",{ascending:false}).limit(20),supabase.from("baselines").select("exercise,one_rm_kg").eq("athlete_id",athleteId)]);
  if(states.error||logs.error||baselines.error)throw new Error("Kunde inte läsa viktprogressionen");
  return {states:states.data??[],logs:logs.data??[],baselines:Object.fromEntries((baselines.data??[]).map(b=>[b.exercise,Number(b.one_rm_kg)]))};
 }});
 const reverse=useMutation({mutationFn:(id:string)=>undo({data:{id}}),onSuccess:()=>{qc.invalidateQueries();toast.success("Planettan och kommande vikter återställda");},onError:(e:Error)=>toast.error(e.message)});
 return <section className="space-y-4 border-b border-border pb-6" aria-label="Viktprogression">
  <h2 className="flex items-center gap-2 text-lg font-semibold"><TrendingUp className="h-5 w-5"/>Viktprogression</h2>
  {query.isLoading&&<p className="text-sm text-muted-foreground">Laddar…</p>}
  {query.isError&&<p role="alert" className="text-sm text-destructive">Kunde inte läsa viktprogressionen.</p>}
  {query.data&&PUSH_LIFTS.map(lift=>{const row=query.data.states.find(s=>s.lift===lift);const name=lift==="squat"?"Back squat":lift==="bench"?"Bench press":lift==="sumo"?"Sumo deadlift":"Conventional deadlift";return <PushSettings key={`${lift}-${row?.version??"new"}`} athleteId={athleteId} lift={lift} row={row} baseline={lookupBaseline(query.data.baselines,name)??0}/>;})}
  {query.data&&query.data.logs.length>0&&<div className="divide-y divide-border">{query.data.logs.map(log=><div key={log.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{PUSH_LABELS[log.lift as PushLift]??log.lift} · {log.decision} · {Number(log.plan_e1rm_before).toFixed(2)} → {Number(log.plan_e1rm_after).toFixed(2)} kg</p><p className="text-muted-foreground">{reasons[log.reason]??log.reason} · {log.created_at.slice(0,10)}{log.undone_at?" · Ångrat":""}</p></div>{!log.undone_at&&<Button size="icon" variant="outline" title="Ångra beslut" aria-label="Ångra beslut" disabled={reverse.isPending} onClick={()=>reverse.mutate(log.id)}><Undo2 className="h-4 w-4"/></Button>}</div>)}</div>}
 </section>;
}
function PushSettings({athleteId,lift,row,baseline}:{athleteId:string;lift:PushLift;row?:State;baseline:number}) {
 const qc=useQueryClient();const save=useServerFn(savePushSettings);
 const [enabled,setEnabled]=useState(row?.enabled??false);const [plan,setPlan]=useState(String(row?.plan_e1rm??(baseline||"")));const [step,setStep]=useState(String(row?.step_pct??PUSH_STEPS[lift]));const [sets,setSets]=useState(String(row?.main_sets??4));const [reps,setReps]=useState(String(row?.main_reps??5));const [rpe,setRpe]=useState(String(row?.main_rpe??7.5));const [micro,setMicro]=useState(row?.rounding_kg===1.25);
 const mutation=useMutation({mutationFn:(resume:boolean)=>save({data:{athleteId,lift,enabled,plan:Number(plan),step:Number(step),sets:Number(sets),reps:Number(reps),rpe:Number(rpe),rounding:micro?1.25:2.5,resume}}),onSuccess:()=>{qc.invalidateQueries({queryKey:["push-state",athleteId]});toast.success("Coachval sparat för nästa genererade block");},onError:(e:Error)=>toast.error(e.message)});
 return <div className="space-y-3 border-t border-border pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{PUSH_LABELS[lift]}</h3><Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`Push ${PUSH_LABELS[lift]}`} disabled={mutation.isPending}/></div>
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Planetta (kg)",plan,setPlan],["Steg (%)",step,setStep],["Huvudset",sets,setSets],["Reps",reps,setReps],["Mål-RPE",rpe,setRpe]].map(([label,value,setter])=><div key={String(label)} className="space-y-1"><Label htmlFor={`push-${lift}-${label}`}>{String(label)}</Label><Input id={`push-${lift}-${label}`} type="number" step={label==="Mål-RPE"?0.5:label==="Steg (%)"?0.25:1} value={String(value)} onChange={e=>(setter as (v:string)=>void)(e.target.value)}/></div>)}</div>
 <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm"><Checkbox checked={micro} onCheckedChange={v=>setMicro(v===true)}/>Mikroplattor · 1,25 kg</label><Button size="sm" variant="outline" disabled={mutation.isPending||Number(plan)<=0} onClick={()=>mutation.mutate(false)}><Save className="mr-2 h-4 w-4"/>Spara {PUSH_LABELS[lift]}</Button></div>
 {row?.paused_reason&&<div className="flex flex-wrap items-center gap-3 text-sm"><span>{reasons[row.paused_reason]??row.paused_reason}</span><Button size="sm" variant="outline" onClick={()=>mutation.mutate(true)} disabled={mutation.isPending}>Släpp coachpausen</Button></div>}
 </div>;
}

export function FinishPushButton({exerciseId}:{exerciseId:string}) {
 const finish=useServerFn(finishPushExposure);const qc=useQueryClient();const [result,setResult]=useState("");
 const mutation=useMutation({mutationFn:()=>finish({data:{exerciseId}}),onSuccess:r=>{setResult(`${r.decision} · ${reasons[r.reason]??r.reason}${r.after?` · planetta ${r.after.toFixed(2)} kg`:""}`);qc.invalidateQueries({queryKey:["push-state"]});qc.invalidateQueries({queryKey:["athlete-plan"]});},onError:(e:Error)=>toast.error(e.message)});
 return <div className="space-y-2"><Button variant="outline" disabled={mutation.isPending} onClick={()=>mutation.mutate()}><CheckResultIcon/>Avsluta huvudpass</Button>{result&&<p role="status" className="text-sm text-muted-foreground">{result}</p>}</div>;
}
function CheckResultIcon(){return <TrendingUp className="mr-2 h-4 w-4"/>;}