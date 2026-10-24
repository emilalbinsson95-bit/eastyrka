/** Pass-RPE och passtid efter avslutat styrkepass. Sparas en gång per dag. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function SessionFeedbackRow({ athleteId, dateStr }: { athleteId: string; dateStr: string }) {
  const [rpe, setRpe] = useState("");
  const [min, setMin] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("strength_session_feedback")
      .select("session_rpe, duration_min")
      .eq("athlete_id", athleteId)
      .eq("date", dateStr)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRpe(data.session_rpe?.toString() ?? "");
          setMin(data.duration_min?.toString() ?? "");
          setSaved(true);
        }
      });
  }, [athleteId, dateStr]);

  const save = async () => {
    const r = Number(rpe.replace(",", "."));
    const m = Number(min);
    if (!(r >= 1 && r <= 10) || !(m >= 1 && m <= 600)) {
      toast.error("Ange RPE 1–10 och tid i minuter.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("strength_session_feedback")
      .upsert({ athlete_id: athleteId, date: dateStr, session_rpe: r, duration_min: Math.round(m), updated_at: new Date().toISOString() }, { onConflict: "athlete_id,date" });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSaved(true);
    toast.success("Sparat");
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">Hur tungt var passet som helhet?</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input inputMode="decimal" placeholder="RPE 1–10" value={rpe} onChange={(e) => setRpe(e.target.value)} className="h-9 w-28" aria-label="Pass-RPE" />
        <Input inputMode="numeric" placeholder="Minuter" value={min} onChange={(e) => setMin(e.target.value)} className="h-9 w-28" aria-label="Passtid i minuter" />
        <Button size="sm" onClick={save} disabled={busy}>{saved ? "Uppdatera" : "Spara"}</Button>
      </div>
    </div>
  );
}
