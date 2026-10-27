import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ArrowLeft, Calendar, Check, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { plannedSessionDate } from "@/lib/planned-session-dates";
import { compLiftKey, isCompLift, type CompLift } from "@/lib/liftIdentity";
import { competitionEAk, dMinus21, frozenPeakBaseline, peakMeasurementSeries, savedTaperSettings, type PeakAttempts } from "@/lib/taperFollowup";
import { TAPER_LIFT_LABEL, TAPER_LIFTS } from "@/lib/taperModel";
import { suggestOpeners } from "@/lib/peakOpeners";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, ReferenceLine, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/coach/athletes/$athleteId/peaking")({
  head: () => ({ meta: [
    { title: "Toppningsuppföljning — SETPOINT" },
    { name: "description", content: "Tävlingsdag, toppningsfaser, lyftens regeldagar, EAk och coachens tävlingsförsök." },
    { property: "og:title", content: "Toppningsuppföljning — SETPOINT" },
    { property: "og:description", content: "Följ toppningen från D−42 till tävlingsutvärderingen med coachstyrda beslut." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: PeakingPage,
});

interface PeakFlag { id: string; message: string; decision: "pending"|"approved"|"rejected"; note?: string }
const objectNumbers = (value: Json | null): Record<string,number> => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string,number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))) : {};
function PeakingPage() {
  const { athleteId } = Route.useParams();const {user}=useAuth();const qc=useQueryClient();
  const [cycle,setCycle]=useState("");const [competition,setCompetition]=useState("");
  const [openers,setOpeners]=useState<Record<string,number>>({});const [attempts,setAttempts]=useState<PeakAttempts>({});
  const [flags,setFlags]=useState<PeakFlag[]>([]);const [newFlag,setNewFlag]=useState("");
  const query=useQuery({queryKey:["peaking-followup",athleteId],queryFn:async()=>{
    const [profile,cycles,followups,weeks,logs,baselines,history,competitions,style]=await Promise.all([
      supabase.from("profiles").select("full_name").eq("id",athleteId).maybeSingle(),
      supabase.from("mesocycles").select("id,name,start_date,total_weeks,notes,status").eq("athlete_id",athleteId).neq("status","archived").order("start_date",{ascending:false}),
      supabase.from("taper_followups").select("*").eq("athlete_id",athleteId),
      supabase.from("week_plans").select("id,mesocycle_id,week_start_date,status,training_phase,planned_sessions(id,day_of_week,title,notes,planned_exercises(exercise,variation,target_sets,target_reps,target_weight_kg,target_rpe))").eq("athlete_id",athleteId).order("week_start_date"),
      supabase.from("training_logs").select("date,exercise,variation,set_number,reps,weight_kg,rpe,is_warmup_reference,is_technique").eq("athlete_id",athleteId).order("date").limit(10000),
      supabase.from("baselines").select("exercise,one_rm_kg").eq("athlete_id",athleteId),
      supabase.from("baseline_history").select("exercise,one_rm_kg,recorded_at,note").eq("athlete_id",athleteId).order("recorded_at"),
      supabase.from("competitions").select("comp_date,name").eq("athlete_id",athleteId).order("comp_date"),
      supabase.from("athlete_strength_volume_profiles").select("deadlift_style").eq("athlete_id",athleteId).maybeSingle(),
    ]);
    for(const result of [profile,cycles,followups,weeks,logs,baselines,history,competitions,style])if(result.error)throw result.error;
    const followupIds=new Set((followups.data??[]).map(f=>f.mesocycle_id));
    const peakIds=new Set((weeks.data??[]).filter(w=>["peak","taper","volymtopp","intensifiering","overbelastning"].includes(w.training_phase??"")).map(w=>w.mesocycle_id));
    return {profile:profile.data,cycles:(cycles.data??[]).filter(c=>followupIds.has(c.id)||peakIds.has(c.id)||/toppning|tävlingsförbered|peak/i.test(c.name)||c.notes?.includes("Toppningsperiod:")),followups:followups.data??[],weeks:weeks.data??[],logs:(logs.data??[]).map(l=>({...l,rpe:Number(l.rpe),weight_kg:Number(l.weight_kg)})),baselines:Object.fromEntries((baselines.data??[]).map(b=>[b.exercise,Number(b.one_rm_kg)])),history:history.data??[],competitions:competitions.data??[],style:style.data?.deadlift_style??"conventional"};
  }});
  const data=query.data;const selected=cycle || data?.cycles[0]?.id || "";
  const current=data?.followups.find(f=>f.mesocycle_id===selected);const meso=data?.cycles.find(c=>c.id===selected);
  useEffect(()=>{
    const end=meso?.notes?.match(/Toppningsperiod: \d{4}-\d{2}-\d{2} – (\d{4}-\d{2}-\d{2})/)?.[1];
    setCompetition(current?.competition_date ?? (end?format(addDays(parseISO(end),1),"yyyy-MM-dd"):data?.competitions.find(c=>!meso||c.comp_date>=meso.start_date)?.comp_date??""));
    setOpeners(objectNumbers(current?.openers??null));
    const parsedAttempts:PeakAttempts={};
    if(current?.attempts&&typeof current.attempts==="object"&&!Array.isArray(current.attempts))for(const lift of TAPER_LIFTS){const value=current.attempts[lift];if(Array.isArray(value))parsedAttempts[lift]=value.slice(0,3).map(v=>v&&typeof v==="object"&&!Array.isArray(v)?{kg:typeof v.kg==="number"?v.kg:null,success:typeof v.success==="boolean"?v.success:null}:{kg:null,success:null});}
    setAttempts(parsedAttempts);
    setFlags(Array.isArray(current?.flags)?current.flags.flatMap(f=>f&&typeof f==="object"&&!Array.isArray(f)&&typeof f.id==="string"&&typeof f.message==="string"&&["pending","approved","rejected"].includes(String(f.decision))?[{id:f.id,message:f.message,decision:f.decision as PeakFlag["decision"],note:typeof f.note==="string"?f.note:undefined}]:[]):[]);
  },[selected,current,data?.competitions,meso]);
  const hasSavedSettings=current?.settings&&typeof current.settings==="object"&&!Array.isArray(current.settings)&&Object.keys(current.settings).length>0;
  const settings=savedTaperSettings(current?.settings);
  const today=format(new Date(),"yyyy-MM-dd");const validDate=/^\d{4}-\d{2}-\d{2}$/.test(competition);
  const frozen=objectNumbers(current?.frozen_baselines??null);
  const proposedFrozen=validDate&&data?frozenPeakBaseline(competition,data.baselines,data.history):{};
  const reference=current?.frozen_at?frozen:{};
  const points=validDate&&data?peakMeasurementSeries(data.logs,reference,competition):[];
  const names:Partial<Record<CompLift,string>>={};for(const point of points)if(point.lift)names[point.lift]=point.exercise;
  const openerSuggestions=useMemo(()=>data&&validDate?suggestOpeners({today,logs:data.logs,baselines:Object.entries(data.baselines).map(([exercise,one_rm_kg])=>({exercise,one_rm_kg}))},data.style as "sumo"|"conventional"):[],[data,today,validDate]);
  const sessions=(data?.weeks??[]).filter(w=>w.mesocycle_id===selected).flatMap(w=>w.planned_sessions.map(s=>({...s,date:plannedSessionDate(w.week_start_date,s,w.planned_sessions),status:w.status,phase:s.notes?.match(/Fas: ([^.]+)/)?.[1]??w.training_phase??""}))).sort((a,b)=>a.date.localeCompare(b.date));
  const phases=[...new Set(sessions.map(s=>s.phase))].map(phase=>{const dates=sessions.filter(s=>s.phase===phase).map(s=>s.date);return{phase,start:dates[0],end:dates.at(-1)};});
  const save=useMutation({mutationFn:async(freeze:boolean)=>{
    if(!user||!selected||!validDate)throw new Error("Välj toppning och tävlingsdatum.");
    if(freeze && today<dMinus21(competition))throw new Error("Referensen kan frysas först vid D−21.");
    const chosen={...openers};for(const suggestion of openerSuggestions)if(chosen[suggestion.key]==null && suggestion.kg!=null)chosen[suggestion.key]=suggestion.kg;
    if(Object.values(chosen).some(v=>!Number.isFinite(v)||v<0)||Object.values(attempts).some(values=>values?.some(a=>a.kg!=null&&(!Number.isFinite(a.kg)||a.kg<0))))throw new Error("Vikter måste vara noll eller högre.");
    const {error}=await supabase.from("taper_followups").upsert({mesocycle_id:selected,athlete_id:athleteId,competition_date:competition,settings:(current?.settings??{}) as Json,openers:chosen as Json,attempts:attempts as unknown as Json,flags:flags as unknown as Json,updated_by:user.id,updated_at:new Date().toISOString(),...(freeze&&!current?.frozen_at?{frozen_baselines:proposedFrozen as Json,frozen_at:dMinus21(competition)}:{})});
    if(error)throw error;
  },onSuccess:()=>{qc.invalidateQueries({queryKey:["peaking-followup",athleteId]});qc.invalidateQueries({queryKey:["pending-coach-decisions"]});toast.success("Toppningsuppföljningen är sparad; träningspassen är oförändrade.");},onError:(e:Error)=>toast.error(e.message)});
  const results=competitionEAk(attempts,reference,names);
  return <div className="space-y-6">
    <Button asChild variant="ghost" size="sm"><Link to="/coach/athletes/$athleteId" params={{athleteId}}><ArrowLeft className="mr-2 h-4 w-4"/>Till atleten</Link></Button>
    <header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Toppning · {data?.profile?.full_name??"Atlet"}</h1>{validDate&&<p className="font-mono text-primary">{differenceInCalendarDays(parseISO(competition),parseISO(today))>=0?`${differenceInCalendarDays(parseISO(competition),parseISO(today))} dagar till D0`:`${-differenceInCalendarDays(parseISO(competition),parseISO(today))} dagar efter D0`} · {competition}</p>}</div><Button asChild variant="outline"><Link to="/coach/athletes/$athleteId/calendar" params={{athleteId}}><Calendar className="mr-2 h-4 w-4"/>Kalender</Link></Button></header>
    {query.isLoading&&<p>Laddar toppningen…</p>}{query.isError&&<p role="alert" className="text-destructive">Kunde inte hämta toppningsuppföljningen.</p>}
    {data&&!data.cycles.length&&<p className="text-muted-foreground">Ingen toppningsplan finns för atleten.</p>}
    {data&&selected&&<>
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-0"><Label>Toppningsplan</Label><Select value={selected} onValueChange={setCycle}><SelectTrigger className="w-full sm:w-72"><SelectValue/></SelectTrigger><SelectContent>{data.cycles.map(c=><SelectItem key={c.id} value={c.id}>{c.name} · {c.start_date}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="peak-followup-d0">Tävlingsdatum</Label><Input id="peak-followup-d0" type="date" disabled={!!current?.frozen_at} value={competition} onChange={e=>setCompetition(e.target.value)}/></div><Button disabled={save.isPending||!validDate} onClick={()=>save.mutate(false)}><Save className="mr-2 h-4 w-4"/>Spara uppföljning</Button></div>
      <section className="space-y-3 border-y border-border py-5"><h2 className="text-lg font-semibold">Faser och pass</h2><div className="grid gap-3 sm:grid-cols-3">{phases.map(p=><div key={p.phase} className="border-l-2 border-primary pl-3"><p className="font-medium">{p.phase}</p><p className="text-xs text-muted-foreground">{p.start} – {p.end}</p></div>)}{validDate&&<div className="border-l-2 border-border pl-3"><p className="font-medium">Vila → tävling</p><p className="text-xs text-muted-foreground">{format(addDays(parseISO(competition),-settings.restDays),"yyyy-MM-dd")} – {competition}</p></div>}</div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="py-2">Datum</th><th>D−</th><th>Pass</th><th>Set</th><th>Status</th></tr></thead><tbody>{sessions.map(s=><tr key={s.id} className="border-b border-border"><td className="py-2 pr-3 whitespace-nowrap">{s.date}</td><td className="pr-3">{validDate?differenceInCalendarDays(parseISO(competition),parseISO(s.date)):"—"}</td><td className="pr-3">{s.title}</td><td className="pr-3">{s.planned_exercises.reduce((sum,e)=>sum+e.target_sets,0)}</td><td>{s.status==="published"?"Publicerat":"Utkast"}</td></tr>)}</tbody></table></div></section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">Regeldagar per lyft</h2><div className="grid gap-3 sm:grid-cols-3">{TAPER_LIFTS.map(lift=>{const matching=sessions.filter(s=>s.planned_exercises.some(e=>isCompLift(e.exercise,e.variation)&&compLiftKey(e.exercise)===lift));const heavy=matching.find(s=>s.title?.includes("Sista tunga")&&s.planned_exercises.some(e=>compLiftKey(e.exercise)===lift&&Number(e.target_rpe)>=7));return <div key={lift} className="space-y-1 border-l border-border pl-3"><h3 className="font-medium">{TAPER_LIFT_LABEL[lift]}</h3><p className="text-sm">Sista tunga: {heavy?.date??"Saknar tydlig passmarkering"}</p><p className="text-sm">Sista exponering: {matching.at(-1)?.date??"—"}</p><p className="text-xs text-muted-foreground">Sparad regel: D−{settings.heavyDay[lift]} / D−{settings.lastDay[lift]}{!hasSavedSettings?" (standard, inställningshistorik saknas)":""}</p></div>;})}</div></section>
      <section className="space-y-3 border-y border-border py-5"><h2 className="text-lg font-semibold">EAk mot fryst D−21-baslinje</h2>{!current?.frozen_at?<div className="space-y-2"><p className="text-sm text-muted-foreground">Ingen fryst referens ännu. Vid D−21 används historiska coachbaslinjer; saknat historikunderlag visas som saknat.</p><Button variant="outline" disabled={!validDate||today<dMinus21(competition)||save.isPending||!Object.keys(proposedFrozen).length} onClick={()=>save.mutate(true)}>Frys referens för {validDate?dMinus21(competition):"D−21"}</Button></div>:<><p className="text-xs text-muted-foreground">Fryst referens {current.frozen_at}; senare maxbeslut ändrar inte denna jämförelse.</p><div className="h-60"><ResponsiveContainer><LineChart data={[...new Set(points.map(p=>p.date))].map(date=>({date,...Object.fromEntries(points.filter(p=>p.date===date&&p.lift).map(p=>[p.lift,p.eak]))}))}><CartesianGrid stroke="var(--border)"/><XAxis dataKey="date" fontSize={10}/><YAxis domain={["auto","auto"]} unit=" %" fontSize={10}/><Tooltip/><Legend/><ReferenceLine y={100} stroke="var(--muted-foreground)"/>{TAPER_LIFTS.map((lift,i)=><Line key={lift} dataKey={lift} name={TAPER_LIFT_LABEL[lift]} stroke={`var(--chart-${i+1})`} connectNulls dot={{r:3}}/>)}</LineChart></ResponsiveContainer></div></>}</section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">Flaggor och coachbeslut</h2><div className="flex gap-2"><Input aria-label="Ny toppningsflagga" placeholder="Coachens flagga" value={newFlag} onChange={e=>setNewFlag(e.target.value)}/><Button variant="outline" disabled={!newFlag.trim()} onClick={()=>{setFlags(f=>[...f,{id:crypto.randomUUID(),message:newFlag.trim(),decision:"pending"}]);setNewFlag("");}}>Lägg till</Button></div>{flags.map(flag=><div key={flag.id} className="space-y-2 border-b border-border py-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm">{flag.message}</p><Badge variant="secondary">{flag.decision==="pending"?"Väntande":flag.decision==="approved"?"Godkänt":"Avvisat"}</Badge></div><Input aria-label={`Notering ${flag.message}`} placeholder="Coachens notering" value={flag.note??""} onChange={e=>setFlags(fs=>fs.map(f=>f.id===flag.id?{...f,note:e.target.value}:f))}/><div className="flex gap-2"><Button size="sm" onClick={()=>setFlags(fs=>fs.map(f=>f.id===flag.id?{...f,decision:"approved"}:f))}><Check className="mr-1 h-4 w-4"/>Godkänn</Button><Button size="sm" variant="outline" onClick={()=>setFlags(fs=>fs.map(f=>f.id===flag.id?{...f,decision:"rejected"}:f))}><X className="mr-1 h-4 w-4"/>Avvisa</Button></div></div>)}<Button variant="outline" disabled={save.isPending||!validDate} onClick={()=>save.mutate(false)}>Spara flaggor och beslut</Button></section>
      <section className="space-y-4 border-y border-border py-5"><h2 className="text-lg font-semibold">Tävlingskort</h2><div className="grid gap-5 lg:grid-cols-3">{TAPER_LIFTS.map(lift=>{const suggestion=openerSuggestions.find(s=>s.key===lift);return <div key={lift} className="space-y-3"><h3 className="font-medium">{TAPER_LIFT_LABEL[lift]}</h3><p className="text-xs text-muted-foreground">RTS-förslag: {suggestion?.kg??"saknas"}{suggestion?.kg?" kg":""} · {suggestion?.sources.map(s=>`${s.date}: e1RM ${s.e1rm.toFixed(1)} kg`).join("; ")||"Färska kvalificerade mätset saknas"}</p><div><Label htmlFor={`opener-${lift}`}>Coachens öppning (kg)</Label><Input id={`opener-${lift}`} type="number" min={0} step={2.5} value={openers[lift]??suggestion?.kg??""} onChange={e=>setOpeners(o=>({...o,[lift]:Number(e.target.value)}))}/></div>{[0,1,2].map(index=>{const attempt=attempts[lift]?.[index]??{kg:null,success:null};return <div key={index} className="flex items-center gap-2"><Label className="shrink-0" htmlFor={`attempt-${lift}-${index}`}>{index+1}</Label><Input id={`attempt-${lift}-${index}`} aria-label={`${TAPER_LIFT_LABEL[lift]} försök ${index+1} kg`} type="number" min={0} step={2.5} value={attempt.kg??""} onChange={e=>setAttempts(a=>{const values=[...(a[lift]??Array.from({length:3},()=>({kg:null,success:null})))];values[index]={...attempt,kg:e.target.value?Number(e.target.value):null};return{...a,[lift]:values};})}/><Select value={attempt.success===null?"unset":attempt.success?"good":"no"} onValueChange={value=>setAttempts(a=>{const values=[...(a[lift]??Array.from({length:3},()=>({kg:null,success:null})))];values[index]={...attempt,success:value==="unset"?null:value==="good"};return{...a,[lift]:values};})}><SelectTrigger className="w-32" aria-label={`${TAPER_LIFT_LABEL[lift]} försök ${index+1} resultat`}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unset">Ej avgjort</SelectItem><SelectItem value="good">Godkänt</SelectItem><SelectItem value="no">Underkänt</SelectItem></SelectContent></Select></div>;})}</div>;})}</div><Button disabled={save.isPending||!validDate} onClick={()=>save.mutate(false)}>Spara tävlingskort</Button></section>
      {validDate&&today>=competition&&<section className="space-y-3"><h2 className="text-lg font-semibold">Tävlings-EAk</h2><div className="grid gap-3 sm:grid-cols-3">{results.map(result=><div key={result.lift}><h3>{TAPER_LIFT_LABEL[result.lift]}</h3><p className="font-mono">{result.best??"—"} kg · {result.eak?.toFixed(1)??"—"} %</p></div>)}</div><p className="text-xs text-muted-foreground">Tyngsta godkända försök mot den frysta referensen. Saknat resultat eller baslinje ger ingen poäng.</p></section>}
    </>}
  </div>;
}