import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { buildTaperPlan, type TaperSettings } from "./taperModel";
import { peakWeekStartDates,validPeakDate,peakPeriodDays } from "./peakingDates";
import type { PeakSummary } from "./peaking";
import type { TemplateWeek } from "./strengthTemplates";

export function buildD0Weeks(input:{start:string;end:string;competition:string;days:number;summary:PeakSummary|null;singles:boolean;settings?:Partial<TaperSettings>}): {weeks:TemplateWeek[];warnings:string[]} {
  if(!input.summary) return {weeks:[],warnings:["Träningshistoriken kunde inte läsas."]};
  if(!validPeakDate(input.competition)||!peakPeriodDays(input.start,input.end)) return {weeks:[],warnings:["Ange giltiga start-, slut- och tävlingsdatum."]};
  const patterns:Record<number,number[]>={2:[1,4],3:[1,3,5],4:[1,2,4,6],5:[1,2,3,5,6],6:[1,2,3,4,5,6]};
  const plan=buildTaperPlan({competitionDate:input.competition,startDate:input.start,endDate:input.end,trainingWeekdays:patterns[input.days]??patterns[4],lifts:input.summary.lifts,accessories:input.summary.accessories,settings:input.settings,singlesEnabled:input.singles});
  const starts=peakWeekStartDates(input.start,input.end);
  const weeks:TemplateWeek[]=starts.map((start,index)=>({week_index:index+1,kind:"peak",label:`Tävlingsförberedelse ${index+1}`,notes:"D0-förankrat coachutkast. Ingen automatisk avlastning.",sessions:plan.sessions.filter(s=>s.date>=start&&s.date<(starts[index+1]??format(addDays(parseISO(input.end),1),"yyyy-MM-dd"))).map(s=>({day_of_week:differenceInCalendarDays(parseISO(s.date),parseISO(start))+1,title:s.title,notes:`Fas: ${s.phase}. Datum: ${s.date}`,exercises:s.exercises.map(e=>({exercise:e.exercise,target_sets:e.sets,target_reps:e.reps,target_rpe:e.rpe,target_weight_kg:e.kg??undefined,intensity_metric:"rpe" as const,variation:e.isTechnique?"Teknikpass – ej EAk":undefined,notes:[e.notes,e.isTechnique?`Teknikpass: ${Math.round((e.pctOfE1rm??0)*1000)/10} % av e1RM. Ej EAk.`:e.rpe!=null?`Mål RPE ${e.rpe}.`:undefined].filter(Boolean).join(" ")}))}))}));
  return {weeks,warnings:plan.warnings};
}