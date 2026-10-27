import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { buildTaperPlan, d0TrainingWeekdays, type TaperSettings } from "./taperModel";
import { peakWeekStartDates,validPeakDate,peakPeriodDays } from "./peakingDates";
import type { PeakSummary } from "./peaking";
import type { TemplateWeek } from "./strengthTemplates";

/**
 * D0 plan → generator weeks. Training days are counted back from the
 * competition so the lift-specific rule days land on real sessions. Windows
 * with no sessions (a short leading stub) are dropped and the rest renumbered;
 * `weekStarts[i]` is the calendar start of `weeks[i]`.
 */
export function buildD0Weeks(input:{start:string;end:string;competition:string;days:number;summary:PeakSummary|null;singles:boolean;settings?:Partial<TaperSettings>}): {weeks:TemplateWeek[];warnings:string[];weekStarts:string[]} {
  if(!input.summary) return {weeks:[],warnings:["Träningshistoriken kunde inte läsas."],weekStarts:[]};
  if(!validPeakDate(input.competition)||!peakPeriodDays(input.start,input.end)) return {weeks:[],warnings:["Ange giltiga start-, slut- och tävlingsdatum."],weekStarts:[]};
  const plan=buildTaperPlan({competitionDate:input.competition,startDate:input.start,endDate:input.end,trainingWeekdays:d0TrainingWeekdays(input.competition,input.days),lifts:input.summary.lifts,accessories:input.summary.accessories,settings:input.settings,singlesEnabled:input.singles});
  const starts=peakWeekStartDates(input.start,input.end);
  const afterEnd=format(addDays(parseISO(input.end),1),"yyyy-MM-dd");
  const windows=starts.map((start,index)=>({start,sessions:plan.sessions.filter(s=>s.date>=start&&s.date<(starts[index+1]??afterEnd))})).filter(w=>w.sessions.length>0);
  const weeks:TemplateWeek[]=windows.map(({start,sessions},index)=>({week_index:index+1,kind:"peak",label:`Tävlingsförberedelse ${index+1}`,notes:"D0-förankrat coachutkast. Ingen automatisk avlastning.",sessions:sessions.map(s=>({day_of_week:differenceInCalendarDays(parseISO(s.date),parseISO(start))+1,title:s.title,notes:`Fas: ${s.phase}. Datum: ${s.date}`,exercises:s.exercises.map(e=>({exercise:e.exercise,target_sets:e.sets,target_reps:e.reps,target_rpe:e.rpe,target_weight_kg:e.kg??undefined,intensity_metric:"rpe" as const,variation:e.isTechnique?"Teknikpass – ej EAk":e.variation,notes:[e.notes,e.isTechnique?`Teknikpass: ${Math.round((e.pctOfE1rm??0)*1000)/10} % av e1RM. Ej EAk.`:e.rpe!=null?`Mål RPE ${e.rpe}.`:undefined].filter(Boolean).join(" ")}))}))}));
  return {weeks,warnings:plan.warnings,weekStarts:windows.map(w=>w.start)};
}
