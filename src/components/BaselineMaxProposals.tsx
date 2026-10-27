import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lookupBaseline } from "@/lib/eakoefficient";
import { Button } from "@/components/ui/button";

export function BaselineMaxProposals({athleteId}:{athleteId:string}) {
  const qc=useQueryClient();
  const proposals=useQuery({queryKey:["baseline-max-proposals",athleteId],queryFn:async()=>{
    const [baselines,logs,decisions]=await Promise.all([
      supabase.from("baselines").select("exercise, one_rm_kg").eq("athlete_id",athleteId),
      supabase.from("training_logs").select("id, date, exercise, variation, reps, weight_kg, rpe, is_warmup_reference, is_technique").eq("athlete_id",athleteId).eq("reps",1).eq("is_warmup_reference",false).eq("is_technique",false).order("date",{ascending:false}).limit(200),
      supabase.from("baseline_max_decisions").select("training_log_id").eq("athlete_id",athleteId),
    ]);
    if(baselines.error) throw baselines.error; if(logs.error) throw logs.error; if(decisions.error) throw decisions.error;
    const map=Object.fromEntries((baselines.data??[]).map(b=>[b.exercise,Number(b.one_rm_kg)]));
    const seen=new Set((decisions.data??[]).map(d=>d.training_log_id));
    return (logs.data??[]).filter(l=>!seen.has(l.id)&&!l.variation&&Number(l.weight_kg)>(lookupBaseline(map,l.exercise)??Infinity)).map(l=>({...l,baseline:lookupBaseline(map,l.exercise)??0}));
  }});
  const decide=useMutation({mutationFn:async({log,approve}:{log:NonNullable<typeof proposals.data>[number];approve:boolean})=>{
    const {error}=await supabase.rpc("decide_baseline_max",{_log_id:log.id,_approve:approve});
    if(error) throw error;
  },onSuccess:(_,v)=>{qc.invalidateQueries({queryKey:["baseline-max-proposals",athleteId]});qc.invalidateQueries({queryKey:["athlete-baselines",athleteId]});qc.invalidateQueries({queryKey:["athlete-baselines-list",athleteId]});toast.success(v.approve?"Baslinjen är uppdaterad":"Förslaget är avvisat");},onError:(e:Error)=>toast.error(e.message)});
  if(!proposals.data?.length) return null;
  return <section className="space-y-2 border-b border-border pb-4" aria-label="Förslag om ny baslinje"><h3 className="font-medium">Nytt max – välj om baslinjen ska ändras</h3>{proposals.data.map(log=><div key={log.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>{log.exercise}: {log.weight_kg} kg × 1 @ RPE {log.rpe}, {log.date}. Nu {log.baseline} kg.</p><div className="flex gap-2"><Button size="sm" disabled={decide.isPending} onClick={()=>decide.mutate({log,approve:true})}>Godkänn</Button><Button size="sm" variant="outline" disabled={decide.isPending} onClick={()=>decide.mutate({log,approve:false})}>Avvisa</Button></div></div>)}</section>;
}