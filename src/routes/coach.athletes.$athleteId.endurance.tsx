import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Plus, ChevronRight, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EnduranceSessionEditor } from "@/components/EnduranceSessionEditor";
import { DISCIPLINES, type Discipline, type Mode, formatDuration, disciplineEmoji } from "@/lib/endurance";

export const Route = createFileRoute("/coach/athletes/$athleteId/endurance")({
  component: CoachEndurance,
  head: () => ({
    meta: [{ title: "Athlete endurance — RPE planner" }],
  }),
});

function CoachEndurance() {
  const { athleteId } = useParams({ from: "/coach/athletes/$athleteId/endurance" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["coach-endurance", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_sessions")
        .select("id, date, discipline, mode, title, planned_total_seconds, planned_avg_rpe, actual_total_seconds, overall_rpe, peak_rpe, status")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (opts: { discipline: Discipline; mode: Mode }) => {
      const { data, error } = await supabase.from("endurance_sessions").insert({
        athlete_id: athleteId,
        coach_id: user!.id,
        date: format(new Date(), "yyyy-MM-dd"),
        discipline: opts.discipline,
        mode: opts.mode,
        title: opts.mode === "structured" ? "Interval workout" : "Endurance session",
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["coach-endurance", athleteId] });
      setOpenId(id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (openId) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["coach-endurance", athleteId] }); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <EnduranceSessionEditor sessionId={openId} canEditPlan isAthlete={false}
          onClose={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["coach-endurance", athleteId] }); }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/coach/athletes/$athleteId" params={{ athleteId }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Athlete overview
      </Link>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Plan endurance training
          </CardTitle>
          <CardDescription>RPE-based — no GPS or pace targets. The athlete can edit and log actuals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DISCIPLINES.filter((d) => d.value !== "other").map((d) => (
              <Button key={d.value} size="sm"
                onClick={() => create.mutate({ discipline: d.value, mode: "structured" })}>
                <Plus className="mr-1 h-3 w-3" /> {d.emoji} {d.label} intervals
              </Button>
            ))}
            {DISCIPLINES.map((d) => (
              <Button key={`q-${d.value}`} size="sm" variant="outline"
                onClick={() => create.mutate({ discipline: d.value, mode: "quick" })}>
                {d.emoji} {d.label} quick
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!list.isLoading && (list.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No endurance sessions yet.</p>
          )}
          {(list.data ?? []).map((s) => (
            <button key={s.id} onClick={() => setOpenId(s.id)}
              className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent">
              <div className="flex items-center gap-3">
                <span className="text-xl">{disciplineEmoji(s.discipline as Discipline)}</span>
                <div>
                  <div className="text-sm font-medium">{s.title || "Session"}</div>
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
                {s.peak_rpe != null && <Badge variant="outline">peak {s.peak_rpe}</Badge>}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
