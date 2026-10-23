import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { RoutineLauncher } from "@/components/RoutinePlayer";

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
  const { t } = useTranslation();
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
          {t("readiness.loading")}
        </CardContent>
      </Card>
    );
  }

  if (!surveyQuery.data) {
    return <ReadinessSurveyForm athleteId={athleteId} dateStr={dateStr} />;
  }

  return (
    <RoutineGate athleteId={athleteId} dateStr={dateStr} survey={surveyQuery.data}>
      {children}
    </RoutineGate>
  );
}

/**
 * After the readiness survey, the athlete must actively choose a routine
 * or skip it before today's training program is shown. The choice is
 * remembered per day in localStorage.
 */
function RoutineGate({
  athleteId,
  dateStr,
  survey,
  children,
}: {
  athleteId: string;
  dateStr: string;
  survey: ReadinessSurvey;
  children: React.ReactNode;
}) {
  const key = `ea-routine-gate-${athleteId}-${dateStr}`;
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) !== null) {
        setResolved(true);
        return;
      }
    } catch {
      /* ignore */
    }
    // Ny enhet eller rensad lagring: kolla databasen så valet inte efterfrågas igen.
    let cancelled = false;
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(start.getTime() + 864e5);
    supabase
      .from("routine_completions")
      .select("id")
      .eq("athlete_id", athleteId)
      .gte("completed_at", start.toISOString())
      .lt("completed_at", end.toISOString())
      .limit(1)
      .then(({ data }) => {
        if (!cancelled && data && data.length > 0) setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, athleteId, dateStr]);

  const resolve = (value: "done" | "skipped") => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
    setResolved(true);
  };

  return (
    <div className="space-y-4">
      <ReadinessSummary survey={survey} athleteId={athleteId} />
      {resolved ? (
        children
      ) : (
        <RoutineLauncher
          athleteId={athleteId}
          onComplete={() => resolve("done")}
          onSkip={() => resolve("skipped")}
        />
      )}
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
  const { t } = useTranslation();
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
      toast.success(t("readiness.reset"));
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
            {t("readiness.summary")}
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
          <Stat label={t("readiness.work")} value={survey.work_stress} />
          <Stat label={t("readiness.life")} value={survey.life_stress} />
          <Stat label={t("readiness.fatigue")} value={survey.fatigue} />
          {survey.sleep_quality !== null && (
            <Stat label={t("readiness.sleepQ")} value={survey.sleep_quality} />
          )}
          {survey.nutrition !== null && (
            <Stat label={t("readiness.nutrition")} value={survey.nutrition} />
          )}
          {survey.stiffness !== null && (
            <Stat label={t("readiness.stiffness")} value={survey.stiffness} />
          )}
          {survey.bodyweight_kg !== null && (
            <Stat label={t("readiness.bodyweight")} value={`${survey.bodyweight_kg} kg`} />
          )}
          {survey.sleep_hours !== null && (
            <Stat label={t("readiness.sleep")} value={`${survey.sleep_hours}h`} />
          )}
        </div>
        {survey.notes && (
          <p className="rounded bg-muted/40 px-2 py-1.5">{survey.notes}</p>
        )}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs text-muted-foreground"
          onClick={() => reset.mutate()}
          disabled={reset.isPending}
        >
          {t("readiness.retake")}
        </Button>
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [bodyweight, setBodyweight] = useState<string>("");
  const [sleep, setSleep] = useState<string>("");
  const [workStress, setWorkStress] = useState(5);
  const [lifeStress, setLifeStress] = useState(5);
  const [fatigue, setFatigue] = useState(5);
  const [sleepQuality, setSleepQuality] = useState(5);
  const [nutrition, setNutrition] = useState(5);
  const [stiffness, setStiffness] = useState(5);
  // Ömhet/motivation används bara i EAk:s stödsignaler, inte i formpoängen (historiken bevaras).
  const [soreness, setSoreness] = useState(5);
  const [motivation, setMotivation] = useState(5);
  const [notes, setNotes] = useState("");

  // Auto-derive a daily_form score so the coach gets a single index.
  // Combine stress, fatigue, stiffness (lower is better) with sleep & nutrition (higher is better).
  const dailyForm = Math.max(
    1,
    Math.min(
      10,
      Math.round(
        (
          (11 - workStress) +
          (11 - lifeStress) +
          (11 - fatigue) +
          (11 - stiffness) +
          sleepQuality +
          nutrition
        ) / 6,
      ),
    ),
  );

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = surveySchema.parse({
        bodyweight_kg: bodyweight ? Number(bodyweight) : undefined,
        sleep_hours: sleep ? Number(sleep) : undefined,
        work_stress: workStress,
        life_stress: lifeStress,
        fatigue,
        sleep_quality: sleepQuality,
        nutrition,
        stiffness,
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
        sleep_quality: parsed.sleep_quality,
        nutrition: parsed.nutrition,
        stiffness: parsed.stiffness,
        soreness,
        motivation,
        notes: parsed.notes ?? null,
        daily_form: parsed.daily_form,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("readiness.saved"));
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
          {t("readiness.title")}
        </CardTitle>
        <CardDescription>
          {t("readiness.desc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="rounded border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{t("readiness.guideTitle")}</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
            {[0, 1, 2, 3].map((i) => <li key={i}>{t(`readiness.guide.${i}`)}</li>)}
          </ul>
          <h3 className="mb-2 mt-4 font-medium">{t("readiness.examplesTitle")}</h3>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {[0, 1, 2].map((i) => <li key={i}>{t(`readiness.examples.${i}`)}</li>)}
          </ul>
        </details>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="bw">{t("readiness.bw")}</Label>
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
            <Label htmlFor="sl">{t("readiness.sleepH")}</Label>
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
          label={t("readiness.work")}
          help={t("readiness.workHelp")}
          scaleKey="work"
          value={workStress}
          onChange={setWorkStress}
        />
        <Slider10
          label={t("readiness.life")}
          help={t("readiness.lifeHelp")}
          scaleKey="life"
          value={lifeStress}
          onChange={setLifeStress}
        />
        <Slider10
          label={t("readiness.fatigue")}
          help={t("readiness.fatigueHelp")}
          scaleKey="fatigue"
          value={fatigue}
          onChange={setFatigue}
        />
        <Slider10
          label={t("readiness.sleepQ")}
          help={t("readiness.sleepQHelp")}
          scaleKey="sleepQ"
          value={sleepQuality}
          onChange={setSleepQuality}
        />
        <Slider10
          label={t("readiness.nutrition")}
          help={t("readiness.nutritionHelp")}
          scaleKey="nutrition"
          value={nutrition}
          onChange={setNutrition}
        />
        <Slider10
          label={t("readiness.stiffness")}
          help={t("readiness.stiffnessHelp")}
          scaleKey="stiffness"
          value={stiffness}
          onChange={setStiffness}
        />
        <Slider10
          label={t("readiness.soreness")}
          help={t("readiness.sorenessHelp")}
          scaleKey="soreness"
          value={soreness}
          onChange={setSoreness}
        />
        <Slider10
          label={t("readiness.motivation")}
          help={t("readiness.motivationHelp")}
          scaleKey="motivation"
          value={motivation}
          onChange={setMotivation}
        />


        <div className="space-y-1">
          <Label htmlFor="notes">{t("readiness.notes")}</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={t("readiness.notesPh")}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-readiness-tint p-3">
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              {t("readiness.est")}
            </div>
            <div className="text-2xl font-bold">{dailyForm}/10</div>
          </div>
          <Button
            size="lg"
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
          >
            <Save className="mr-1 h-4 w-4" />
            {submit.isPending ? t("readiness.saving") : t("readiness.submit")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Slider10({
  label,
  help,
  scaleKey,
  value,
  onChange,
}: {
  label: string;
  help: string;
  scaleKey: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{help}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label={label}
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <span className="w-8 text-center text-sm font-bold">{value}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground" aria-live="polite">
        <span className="font-semibold text-foreground">{value}/10:</span> {t(`readiness.grades.${scaleKey}.${value - 1}`)}
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer py-1 font-medium text-muted-foreground">{t("readiness.gradesTitle")}</summary>
        <p className="my-2 leading-relaxed text-muted-foreground">{t("readiness.gradesNote")}</p>
        {["stiffness", "sleepQ", "nutrition"].includes(scaleKey) && <p className="mb-2 leading-relaxed text-muted-foreground">{t(`readiness.${scaleKey}Note`)}</p>}
        <ol className="space-y-2 border-l border-border pl-3">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className={cn("flex gap-2 leading-relaxed", value === i + 1 ? "font-medium text-foreground" : "text-muted-foreground")}>
              <span className="w-10 shrink-0 tabular-nums">{i + 1}/10</span><span>{t(`readiness.grades.${scaleKey}.${i}`)}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
