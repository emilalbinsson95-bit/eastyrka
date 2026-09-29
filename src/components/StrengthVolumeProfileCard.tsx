import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_STRENGTH_VOLUME, volumeProfileFromRow, type StrengthVolumeProfile } from "@/lib/strengthVolumeProfile";

export function StrengthVolumeProfileCard({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["strength-volume-profile", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_strength_volume_profiles")
        .select("squat_factor, bench_factor, deadlift_factor")
        .eq("athlete_id", athleteId).maybeSingle();
      if (error) throw error;
      return volumeProfileFromRow(data);
    },
  });
  const [draft, setDraft] = useState<StrengthVolumeProfile>(DEFAULT_STRENGTH_VOLUME);
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("athlete_strength_volume_profiles").upsert({
        athlete_id: athleteId,
        squat_factor: draft.squat,
        bench_factor: draft.bench,
        deadlift_factor: draft.deadlift,
        updated_at: new Date().toISOString(),
      }, { onConflict: "athlete_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["strength-volume-profile", athleteId] }); toast.success("Volume profile saved"); },
    onError: (error: Error) => toast.error(error.message),
  });

  const changed = (Object.keys(draft) as Array<keyof StrengthVolumeProfile>)
    .some((key) => draft[key] !== (query.data ?? DEFAULT_STRENGTH_VOLUME)[key]);

  return <Card>
    <CardHeader>
      <CardTitle>Strength volume profile</CardTitle>
      <CardDescription>Set how much squat, bench and deadlift-pattern work this athlete usually tolerates. The center dot is the template baseline; each step changes the planned sets by 5%. This is a coaching preference, not a bodyweight or sex-based estimate.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {query.isError && <p role="alert" className="text-sm text-destructive">Could not load the volume profile. Try again.</p>}
      {([ ["squat", "Squat"], ["bench", "Bench"], ["deadlift", "Deadlift / hinge"] ] as const).map(([key, title]) => (
        <div key={key} className="space-y-2">
          <div className="flex items-center justify-between gap-3"><Label htmlFor={`strength-volume-${key}-${athleteId}`}>{title}</Label><span className="font-mono text-sm tabular-nums">{draft[key] === 1 ? "Baseline" : `${draft[key] > 1 ? "+" : "−"}${Math.round(Math.abs(draft[key] - 1) * 100)}% sets`}</span></div>
          <Slider id={`strength-volume-${key}-${athleteId}`} aria-label={`${title} volume`} value={[draft[key]]} min={0.6} max={1.4} step={0.05} disabled={query.isLoading || query.isError || save.isPending} onValueChange={([value]) => { if (value != null) setDraft((prev) => ({ ...prev, [key]: value })); }} />
          <div className="flex justify-between text-xs text-muted-foreground"><span>Less</span><span>•</span><span>More</span></div>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={!changed || save.isPending} onClick={() => setDraft(query.data ?? DEFAULT_STRENGTH_VOLUME)}>Reset</Button>
        <Button type="button" disabled={!changed || query.isError || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save volume profile"}</Button>
      </div>
    </CardContent>
  </Card>;
}