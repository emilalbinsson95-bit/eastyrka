import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dumbbell, Footprints, Bike, Waves, Activity, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { DISCIPLINES, type Discipline } from "@/lib/endurance";

type OpenEditor =
  | { kind: "endurance"; sessionId: string }
  | { kind: "adhoc_strength"; date: string };

export function AddSessionDialog({
  athleteId,
  date,
  open,
  onOpenChange,
  onOpenEditor,
}: {
  athleteId: string;
  date: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenEditor: (target: OpenEditor) => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const createEndurance = useMutation({
    mutationFn: async (opts: { discipline: Discipline; mode: "quick" | "structured" }) => {
      const { data, error } = await supabase
        .from("endurance_sessions")
        .insert({
          athlete_id: athleteId,
          date,
          discipline: opts.discipline,
          mode: opts.mode,
          // Draft: doesn't show on the calendar until the athlete actually saves
          // something (plan, a step, or the actual log).
          status: "draft",
          title:
            opts.mode === "structured"
              ? `${disciplineLabel(opts.discipline)} intervals`
              : `${disciplineLabel(opts.discipline)} session`,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      onOpenEditor({ kind: "endurance", sessionId: id });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setBusy(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add session</DialogTitle>
          <DialogDescription>
            {format(parseISO(date), "EEEE, MMMM d")} — log a completed workout for this day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Section title="Quick run / ride / swim" subtitle="Single block — total time + RPE">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DISCIPLINES.map((d) => (
                <Button
                  key={d.value}
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    createEndurance.mutate({ discipline: d.value, mode: "quick" });
                  }}
                >
                  {disciplineIcon(d.value)}
                  <span className="ml-1.5">{d.label}</span>
                </Button>
              ))}
            </div>
          </Section>

          <Section
            title="Structured intervals"
            subtitle="Warmup · main / repeats · cooldown. Log per-rep HR, distance, RPE."
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {DISCIPLINES.filter((d) => d.value !== "other").map((d) => (
                <Button
                  key={d.value}
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    createEndurance.mutate({ discipline: d.value, mode: "structured" });
                  }}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {d.label} intervals
                </Button>
              ))}
            </div>
          </Section>

          <Section title="Strength workout" subtitle="Exercises, sets, reps, weight, RPE.">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onOpenEditor({ kind: "adhoc_strength", date });
                onOpenChange(false);
              }}
            >
              <Dumbbell className="mr-1 h-4 w-4" /> Add strength workout
            </Button>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function disciplineLabel(d: Discipline) {
  return DISCIPLINES.find((x) => x.value === d)?.label ?? "Session";
}

function disciplineIcon(d: Discipline) {
  if (d === "run") return <Footprints className="h-3.5 w-3.5" />;
  if (d === "bike") return <Bike className="h-3.5 w-3.5" />;
  if (d === "swim") return <Waves className="h-3.5 w-3.5" />;
  return <Activity className="h-3.5 w-3.5" />;
}
