import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, CheckCircle2, Flame, Sparkles, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/patient/")({
  head: () => ({
    meta: [
      { title: "My rehab — EA" },
      { name: "description", content: "Your next rehab session and progress." },
    ],
  }),
  component: PatientHome,
});

function PatientHome() {
  const { user } = useAuth();
  const patientId = user!.id;

  const sessionsQuery = useQuery({
    queryKey: ["patient-sessions", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_sessions")
        .select("id, session_date, title, status, overall_pain")
        .eq("patient_id", patientId)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const feedbackQuery = useQuery({
    queryKey: ["patient-feedback-all", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_session_feedback")
        .select("session_id, created_at, pain_after")
        .eq("patient_id", patientId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sessions = sessionsQuery.data ?? [];
  const feedback = feedbackQuery.data ?? [];
  const doneIds = new Set(feedback.map((f) => f.session_id));

  const today = new Date().toISOString().slice(0, 10);
  // Next = earliest session not yet logged & date <= today, else earliest future, else most recent.
  const upcoming = [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date));
  const nextSession =
    upcoming.find((s) => !doneIds.has(s.id) && s.session_date <= today) ??
    upcoming.find((s) => s.session_date >= today) ??
    sessions[0];

  // Streak: distinct days with feedback, going back from today.
  const doneDays = new Set(
    feedback.map((f) => new Date(f.created_at).toISOString().slice(0, 10)),
  );
  let streak = 0;
  const cursor = new Date();
  while (doneDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const totalDone = feedback.length;
  const totalPlanned = sessions.length;

  const past = sessions.filter((s) => s.id !== nextSession?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hi 👋</h1>
        <p className="text-sm text-muted-foreground">
          Small steps every day add up. Here's what's next.
        </p>
      </div>

      {/* Progress strip */}
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Flame className="h-4 w-4 text-orange-500" />} label="Day streak" value={String(streak)} />
        <Stat icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} label="Sessions done" value={String(totalDone)} />
        <Stat icon={<CalendarDays className="h-4 w-4 text-primary" />} label="Total planned" value={String(totalPlanned)} />
      </div>

      {/* Next session */}
      {nextSession ? (
        <Link
          to="/patient/sessions/$sessionId"
          params={{ sessionId: nextSession.id }}
          className="block"
        >
          <Card className="border-primary/40 bg-primary/5 transition-colors hover:border-primary">
            <CardHeader>
              <CardDescription className="flex items-center gap-1 text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Your next session
              </CardDescription>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="truncate">{nextSession.title ?? "Rehab session"}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {new Date(nextSession.session_date).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <Button className="mt-3 w-full sm:w-auto">Start session</Button>
            </CardContent>
          </Card>
        </Link>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> No sessions yet
            </CardTitle>
            <CardDescription>
              Your physiotherapist will add sessions here for you to follow.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* History */}
      {past.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Earlier sessions</h2>
          <div className="space-y-2">
            {past.map((s) => {
              const done = doneIds.has(s.id);
              return (
                <Link
                  key={s.id}
                  to="/patient/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  className="group block"
                >
                  <Card className="transition-colors group-hover:border-primary">
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {s.title ?? "Rehab session"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.session_date).toLocaleDateString()}
                        </div>
                      </div>
                      {done ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" /> Logged
                        </span>
                      ) : (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          Not logged
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
