import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subDays, min as minDate, addDays } from "date-fns";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { buildWeeklyReview, type ReviewPlanned, type ReviewLog } from "@/lib/weeklyReview";

export function WeeklyReviewDialog({
  athleteId, weekId, weekStartDate,
}: { athleteId: string; weekId: string; weekStartDate: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["weekly-review", athleteId, weekId],
    enabled: open,
    queryFn: async () => {
      const { data: sessions, error: e1 } = await supabase
        .from("planned_sessions")
        .select("id, planned_exercises(id, exercise, target_sets, target_reps, target_rpe, target_rir, target_weight_kg)")
        .eq("week_plan_id", weekId);
      if (e1) throw e1;
      const planned = (sessions ?? []).flatMap((s: any) => s.planned_exercises ?? []) as ReviewPlanned[];

      const end = minDate([parseISO(weekStartDate), addDays(new Date(), 1)]);
      const { data: logs, error: e2 } = await supabase
        .from("training_logs")
        .select("date, exercise, reps, weight_kg, rpe, planned_exercises(target_rpe, target_rir)")
        .eq("athlete_id", athleteId)
        .gte("date", format(subDays(end, 28), "yyyy-MM-dd"))
        .lt("date", format(end, "yyyy-MM-dd"));
      if (e2) throw e2;
      const mapped: ReviewLog[] = (logs ?? []).map((l: any) => {
        const pe = l.planned_exercises;
        const t = pe?.target_rpe ?? (pe?.target_rir != null ? 10 - Number(pe.target_rir) : null);
        return { date: l.date, exercise: l.exercise, reps: l.reps, weight_kg: Number(l.weight_kg), rpe: Number(l.rpe), planned_target_rpe: t != null ? Number(t) : null };
      });
      return buildWeeklyReview(planned, mapped);
    },
  });

  const suggestions = q.data ?? [];
  useEffect(() => {
    setSelected(new Set(suggestions.map((_, i) => i)));
  }, [q.data]);

  const grouped = useMemo(() => suggestions.map((s, i) => ({ s, i })), [suggestions]);

  async function apply() {
    setSaving(true);
    try {
      for (const i of selected) {
        const s = suggestions[i];
        const patch = s.kind === "weight" ? { target_weight_kg: s.to } : { target_sets: s.to };
        const { error } = await supabase.from("planned_exercises").update(patch).eq("id", s.plannedId);
        if (error) throw error;
      }
      toast.success(`Applied ${selected.size} change${selected.size === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["week-sessions", weekId] });
      qc.invalidateQueries({ queryKey: ["weekly-review", athleteId, weekId] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not apply changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="mr-1 h-4 w-4" /> Review & adjust
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review & adjust this week</DialogTitle>
          <DialogDescription>
            Suggestions based on the athlete's recent logged sets and RPE. Nothing changes until you apply.
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Analysing recent training…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No changes suggested — recent loads and RPE match this week's plan (or there's no logged history for these exercises yet).
          </p>
        ) : (
          <ul className="space-y-2">
            {grouped.map(({ s, i }) => (
              <li key={i} className="flex gap-3 rounded-md border border-border p-3">
                <Checkbox
                  checked={selected.has(i)}
                  onCheckedChange={(c) => {
                    const n = new Set(selected);
                    c ? n.add(i) : n.delete(i);
                    setSelected(n);
                  }}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {s.exercise}:{" "}
                    {s.kind === "weight"
                      ? `${s.from != null ? s.from + " kg" : "no load"} → ${s.to} kg`
                      : `${s.from} → ${s.to} sets`}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          <Button disabled={saving || selected.size === 0} onClick={apply}>
            Apply {selected.size} selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
