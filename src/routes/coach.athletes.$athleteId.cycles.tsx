import { createFileRoute, Link, Outlet, useParams, useChildMatches } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, parseISO, addWeeks, differenceInCalendarDays, addDays } from "date-fns";
import { Plus, Calendar, ArrowRight, Trash2, Copy } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GenerateMarathonPlanDialog } from "@/components/GenerateMarathonPlanDialog";

export const Route = createFileRoute("/coach/athletes/$athleteId/cycles")({
  head: () => ({
    meta: [
      { title: "Mesocycles — EA Training System Coach" },
      {
        name: "description",
        content:
          "Build mesocycles week by week and publish microcycles to your athlete.",
      },
    ],
  }),
  component: CyclesListPage,
});

const mesoSchema = z.object({
  name: z.string().trim().min(1).max(80),
  goal: z.string().trim().max(200).optional().or(z.literal("")),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_weeks: z.number().int().min(1).max(24),
  days_per_week: z.number().int().min(2).max(6),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

interface Mesocycle {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  total_weeks: number;
  days_per_week: number;
  status: "draft" | "active" | "archived";
  notes: string | null;
}

function CyclesListPage() {
  const { athleteId } = useParams({
    from: "/coach/athletes/$athleteId/cycles",
  });
  const { user } = useAuth();
  const userId = user!.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const childMatches = useChildMatches();

  const profileQuery = useQuery({
    queryKey: ["athlete-profile", athleteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, ten_k_pb_seconds")
        .eq("id", athleteId)
        .maybeSingle();
      return data;
    },
  });

  const cyclesQuery = useQuery({
    queryKey: ["mesocycles", athleteId],
    queryFn: async (): Promise<Mesocycle[]> => {
      const { data, error } = await supabase
        .from("mesocycles")
        .select("id, name, goal, start_date, total_weeks, days_per_week, status, notes")
        .eq("athlete_id", athleteId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Mesocycle[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: z.infer<typeof mesoSchema>) => {
      const parsed = mesoSchema.parse(input);
      const { error } = await supabase.from("mesocycles").insert({
        coach_id: userId,
        athlete_id: athleteId,
        name: parsed.name,
        goal: parsed.goal || null,
        start_date: parsed.start_date,
        total_weeks: parsed.total_weeks,
        days_per_week: parsed.days_per_week,
        notes: parsed.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mesocycle created");
      qc.invalidateQueries({ queryKey: ["mesocycles", athleteId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mesocycles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mesocycle deleted");
      qc.invalidateQueries({ queryKey: ["mesocycles", athleteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (input: { source: Mesocycle; newName: string; newStartDate: string }) => {
      const { source, newName, newStartDate } = input;
      const dayShift = differenceInCalendarDays(parseISO(newStartDate), parseISO(source.start_date));

      // 1. New mesocycle
      const { data: newMeso, error: mErr } = await supabase
        .from("mesocycles")
        .insert({
          coach_id: userId,
          athlete_id: athleteId,
          name: newName,
          goal: source.goal,
          start_date: newStartDate,
          total_weeks: source.total_weeks,
          days_per_week: source.days_per_week,
          notes: source.notes,
        })
        .select("id")
        .single();
      if (mErr) throw mErr;

      // 2. Source week_plans
      const { data: srcWeeks, error: wErr } = await supabase
        .from("week_plans")
        .select("id, week_index, week_start_date")
        .eq("mesocycle_id", source.id)
        .order("week_index", { ascending: true });
      if (wErr) throw wErr;

      const weekIdMap = new Map<string, string>();
      if (srcWeeks && srcWeeks.length) {
        const weekRows = srcWeeks.map((w) => ({
          coach_id: userId,
          athlete_id: athleteId,
          mesocycle_id: newMeso.id,
          week_index: w.week_index,
          week_start_date: format(addDays(parseISO(w.week_start_date), dayShift), "yyyy-MM-dd"),
          status: "draft" as const,
        }));
        const { data: newWeeks, error: nwErr } = await supabase
          .from("week_plans")
          .insert(weekRows)
          .select("id, week_index");
        if (nwErr) throw nwErr;
        for (const sw of srcWeeks) {
          const match = newWeeks?.find((nw) => nw.week_index === sw.week_index);
          if (match) weekIdMap.set(sw.id, match.id);
        }

        // 3. Sessions for these weeks
        const { data: srcSessions, error: sErr } = await supabase
          .from("planned_sessions")
          .select("id, week_plan_id, day_of_week, title, notes")
          .in("week_plan_id", srcWeeks.map((w) => w.id));
        if (sErr) throw sErr;

        const sessionIdMap = new Map<string, string>();
        if (srcSessions && srcSessions.length) {
          // Insert one by one to map old→new ids
          for (const s of srcSessions) {
            const newWeekId = weekIdMap.get(s.week_plan_id);
            if (!newWeekId) continue;
            const { data: ns, error: nsErr } = await supabase
              .from("planned_sessions")
              .insert({
                week_plan_id: newWeekId,
                day_of_week: s.day_of_week,
                title: s.title,
                notes: s.notes,
              })
              .select("id")
              .single();
            if (nsErr) throw nsErr;
            sessionIdMap.set(s.id, ns.id);
          }

          // 4. Planned exercises
          const { data: srcExes, error: eErr } = await supabase
            .from("planned_exercises")
            .select("planned_session_id, exercise_id, exercise, variation, target_sets, target_reps, target_rpe, target_rir, intensity_metric, target_weight_kg, lengthened_partials, last_set_to_failure, notes, order_index")
            .in("planned_session_id", srcSessions.map((s) => s.id));
          if (eErr) throw eErr;
          if (srcExes && srcExes.length) {
            const exRows = srcExes
              .map((e) => {
                const newSid = sessionIdMap.get(e.planned_session_id);
                if (!newSid) return null;
                return { ...e, planned_session_id: newSid };
              })
              .filter((x): x is NonNullable<typeof x> => !!x);
            if (exRows.length) {
              const { error: ieErr } = await supabase.from("planned_exercises").insert(exRows);
              if (ieErr) throw ieErr;
            }
          }
        }
      }

      // 5. Endurance sessions in the date range of source meso
      const srcEnd = format(addWeeks(parseISO(source.start_date), source.total_weeks), "yyyy-MM-dd");
      const { data: srcEndSess, error: esErr } = await supabase
        .from("endurance_sessions")
        .select("id, date, discipline, mode, title, planned_total_seconds, planned_avg_rpe, notes")
        .eq("athlete_id", athleteId)
        .gte("date", source.start_date)
        .lt("date", srcEnd)
        .eq("status", "planned");
      if (esErr) throw esErr;

      if (srcEndSess && srcEndSess.length) {
        const endSessionIdMap = new Map<string, string>();
        for (const s of srcEndSess) {
          const { data: ns, error: insErr } = await supabase
            .from("endurance_sessions")
            .insert({
              athlete_id: athleteId,
              coach_id: userId,
              date: format(addDays(parseISO(s.date), dayShift), "yyyy-MM-dd"),
              discipline: s.discipline,
              mode: s.mode,
              title: s.title,
              planned_total_seconds: s.planned_total_seconds,
              planned_avg_rpe: s.planned_avg_rpe,
              notes: s.notes,
              status: "planned",
            })
            .select("id")
            .single();
          if (insErr) throw insErr;
          endSessionIdMap.set(s.id, ns.id);
        }

        // Endurance steps (two passes for parent_id remap)
        const { data: srcSteps, error: stErr } = await supabase
          .from("endurance_steps")
          .select("id, session_id, parent_id, order_index, is_group, repeat_count, discipline, duration_seconds, target_rpe, target_pace_seconds_per_km, target_hr_bpm, notes")
          .in("session_id", srcEndSess.map((s) => s.id))
          .order("order_index", { ascending: true });
        if (stErr) throw stErr;

        if (srcSteps && srcSteps.length) {
          const stepIdMap = new Map<string, string>();
          // Pass 1: top-level
          const tops = srcSteps.filter((st) => !st.parent_id);
          for (const st of tops) {
            const newSid = endSessionIdMap.get(st.session_id);
            if (!newSid) continue;
            const { data: ns, error: e } = await supabase
              .from("endurance_steps")
              .insert({
                session_id: newSid,
                parent_id: null,
                order_index: st.order_index,
                is_group: st.is_group,
                repeat_count: st.repeat_count,
                discipline: st.discipline,
                duration_seconds: st.duration_seconds,
                target_rpe: st.target_rpe,
                target_pace_seconds_per_km: st.target_pace_seconds_per_km,
                target_hr_bpm: st.target_hr_bpm,
                notes: st.notes,
              })
              .select("id")
              .single();
            if (e) throw e;
            stepIdMap.set(st.id, ns.id);
          }
          // Pass 2: children
          const children = srcSteps.filter((st) => st.parent_id);
          for (const st of children) {
            const newSid = endSessionIdMap.get(st.session_id);
            const newParentId = st.parent_id ? stepIdMap.get(st.parent_id) : null;
            if (!newSid) continue;
            const { error: e } = await supabase.from("endurance_steps").insert({
              session_id: newSid,
              parent_id: newParentId ?? null,
              order_index: st.order_index,
              is_group: st.is_group,
              repeat_count: st.repeat_count,
              discipline: st.discipline,
              duration_seconds: st.duration_seconds,
              target_rpe: st.target_rpe,
              target_pace_seconds_per_km: st.target_pace_seconds_per_km,
              target_hr_bpm: st.target_hr_bpm,
              notes: st.notes,
            });
            if (e) throw e;
          }
        }
      }

      return newMeso.id;
    },
    onSuccess: () => {
      toast.success("Mesocycle duplicated");
      qc.invalidateQueries({ queryKey: ["mesocycles", athleteId] });
      qc.invalidateQueries({ queryKey: ["athlete-endurance"] });
      qc.invalidateQueries({ queryKey: ["week-endurance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (childMatches.length > 0) {
    return <Outlet />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link
              to="/coach/athletes/$athleteId"
              params={{ athleteId }}
            >
              ← Back
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            Mesocycles · {profileQuery.data?.full_name ?? "Athlete"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan a multi-week block, then publish 1–2 weeks at a time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GenerateMarathonPlanDialog
            athleteId={athleteId}
            coachId={userId}
            athleteName={profileQuery.data?.full_name ?? "Athlete"}
            athletePb10k={profileQuery.data?.ten_k_pb_seconds ?? null}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> New mesocycle
              </Button>
            </DialogTrigger>
            <NewMesoDialog
              onSubmit={(v) => createMutation.mutate(v)}
              saving={createMutation.isPending}
            />
          </Dialog>
        </div>
      </div>

      {cyclesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (cyclesQuery.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No mesocycles yet. Create the athlete's first block to start planning.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {cyclesQuery.data!.map((m) => (
            <Card key={m.id} className="transition-colors hover:border-primary/50">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {m.name}
                      <Badge
                        variant={m.status === "active" ? "default" : "outline"}
                        className="text-xs capitalize"
                      >
                        {m.status}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {m.goal || "No specific goal set"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <DuplicateMesoButton
                      source={m}
                      onDuplicate={(name, date) =>
                        duplicateMutation.mutate({ source: m, newName: name, newStartDate: date })
                      }
                      saving={duplicateMutation.isPending}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Delete "${m.name}" and all its weeks?`))
                          deleteMutation.mutate(m.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(parseISO(m.start_date), "MMM d, yyyy")}
                  </span>
                  <span>{m.total_weeks} wk</span>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    to="/coach/athletes/$athleteId/cycles/$cycleId"
                    params={{ athleteId, cycleId: m.id }}
                  >
                    Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewMesoDialog({
  onSubmit,
  saving,
}: {
  onSubmit: (v: z.infer<typeof mesoSchema>) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [weeks, setWeeks] = useState("4");
  const [daysPerWeek, setDaysPerWeek] = useState("4");
  const [notes, setNotes] = useState("");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New mesocycle</DialogTitle>
        <DialogDescription>
          A mesocycle holds N microcycles (weeks). Publish weeks individually as the
          athlete is ready for them.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hypertrophy block 1"
          />
        </div>
        <div>
          <Label>Goal (optional)</Label>
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Build squat volume base"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Start date (Mon)</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Total weeks</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
            />
          </div>
          <div>
            <Label>Days / week</Label>
            <Input
              type="number"
              min={2}
              max={6}
              value={daysPerWeek}
              onChange={(e) => setDaysPerWeek(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              name,
              goal,
              start_date: startDate,
              total_weeks: parseInt(weeks, 10) || 4,
              days_per_week: Math.min(6, Math.max(2, parseInt(daysPerWeek, 10) || 4)),
              notes,
            })
          }
          disabled={saving || !name.trim()}
        >
          {saving ? "Creating…" : "Create mesocycle"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
