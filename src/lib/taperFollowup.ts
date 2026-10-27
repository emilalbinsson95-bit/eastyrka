import { addDays, format, parseISO } from "date-fns";
import { chartStrengthSeries, type ChartLog } from "./chartMetrics";
import { compLiftKey, isCompLift, type CompLift } from "./liftIdentity";
import { lookupBaseline } from "./eakoefficient";
import { DEFAULT_TAPER_SETTINGS, resolveTaperSettings, type TaperSettings } from "./taperModel";

export const dMinus21 = (competition: string) => format(addDays(parseISO(competition),-21),"yyyy-MM-dd");
export function frozenPeakBaseline(competition: string, current: Record<string,number>, history: Array<{exercise: string;one_rm_kg:number;recorded_at:string}>) {
  const target=dMinus21(competition);const result:Record<string,number>={};
  for(const exercise of new Set([...Object.keys(current),...history.map(h=>h.exercise)])) {
    const rows=history.filter(h=>h.exercise.trim().toLowerCase()===exercise.trim().toLowerCase()).sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at));
    const effective=rows.filter(h=>h.recorded_at.slice(0,10)<=target).at(-1);
    // Current baseline is only safe when no later historical change contradicts it.
    const value=effective?.one_rm_kg ?? (rows.length===0?lookupBaseline(current,exercise):undefined);
    if(value && value>0) result[exercise]=value;
  }
  return result;
}
export function peakMeasurementSeries(logs:ChartLog[],baselines:Record<string,number>,competition:string) {
  const start=format(addDays(parseISO(competition),-42),"yyyy-MM-dd");
  const points=chartStrengthSeries(logs.filter(l=>isCompLift(l.exercise,l.variation)),baselines);
  return points.filter(p=>p.date>=start&&p.date<competition).map(p=>({...p,lift:compLiftKey(p.exercise)}));
}
export interface PeakAttempt { kg:number|null;success:boolean|null }
export type PeakAttempts=Partial<Record<CompLift,PeakAttempt[]>>;
export function competitionEAk(attempts:PeakAttempts,baselines:Record<string,number>,names:Partial<Record<CompLift,string>>) {
  return (["squat","bench","deadlift"] as const).map(lift=>{
    const best=Math.max(0,...(attempts[lift]??[]).filter(a=>a.success===true&&a.kg!=null).map(a=>a.kg??0));
    const baseline=names[lift]?lookupBaseline(baselines,names[lift]??"")??0:0;
    return {lift,best:best||null,eak:best>0&&baseline>0?best/baseline*100:null};
  });
}
export const savedTaperSettings=(value:unknown):TaperSettings=>value&&typeof value==="object"&&!Array.isArray(value)?resolveTaperSettings(value as Partial<TaperSettings>):DEFAULT_TAPER_SETTINGS;