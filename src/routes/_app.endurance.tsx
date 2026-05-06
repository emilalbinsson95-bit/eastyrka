import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Footprints, Bike, Waves, Activity, ChevronRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EnduranceSessionEditor } from "@/components/EnduranceSessionEditor";
import { DISCIPLINES, type Discipline, type Mode, formatDuration, disciplineEmoji } from "@/lib/endurance";
import { sessionDrift, driftBadgeClasses } from "@/components/EnduranceSummary";

export const Route = createFileRoute("/_app/endurance")({
  component: EndurancePage,
  head: () => ({
    meta: [{ title: "Endurance — RPE-based training" }],
  }),
});

function EndurancePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["endurance-sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_sessions")
        .select("id, date, discipline, mode, title, planned_total_seconds, planned_avg_rpe, actual_total_seconds, overall_rpe, peak_rpe, status")
        .eq("athlete_id", user!.id)
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createSession = useMutation({
    mutationFn: async (opts: { discipline: Discipline; mode: Mode }) => {
      const { data, error } = await supabase.from("endurance_sessions").insert({
        athlete_id: user!.id,
        date: format(new Date(), "yyyy-MM-dd"),
        discipline: opts.discipline,
        mode: opts.mode,
        title: opts.mode === "structured" ? "New interval workout" : "Easy session",
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["endurance-sessions", user?.id] });
      setOpenId(id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (openId) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["endurance-sessions", user?.id] }); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to endurance log
        </Button>
        <EnduranceSessionEditor sessionId={openId} canEditPlan isAthlete onClose={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["endurance-sessions", user?.id] }); }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Endurance training
          </CardTitle>
          <CardDescription>RPE-based runs, rides and swims. No GPS or pace targets — just time and effort.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Quick log</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DISCIPLINES.map((d) => (
                <Button key={d.value} variant="outline" size="sm" className="justify-start"
                  onClick={() => createSession.mutate({ discipline: d.value, mode: "quick" })}>
                  <span className="mr-2">{d.emoji}</span> {d.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-muted-foreground">Build a structured workout</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DISCIPLINES.filter((d) => d.value !== "other").map((d) => (
                <Button key={d.value} size="sm"
                  onClick={() => createSession.mutate({ discipline: d.value, mode: "structured" })}>
                  <Plus className="mr-1 h-3 w-3" /> {d.emoji} {d.label} intervals
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!list.isLoading && (list.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No endurance sessions yet — log one above.</p>
          )}
          {(list.data ?? []).map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenId(s.id)}
              className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{disciplineEmoji(s.discipline as Discipline)}</span>
                <div>
                  <div className="font-medium text-sm">{s.title || "Session"}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(s.date), "EEE MMM d")} · {s.mode === "structured" ? "Intervals" : "Quick"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {s.actual_total_seconds ? (
                  <Badge variant="secondary">Done · {formatDuration(s.actual_total_seconds)}</Badge>
                ) : (
                  <Badge>Planned {formatDuration(s.planned_total_seconds)}</Badge>
                )}
                {s.overall_rpe != null && <Badge variant="outline">RPE {s.overall_rpe}</Badge>}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
