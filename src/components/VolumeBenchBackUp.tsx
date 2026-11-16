import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BACK_UP_ABSENCE_DAYS, BACK_UP_SESSIONS, suggestBackUp, VOLUME_BENCH_ID } from "@/lib/volumeBench";

/**
 * Volymblock bänk: sessions are never skipped. After an absence of five days or
 * more the app suggests "Backa tre pass"; nothing changes until the coach approves.
 */
export function VolumeBenchBackUp({ cycleId, athleteId }: { cycleId: string; athleteId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["volume-bench-backup", cycleId],
    queryFn: async () => {
      const { data: meso, error } = await supabase.from("mesocycles").select("template_id").eq("id", cycleId).maybeSingle();
      if (error) throw error;
      if (meso?.template_id !== VOLUME_BENCH_ID) return null;
      const { data: ex, error: exErr } = await supabase
        .from("planned_exercises")
        .select("id, planned_sessions!inner(week_plans!inner(mesocycle_id))")
        .eq("planned_sessions.week_plans.mesocycle_id", cycleId);
      if (exErr) throw exErr;
      const ids = (ex ?? []).map((e) => e.id);
      if (!ids.length) return null;
      const { data: logs, error: logErr } = await supabase
        .from("training_logs")
        .select("date")
        .eq("athlete_id", athleteId)
        .in("planned_exercise_id", ids)
        .order("date", { ascending: false })
        .limit(1);
      if (logErr) throw logErr;
      return { lastTrained: logs?.[0]?.date ?? null };
    },
  });
  const backUp = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("volume_bench_back_up", { _mesocycle: cycleId, _steps: BACK_UP_SESSIONS });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (n) => {
      qc.invalidateQueries();
      toast.success(`${n} pass upprepas. Resten av blocket ligger kvar i samma ordning.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const today = new Date().toISOString().slice(0, 10);
  if (!query.data?.lastTrained || !suggestBackUp(query.data.lastTrained, today)) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm" role="status">
      <p>
        Senaste loggade bänkpass var {query.data.lastTrained.slice(0, 10)}, minst {BACK_UP_ABSENCE_DAYS} dagar sedan. Förslag: backa tre pass, så görs de tre senaste passen igen innan blocket fortsätter.
      </p>
      <Button size="sm" variant="outline" disabled={backUp.isPending} onClick={() => backUp.mutate()}>
        <Undo2 className="mr-2 h-4 w-4" /> Backa tre pass
      </Button>
    </div>
  );
}
