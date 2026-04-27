import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { z } from "zod";
import { toast } from "sonner";
import { Activity, ArrowRight, CheckCircle2, Sparkles, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome — EA Training System" },
      { name: "description", content: "Quick setup to personalize your training." },
    ],
  }),
  component: OnboardingPage,
});

const STEPS = ["welcome", "profile", "readiness", "done"] as const;
type Step = (typeof STEPS)[number];

function OnboardingPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("welcome");

  // Profile
  const [fullName, setFullName] = useState("");
  const [weightClass, setWeightClass] = useState("");

  // Readiness baseline
  const [bodyweight, setBodyweight] = useState("");
  const [sleep, setSleep] = useState("");
  const [workStress, setWorkStress] = useState(5);
  const [lifeStress, setLifeStress] = useState(5);
  const [fatigue, setFatigue] = useState(5);
  const [notes, setNotes] = useState("");

  const dailyForm = Math.max(
    1,
    Math.min(10, Math.round(11 - (workStress + lifeStress + fatigue) / 3)),
  );

  // Redirect non-athletes / unauthed users away
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role !== "athlete") {
      navigate({ to: "/coach" });
    }
  }, [user, role, loading, navigate]);

  // Pre-fill profile from existing record
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, weight_class")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      setFullName(profileQuery.data.full_name ?? "");
      setWeightClass(profileQuery.data.weight_class ?? "");
    }
  }, [profileQuery.data]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const parsed = z
        .object({
          full_name: z.string().trim().min(1).max(80),
          weight_class: z.string().trim().max(40).optional(),
        })
        .parse({
          full_name: fullName,
          weight_class: weightClass || undefined,
        });
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.full_name,
          weight_class: parsed.weight_class ?? null,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", user!.id] });
      setStep("readiness");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveReadiness = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const parsed = z
        .object({
          bodyweight_kg: z.number().min(20).max(400).optional(),
          sleep_hours: z.number().min(0).max(24).optional(),
          work_stress: z.number().int().min(1).max(10),
          life_stress: z.number().int().min(1).max(10),
          fatigue: z.number().int().min(1).max(10),
          notes: z.string().trim().max(500).optional(),
          daily_form: z.number().int().min(1).max(10),
        })
        .parse({
          bodyweight_kg: bodyweight ? Number(bodyweight) : undefined,
          sleep_hours: sleep ? Number(sleep) : undefined,
          work_stress: workStress,
          life_stress: lifeStress,
          fatigue,
          notes: notes || undefined,
          daily_form: dailyForm,
        });
      const { error } = await supabase.from("readiness_surveys").upsert(
        {
          athlete_id: user!.id,
          date: today,
          bodyweight_kg: parsed.bodyweight_kg ?? null,
          sleep_hours: parsed.sleep_hours ?? null,
          work_stress: parsed.work_stress,
          life_stress: parsed.life_stress,
          fatigue: parsed.fatigue,
          notes: parsed.notes ?? null,
          daily_form: parsed.daily_form,
        },
        { onConflict: "athlete_id,date" } as { onConflict: string },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      // Mark onboarding complete locally so we don't gate again.
      if (typeof window !== "undefined") {
        localStorage.setItem(`ea-onboarded-${user!.id}`, "1");
      }
      setStep("done");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Activity className="h-4 w-4" />
            EA Training System
          </div>
          <Progress value={progress} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>

        {step === "welcome" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Sparkles className="h-6 w-6 text-primary" />
                Welcome aboard
              </CardTitle>
              <CardDescription>
                Let's spend ~2 minutes setting up your profile and recording your first
                readiness baseline so your coach gets accurate signal from day one.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  Confirm your name and weight class
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  Record today's readiness (stress, fatigue, sleep)
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  Jump into your first session
                </li>
              </ul>
              <Button size="lg" className="w-full" onClick={() => setStep("profile")}>
                Get started
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "profile" && (
          <Card>
            <CardHeader>
              <CardTitle>Tell us about you</CardTitle>
              <CardDescription>
                Your coach will see this. You can change it later from the Me tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="fn">Full name</Label>
                <Input
                  id="fn"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Lifter"
                  maxLength={80}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wc">Weight class (optional)</Label>
                <Input
                  id="wc"
                  value={weightClass}
                  onChange={(e) => setWeightClass(e.target.value)}
                  placeholder="e.g. 75kg"
                  maxLength={40}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep("welcome")}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => saveProfile.mutate()}
                  disabled={saveProfile.isPending || !fullName.trim()}
                >
                  Continue
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "readiness" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-primary" />
                Today's readiness baseline
              </CardTitle>
              <CardDescription>
                A quick check-in so your coach can calibrate your starting point.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="bw">Bodyweight (kg)</Label>
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
                  <Label htmlFor="sl">Sleep (hours)</Label>
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

              <Slider10 label="Work stress" help="1 calm · 10 overwhelmed" value={workStress} onChange={setWorkStress} />
              <Slider10 label="Life stress" help="1 serene · 10 chaotic" value={lifeStress} onChange={setLifeStress} />
              <Slider10 label="Fatigue" help="1 fresh · 10 wrecked" value={fatigue} onChange={setFatigue} />

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
                  onClick={() => saveReadiness.mutate()}
                  disabled={saveReadiness.isPending}
                >
                  {saveReadiness.isPending ? "Saving…" : "Finish setup"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <CheckCircle2 className="h-6 w-6 text-primary" />
                You're all set
              </CardTitle>
              <CardDescription>
                Your baseline is recorded. Your coach will now build sessions around your
                readiness. Time to train.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                size="lg"
                className="w-full"
                onClick={() => navigate({ to: "/today" })}
              >
                Go to today's session
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
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
          className={cn("flex-1 accent-primary")}
        />
        <span className="w-8 text-center text-sm font-bold">{value}</span>
      </div>
    </div>
  );
}
