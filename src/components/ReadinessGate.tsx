import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Activity, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const surveySchema = z.object({
  bodyweight_kg: z.number().min(20).max(400).optional(),
  work_stress: z.number().int().min(1).max(10),
  life_stress: z.number().int().min(1).max(10),
  fatigue: z.number().int().min(1).max(10),
  sleep_hours: z.number().min(0).max(24).optional(),
  sleep_quality: z.number().int().min(1).max(10),
  nutrition: z.number().int().min(1).max(10),
  stiffness: z.number().int().min(1).max(10),
  notes: z.string().trim().max(500).optional(),
  daily_form: z.number().int().min(1).max(10),
});

interface ReadinessSurvey {
  id: string;
  date: string;
  bodyweight_kg: number | null;
  work_stress: number;
  life_stress: number;
  fatigue: number;
  sleep_hours: number | null;
  sleep_quality: number | null;
  nutrition: number | null;
  stiffness: number | null;
  notes: string | null;
  daily_form: number;
}

/**
 * Gating wrapper: if no readiness survey exists for `dateStr`,
 * shows the survey form. Once submitted (or already exists), renders children.
 */
export function ReadinessGate({
  athleteId,
  dateStr,
  children,
}: {
  athleteId: string;
  dateStr: string;
  children: React.ReactNode;
}) {
  const surveyQuery = useQuery({
    queryKey: ["readiness-survey", athleteId, dateStr],
    queryFn: async (): Promise<ReadinessSurvey | null> => {
      const { data, error } = await supabase
        .from("readiness_surveys")
        .select(
          "id, date, bodyweight_kg, work_stress, life_stress, fatigue, sleep_hours, sleep_quality, nutrition, stiffness, notes, daily_form",
        )
        .eq("athlete_id", athleteId)
        .eq("date", dateStr)
        .maybeSingle();
      if (error) throw error;
      return data as ReadinessSurvey | null;
    },
  });

  if (surveyQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }

  if (!surveyQuery.data) {
    return <ReadinessSurveyForm athleteId={athleteId} dateStr={dateStr} />;
  }

  return (
    <div className="space-y-4">
      <ReadinessSummary survey={surveyQuery.data} athleteId={athleteId} />
      {children}
    </div>
  );
}

function ReadinessSummary({
  survey,
  athleteId,
}: {
  survey: ReadinessSurvey;
  athleteId: string;
}) {
  const queryClient = useQueryClient();
  const tone =
    survey.daily_form >= 8
      ? "bg-status-peaking text-status-peaking-foreground"
      : survey.daily_form >= 6
        ? "bg-status-adapting text-status-adapting-foreground"
        : survey.daily_form >= 4
          ? "bg-status-undertrained text-status-undertrained-foreground"
          : "bg-status-exhausted text-status-exhausted-foreground";

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("readiness_surveys")
        .delete()
        .eq("id", survey.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Survey reset");
      queryClient.invalidateQueries({
        queryKey: ["readiness-survey", athleteId, survey.date],
      });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Daily form
          </CardTitle>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-sm font-bold",
              tone,
            )}
          >
            {survey.daily_form}/10
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Work stress" value={survey.work_stress} />
          <Stat label="Life stress" value={survey.life_stress} />
          <Stat label="Fatigue" value={survey.fatigue} />
          {survey.sleep_quality !== null && (
            <Stat label="Sleep quality" value={survey.sleep_quality} />
          )}
          {survey.nutrition !== null && (
            <Stat label="Nutrition" value={survey.nutrition} />
          )}
          {survey.stiffness !== null && (
            <Stat label="Stiffness" value={survey.stiffness} />
          )}
          {survey.bodyweight_kg !== null && (
            <Stat label="Bodyweight" value={`${survey.bodyweight_kg} kg`} />
          )}
          {survey.sleep_hours !== null && (
            <Stat label="Sleep" value={`${survey.sleep_hours}h`} />
          )}
        </div>
        {survey.notes && (
          <p className="rounded bg-muted/40 px-2 py-1.5">{survey.notes}</p>
        )}
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => reset.mutate()}
          disabled={reset.isPending}
        >
          Re-take survey
        </button>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ReadinessSurveyForm({
  athleteId,
  dateStr,
}: {
  athleteId: string;
  dateStr: string;
}) {
  const queryClient = useQueryClient();
  const [bodyweight, setBodyweight] = useState<string>("");
  const [sleep, setSleep] = useState<string>("");
  const [workStress, setWorkStress] = useState(5);
  const [lifeStress, setLifeStress] = useState(5);
  const [fatigue, setFatigue] = useState(5);
  const [notes, setNotes] = useState("");

  // Auto-derive a daily_form score so the coach gets a single index.
  // Lower stress/fatigue → higher form. Range: 1..10.
  const dailyForm = Math.max(
    1,
    Math.min(10, Math.round(11 - (workStress + lifeStress + fatigue) / 3)),
  );

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = surveySchema.parse({
        bodyweight_kg: bodyweight ? Number(bodyweight) : undefined,
        sleep_hours: sleep ? Number(sleep) : undefined,
        work_stress: workStress,
        life_stress: lifeStress,
        fatigue,
        notes: notes || undefined,
        daily_form: dailyForm,
      });
      const { error } = await supabase.from("readiness_surveys").insert({
        athlete_id: athleteId,
        date: dateStr,
        bodyweight_kg: parsed.bodyweight_kg ?? null,
        sleep_hours: parsed.sleep_hours ?? null,
        work_stress: parsed.work_stress,
        life_stress: parsed.life_stress,
        fatigue: parsed.fatigue,
        notes: parsed.notes ?? null,
        daily_form: parsed.daily_form,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Form recorded — let's train");
      queryClient.invalidateQueries({
        queryKey: ["readiness-survey", athleteId, dateStr],
      });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Daily readiness check
        </CardTitle>
        <CardDescription>
          Quick survey to estimate today's form before you start lifting.
          Bodyweight is optional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="bw">Bodyweight (kg, optional)</Label>
            <Input
              id="bw"
              type="number"
              min={20}
              max={400}
              step={0.1}
              value={bodyweight}
              onChange={(e) => setBodyweight(e.target.value)}
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sl">Sleep (hours, optional)</Label>
            <Input
              id="sl"
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
              placeholder="—"
            />
          </div>
        </div>

        <Slider10
          label="Work stress"
          help="1 = calm, 10 = overwhelmed"
          value={workStress}
          onChange={setWorkStress}
        />
        <Slider10
          label="Life stress"
          help="1 = serene, 10 = chaotic"
          value={lifeStress}
          onChange={setLifeStress}
        />
        <Slider10
          label="Fatigue"
          help="1 = fresh, 10 = wrecked"
          value={fatigue}
          onChange={setFatigue}
        />

        <div className="space-y-1">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Anything your coach should know"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-readiness-tint p-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Estimated daily form
            </div>
            <div className="text-2xl font-bold">{dailyForm}/10</div>
          </div>
          <Button
            size="lg"
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
          >
            <Save className="mr-1 h-4 w-4" />
            {submit.isPending ? "Saving…" : "Submit & start"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Slider10({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{help}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <span className="w-8 text-center text-sm font-bold">{value}</span>
      </div>
    </div>
  );
}
