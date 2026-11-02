import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PUSH_LIFTS } from "./pushProgression";

export const savePushSettings = createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({athleteId:z.string().uuid(),lift:z.enum(PUSH_LIFTS),enabled:z.boolean(),plan:z.number().positive().max(1000),step:z.number().positive().max(2),rounding:z.union([z.literal(1.25),z.literal(2.5)]),sets:z.number().int().min(2).max(5),reps:z.number().int().min(3).max(5),rpe:z.number().min(6).max(8.5).multipleOf(0.5),resume:z.boolean().default(false)}).parse(input))
 .handler(async({data,context})=>{
  const {error}=await context.supabase.rpc("configure_push",{_athlete:data.athleteId,_lift:data.lift,_enabled:data.enabled,_plan:data.plan,_step:data.step,_rounding:data.rounding,_sets:data.sets,_reps:data.reps,_rpe:data.rpe,_resume:data.resume});
  if(error)throw new Error("Viktprogressionen kunde inte sparas. Kontrollera coachåtkomst och värden.");
  return {ok:true};
 });
export const finishPushExposure = createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({exerciseId:z.string().uuid(),outcome:z.enum(["protocol_reduction","fatigue_stop"]).nullable().default(null)}).parse(input))
 .handler(async({data,context})=>{
  const {data:result,error}=await context.supabase.rpc("finish_push_with_outcome",{_exercise:data.exerciseId,_outcome:data.outcome??undefined});
  if(error)throw new Error("Viktbeslutet kunde inte sparas. Försök igen; samma pass räknas bara en gång.");
  return result as {decision:string;reason:string;after?:number;id?:string};
 });
export const undoPushDecision = createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({id:z.string().uuid()}).parse(input))
 .handler(async({data,context})=>{
  const {error}=await context.supabase.rpc("undo_push",{_id:data.id});
  if(error)throw new Error("Kan inte ångra: ett senare beslut, en coachändring eller påbörjad träning måste granskas först.");
  return {ok:true};
 });