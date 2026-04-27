import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, ChevronRight, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/patient/")({
  head: () => ({
    meta: [
      { title: "My rehab sessions — EA" },
      { name: "description", content: "View your rehab sessions and log how you feel." },
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your rehab sessions</h1>
        <p className="text-sm text-muted-foreground">
          Tap a session to see your prescribed exercises and log how it went.
        </p>
      </div>

      {sessionsQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!sessionsQuery.isLoading && (sessionsQuery.data ?? []).length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> No sessions yet
            </CardTitle>
            <CardDescription>
              Once your physiotherapist creates a session for you, it will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-2">
        {(sessionsQuery.data ?? []).map((s) => (
          <Link
            key={s.id}
            to="/patient/sessions/$sessionId"
            params={{ sessionId: s.id }}
            className="group block"
          >
            <Card className="transition-colors group-hover:border-primary">
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {s.title ?? "Rehab session"}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    {new Date(s.session_date).toLocaleDateString()}
                    {s.overall_pain != null && (
                      <span>· baseline pain {s.overall_pain}/10</span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
                      {s.status}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
