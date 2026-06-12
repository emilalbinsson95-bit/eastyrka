import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

/**
 * One-question daily check-in for patients: stiffness 0–10.
 * Upserts on (patient_id, date) so a second save the same day updates the value.
 */
export function StiffnessCheckInCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const patientId = user!.id;
  const today = new Date().toISOString().slice(0, 10);

  const todayQuery = useQuery({
    queryKey: ["patient-checkin-today", patientId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_checkins")
        .select("stiffness, note")
        .eq("patient_id", patientId)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [stiffness, setStiffness] = useState<number>(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (todayQuery.data) {
      setStiffness(todayQuery.data.stiffness);
      setNote(todayQuery.data.note ?? "");
    }
  }, [todayQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("patient_checkins")
        .upsert(
          {
            patient_id: patientId,
            date: today,
            stiffness,
            note: note || null,
          },
          { onConflict: "patient_id,date" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Check-in saved");
      qc.invalidateQueries({ queryKey: ["patient-checkin-today"] });
      qc.invalidateQueries({ queryKey: ["progression-stiffness", patientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alreadySaved = !!todayQuery.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" /> Daily check-in
          {alreadySaved && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </CardTitle>
        <CardDescription>How stiff do you feel today? (0–10)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <Slider
            value={[stiffness]}
            min={0}
            max={10}
            step={1}
            onValueChange={(v) => setStiffness(v[0] ?? 0)}
            className="flex-1"
          />
          <span className="w-10 text-right text-2xl font-bold tabular-nums">
            {stiffness}
          </span>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Optional note (where, what helps…)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button
          size="sm"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending
            ? "Saving…"
            : alreadySaved
              ? "Update today's check-in"
              : "Save check-in"}
        </Button>
      </CardContent>
    </Card>
  );
}
