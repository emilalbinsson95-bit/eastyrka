import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, addDays, startOfWeek } from "date-fns";
import { Dumbbell, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { STRENGTH_TEMPLATES, getTemplate } from "@/lib/strengthTemplates";
import { cn } from "@/lib/utils";

// Weekday assignments (1=Mon..7=Sun) per training frequency — spread across the week for recovery.
const DAY_SCHEDULES: Record<number, number[]> = {
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

export function GenerateStrengthTemplateDialog({
  athleteId,
  coachId,
  athleteName,
  onCreated,
}: {
  athleteId: string;
  coachId: string;
  athleteName: string;
  onCreated?: (mesoId: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>(STRENGTH_TEMPLATES[0].id);
  const nextMonday = useMemo(
    () => format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7), "yyyy-MM-dd"),
    [],
  );
  const [startDate, setStartDate] = useState(nextMonday);

  const template = getTemplate(templateId);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(template?.daysPerWeek ?? 4);

  // When template changes, reset days-per-week to that template's default.
  useEffect(() => {
    if (template) setDaysPerWeek(template.daysPerWeek);
  }, [templateId, template]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error("Pick a template");
      const weeks = template.buildWeeks();
      const schedule = DAY_SCHEDULES[daysPerWeek] ?? DAY_SCHEDULES[template.daysPerWeek];


      // 1. Mesocycle
      const { data: meso, error: mesoErr } = await supabase
        .from("mesocycles")
        .insert({
          coach_id: coachId,
          athlete_id: athleteId,
          name: template.name,
          goal: template.goal,
          start_date: startDate,
          total_weeks: template.weeks,
          days_per_week: template.daysPerWeek,
          notes: `Template: ${template.name} · Inspiration: ${template.inspiration}. All sessions editable.`,
        })
        .select("id")
        .single();
      if (mesoErr) throw mesoErr;

      // 2. Week plans
      const weekRows = weeks.map((w) => ({
        coach_id: coachId,
        athlete_id: athleteId,
        mesocycle_id: meso.id,
        week_index: w.week_index,
        week_start_date: format(addDays(new Date(startDate), (w.week_index - 1) * 7), "yyyy-MM-dd"),
        status: "draft" as const,
        notes: w.notes ?? null,
      }));
      const { data: insertedWeeks, error: wErr } = await supabase
        .from("week_plans")
        .insert(weekRows)
        .select("id, week_index");
      if (wErr) throw wErr;

      const weekIdByIdx = new Map<number, string>();
      for (const r of insertedWeeks ?? []) {
        if (r.week_index != null) weekIdByIdx.set(r.week_index, r.id);
      }

      // 3. Sessions + exercises, per week (need session ids)
      for (const w of weeks) {
        const wpId = weekIdByIdx.get(w.week_index);
        if (!wpId) continue;

        for (const s of w.sessions) {
          const { data: ps, error: psErr } = await supabase
            .from("planned_sessions")
            .insert({
              week_plan_id: wpId,
              day_of_week: s.day_of_week,
              title: s.title,
              notes: s.notes ?? null,
            })
            .select("id")
            .single();
          if (psErr) throw psErr;

          const exRows = s.exercises.map((e, idx) => ({
            planned_session_id: ps.id,
            exercise: e.exercise,
            variation: e.variation ?? null,
            target_sets: e.target_sets,
            target_reps: e.target_reps,
            target_rpe: e.target_rpe ?? null,
            target_rir: e.target_rir ?? null,
            intensity_metric: e.intensity_metric,
            lengthened_partials: e.lengthened_partials ?? false,
            last_set_to_failure: e.last_set_to_failure ?? false,
            notes: e.notes ?? null,
            order_index: idx,
          }));
          if (exRows.length > 0) {
            const { error: exErr } = await supabase.from("planned_exercises").insert(exRows);
            if (exErr) throw exErr;
          }
        }
      }

      return meso.id;
    },
    onSuccess: (mesoId) => {
      toast.success(`${template?.name} generated`);
      qc.invalidateQueries({ queryKey: ["mesocycles", athleteId] });
      setOpen(false);
      onCreated?.(mesoId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Dumbbell className="mr-1 h-4 w-4" />
          Generate from template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Strength templates
          </DialogTitle>
          <DialogDescription>
            For {athleteName}. Pre-built mesocycles inspired by Milo Wolf, Mike Tuscherer & Josef
            Eriksson. Everything is editable after generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {STRENGTH_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors hover:border-primary/50",
                  templateId === t.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{t.name}</div>
                  <Badge variant="outline" className="text-[10px]">
                    {t.daysPerWeek}d × {t.weeks}w
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t.short}</div>
                <div className="mt-2 text-[11px] text-muted-foreground italic">
                  {t.inspiration}
                </div>
              </button>
            ))}
          </div>

          {template && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="mb-1 font-medium text-foreground">Goal</div>
              <p className="text-muted-foreground">{template.goal}</p>
            </div>
          )}

          <div>
            <Label htmlFor="tpl-start">Start date (Monday)</Label>
            <Input
              id="tpl-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!template || mutation.isPending}
          >
            {mutation.isPending ? "Generating…" : "Generate mesocycle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
