import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Trash2, Save, ChevronUp, ChevronDown, Repeat, Bike, Waves, Footprints, Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DISCIPLINES, type Discipline, type Mode, type StepInput,
  formatDuration, parseHMS, totalPlannedSeconds, avgTargetRpe, rpeTone, rpeLabel, disciplineEmoji,
} from "@/lib/endurance";

const disciplineIcon = (d: Discipline | null | undefined) =>
  d === "run" ? <Footprints className="h-4 w-4" /> :
  d === "bike" ? <Bike className="h-4 w-4" /> :
  d === "swim" ? <Waves className="h-4 w-4" /> :
  <Activity className="h-4 w-4" />;

interface SessionRow {
  id: string;
  athlete_id: string;
  coach_id: string | null;
  date: string;
  discipline: Discipline;
  mode: Mode;
  title: string | null;
  planned_total_seconds: number | null;
  planned_avg_rpe: number | null;
  actual_total_seconds: number | null;
  peak_rpe: number | null;
  overall_rpe: number | null;
  notes: string | null;
  status: string;
}

interface StepRow extends StepInput {
  id: string;
  session_id: string;
}

export function EnduranceSessionEditor({
  sessionId,
  canEditPlan,
  isAthlete,
  onClose,
}: {
  sessionId: string;
  /** Coach (or session owner) can change the planned structure. */
  canEditPlan: boolean;
  /** Athlete view enables actual-time + RPE logging. */
  isAthlete: boolean;
  onClose?: () => void;
}) {
  const qc = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["endurance-session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data as SessionRow | null;
    },
  });

  const stepsQuery = useQuery({
    queryKey: ["endurance-steps", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_steps")
        .select("*")
        .eq("session_id", sessionId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StepRow[];
    },
  });

  const session = sessionQuery.data;

  if (sessionQuery.isLoading) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">Loading…</CardContent></Card>;
  }
  if (!session) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">Session not found.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <SessionHeader
        session={session}
        canEditPlan={canEditPlan}
        onChange={() => qc.invalidateQueries({ queryKey: ["endurance-session", sessionId] })}
        onClose={onClose}
      />
      {session.mode === "structured" && (
        <StepsEditor
          sessionId={sessionId}
          steps={stepsQuery.data ?? []}
          canEditPlan={canEditPlan}
          defaultDiscipline={session.discipline}
          onChange={() => {
            qc.invalidateQueries({ queryKey: ["endurance-steps", sessionId] });
            qc.invalidateQueries({ queryKey: ["endurance-session", sessionId] });
          }}
        />
      )}
      {isAthlete && <ActualLogger session={session} onChange={() =>
        qc.invalidateQueries({ queryKey: ["endurance-session", sessionId] })} />}
    </div>
  );
}

// ---------- Session header (title, discipline, mode, date) ----------

function SessionHeader({
  session, canEditPlan, onChange, onClose,
}: {
  session: SessionRow;
  canEditPlan: boolean;
  onChange: () => void;
  onClose?: () => void;
}) {
  const [title, setTitle] = useState(session.title ?? "");
  const [date, setDate] = useState(session.date);
  const [discipline, setDiscipline] = useState<Discipline>(session.discipline);
  const mode = session.mode;
  const [plannedAvgRpe, setPlannedAvgRpe] = useState<string>(session.planned_avg_rpe?.toString() ?? "");
  const [plannedH, setPlannedH] = useState("");
  const [plannedM, setPlannedM] = useState("");

  // Initialize quick-mode planned duration inputs from seconds
  useEffect(() => {
    if (session.mode === "quick" && session.planned_total_seconds != null) {
      setPlannedH(String(Math.floor(session.planned_total_seconds / 3600)));
      setPlannedM(String(Math.floor((session.planned_total_seconds % 3600) / 60)));
    }
  }, [session.mode, session.planned_total_seconds]);

  const setMode = useMutation({
    mutationFn: async (next: Mode) => {
      // When switching to structured, drop quick-mode planned totals so they
      // get recomputed from steps. When switching to quick, leave them.
      const patch: Record<string, unknown> = { mode: next };
      if (next === "structured") {
        patch.planned_total_seconds = null;
        patch.planned_avg_rpe = null;
      }
      const { error } = await supabase.from("endurance_sessions").update(patch).eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => onChange(),
    onError: (e) => toast.error((e as Error).message),
  });

  const save = useMutation({
    mutationFn: async () => {
      const planned_total_seconds = mode === "quick"
        ? parseHMS(plannedH || "0", plannedM || "0", "0") || null
        : session.planned_total_seconds;
      const planned_avg_rpe = mode === "quick" && plannedAvgRpe
        ? Number(plannedAvgRpe) : (mode === "quick" ? null : session.planned_avg_rpe);
      const { error } = await supabase
        .from("endurance_sessions")
        .update({
          title: title || null, date, discipline,
          planned_total_seconds, planned_avg_rpe,
        })
        .eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); onChange(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("endurance_sessions").delete().eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); onClose?.(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {disciplineIcon(discipline)}
            {title || "Untitled session"}
          </CardTitle>
          {canEditPlan && (
            <Button variant="ghost" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardDescription>{formatDuration(session.planned_total_seconds)} planned · RPE-based</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canEditPlan ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tempo intervals" />
              </div>
              <div className="space-y-1">
                <Label>Discipline</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={discipline}
                  onChange={(e) => setDiscipline(e.target.value as Discipline)}
                >
                  {DISCIPLINES.map((d) => (
                    <option key={d.value} value={d.value}>{d.emoji} {d.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="quick">Quick (single block)</TabsTrigger>
                <TabsTrigger value="structured">Structured (intervals)</TabsTrigger>
              </TabsList>
              <TabsContent value="quick" className="mt-3 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label>Planned hours</Label>
                    <Input type="number" min={0} value={plannedH} onChange={(e) => setPlannedH(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Planned minutes</Label>
                    <Input type="number" min={0} max={59} value={plannedM} onChange={(e) => setPlannedM(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Target RPE (1–10)</Label>
                    <Input type="number" min={1} max={10} step={0.5} value={plannedAvgRpe}
                      onChange={(e) => setPlannedAvgRpe(e.target.value)} />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="structured" className="mt-3 text-sm text-muted-foreground">
                Build the workout step-by-step below. Each step has discipline, duration and target RPE; group steps to repeat them.
              </TabsContent>
            </Tabs>

            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
                <Save className="mr-1 h-4 w-4" /> Save plan
              </Button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Date" value={session.date} />
            <Stat label="Discipline" value={`${disciplineEmoji(session.discipline)} ${session.discipline}`} />
            <Stat label="Planned" value={formatDuration(session.planned_total_seconds)} />
            <Stat label="Target RPE" value={session.planned_avg_rpe?.toString() ?? "—"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

// ---------- Steps editor (structured mode) ----------

function StepsEditor({
  sessionId, steps, canEditPlan, defaultDiscipline, onChange,
}: {
  sessionId: string;
  steps: StepRow[];
  canEditPlan: boolean;
  defaultDiscipline: Discipline;
  onChange: () => void;
}) {
  const totalSec = useMemo(() => totalPlannedSeconds(steps), [steps]);
  const avgRpe = useMemo(() => avgTargetRpe(steps), [steps]);

  // Cache derived planned total back to session for fast list views
  useEffect(() => {
    void supabase.from("endurance_sessions").update({
      planned_total_seconds: totalSec || null,
      planned_avg_rpe: avgRpe,
    }).eq("id", sessionId);
  }, [sessionId, totalSec, avgRpe]);

  const topLevel = steps.filter((s) => !s.parent_id).sort((a, b) => a.order_index - b.order_index);

  const addStep = useMutation({
    mutationFn: async (opts: { is_group: boolean; parent_id: string | null }) => {
      const siblings = steps.filter((s) => (s.parent_id ?? null) === opts.parent_id);
      const order_index = siblings.length;
      const { error } = await supabase.from("endurance_steps").insert({
        session_id: sessionId,
        parent_id: opts.parent_id,
        order_index,
        is_group: opts.is_group,
        repeat_count: opts.is_group ? 4 : 1,
        discipline: opts.is_group ? null : defaultDiscipline,
        duration_seconds: opts.is_group ? null : 300,
        target_rpe: opts.is_group ? null : 6,
      });
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Workout structure</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="secondary">Total {formatDuration(totalSec)}</Badge>
            {avgRpe != null && (
              <Badge variant="secondary">Avg RPE {avgRpe} · {rpeLabel(avgRpe)}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {topLevel.length === 0 && (
          <p className="text-sm text-muted-foreground">No steps yet — add one to start building the workout.</p>
        )}
        {topLevel.map((step) => (
          <StepRowItem
            key={step.id}
            step={step}
            allSteps={steps}
            canEditPlan={canEditPlan}
            defaultDiscipline={defaultDiscipline}
            onChange={onChange}
          />
        ))}
        {canEditPlan && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => addStep.mutate({ is_group: false, parent_id: null })}>
              <Plus className="mr-1 h-4 w-4" /> Add step
            </Button>
            <Button size="sm" variant="outline" onClick={() => addStep.mutate({ is_group: true, parent_id: null })}>
              <Repeat className="mr-1 h-4 w-4" /> Add repeat group
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepRowItem({
  step, allSteps, canEditPlan, defaultDiscipline, onChange, depth = 0,
}: {
  step: StepRow;
  allSteps: StepRow[];
  canEditPlan: boolean;
  defaultDiscipline: Discipline;
  onChange: () => void;
  depth?: number;
}) {
  const update = useMutation({
    mutationFn: async (patch: Partial<StepRow>) => {
      const { error } = await supabase.from("endurance_steps").update(patch).eq("id", step.id);
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("endurance_steps").delete().eq("id", step.id);
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e) => toast.error((e as Error).message),
  });
  const move = useMutation({
    mutationFn: async (dir: -1 | 1) => {
      const siblings = allSteps
        .filter((s) => (s.parent_id ?? null) === (step.parent_id ?? null))
        .sort((a, b) => a.order_index - b.order_index);
      const idx = siblings.findIndex((s) => s.id === step.id);
      const swap = siblings[idx + dir];
      if (!swap) return;
      await supabase.from("endurance_steps").update({ order_index: swap.order_index }).eq("id", step.id);
      await supabase.from("endurance_steps").update({ order_index: step.order_index }).eq("id", swap.id);
    },
    onSuccess: onChange,
  });
  const addChild = useMutation({
    mutationFn: async () => {
      const siblings = allSteps.filter((s) => s.parent_id === step.id);
      const { error } = await supabase.from("endurance_steps").insert({
        session_id: step.session_id,
        parent_id: step.id,
        order_index: siblings.length,
        is_group: false,
        repeat_count: 1,
        discipline: defaultDiscipline,
        duration_seconds: 60,
        target_rpe: 7,
      });
      if (error) throw error;
    },
    onSuccess: onChange,
    onError: (e) => toast.error((e as Error).message),
  });

  // Local input state for duration mm:ss
  const m = step.duration_seconds != null ? Math.floor(step.duration_seconds / 60) : 0;
  const s = step.duration_seconds != null ? step.duration_seconds % 60 : 0;
  const [mm, setMm] = useState(String(m));
  const [ss, setSs] = useState(String(s));
  useEffect(() => { setMm(String(m)); setSs(String(s)); }, [step.duration_seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const children = allSteps.filter((s) => s.parent_id === step.id).sort((a, b) => a.order_index - b.order_index);

  if (step.is_group) {
    return (
      <div className={cn("rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2", depth > 0 && "ml-4")}>
        <div className="flex flex-wrap items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          {canEditPlan ? (
            <>
              <span className="text-sm">Repeat</span>
              <Input
                type="number" min={1} max={99}
                className="h-8 w-16"
                value={step.repeat_count}
                onChange={(e) => update.mutate({ repeat_count: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
              />
              <span className="text-sm">×</span>
            </>
          ) : (
            <span className="text-sm font-medium">Repeat {step.repeat_count}×</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {canEditPlan && (
              <>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move.mutate(-1)}><ChevronUp className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move.mutate(1)}><ChevronDown className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => del.mutate()}><Trash2 className="h-3 w-3" /></Button>
              </>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {children.map((c) => (
            <StepRowItem key={c.id} step={c} allSteps={allSteps} canEditPlan={canEditPlan}
              defaultDiscipline={defaultDiscipline} onChange={onChange} depth={depth + 1} />
          ))}
        </div>
        {canEditPlan && (
          <Button size="sm" variant="outline" className="ml-4" onClick={() => addChild.mutate()}>
            <Plus className="mr-1 h-3 w-3" /> Add step inside
          </Button>
        )}
      </div>
    );
  }

  // Leaf step
  return (
    <div className={cn("rounded-md border border-border bg-card p-2", depth > 0 && "ml-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", rpeTone(step.target_rpe))}>
          RPE {step.target_rpe ?? "—"}
        </span>
        {canEditPlan ? (
          <>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={step.discipline ?? defaultDiscipline}
              onChange={(e) => update.mutate({ discipline: e.target.value as Discipline })}
            >
              {DISCIPLINES.map((d) => (
                <option key={d.value} value={d.value}>{d.emoji} {d.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} className="h-8 w-14" value={mm}
                onChange={(e) => setMm(e.target.value)}
                onBlur={() => update.mutate({ duration_seconds: parseHMS("0", mm, ss) })} />
              <span className="text-xs">m</span>
              <Input type="number" min={0} max={59} className="h-8 w-14" value={ss}
                onChange={(e) => setSs(e.target.value)}
                onBlur={() => update.mutate({ duration_seconds: parseHMS("0", mm, ss) })} />
              <span className="text-xs">s</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs">RPE</span>
              <Input type="number" min={1} max={10} step={0.5} className="h-8 w-16"
                value={step.target_rpe ?? ""}
                onChange={(e) => update.mutate({ target_rpe: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <Input
              className="h-8 min-w-[120px] flex-1 text-xs"
              placeholder="Notes (optional)"
              value={step.notes ?? ""}
              onChange={(e) => update.mutate({ notes: e.target.value || null })}
            />
            <div className="ml-auto flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move.mutate(-1)}><ChevronUp className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move.mutate(1)}><ChevronDown className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => del.mutate()}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-xs">{disciplineEmoji(step.discipline)} {step.discipline}</span>
            <span className="text-xs">{formatDuration(step.duration_seconds)}</span>
            {step.notes && <span className="text-xs text-muted-foreground">— {step.notes}</span>}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Actual logging (athlete) ----------

function ActualLogger({ session, onChange }: { session: SessionRow; onChange: () => void }) {
  const [h, setH] = useState(session.actual_total_seconds ? String(Math.floor(session.actual_total_seconds / 3600)) : "");
  const [m, setM] = useState(session.actual_total_seconds ? String(Math.floor((session.actual_total_seconds % 3600) / 60)) : "");
  const [overall, setOverall] = useState<string>(session.overall_rpe?.toString() ?? "");
  const [peak, setPeak] = useState<string>(session.peak_rpe?.toString() ?? "");
  const [notes, setNotes] = useState(session.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const actual_total_seconds = (h || m) ? parseHMS(h || "0", m || "0", "0") : null;
      const { error } = await supabase.from("endurance_sessions").update({
        actual_total_seconds,
        overall_rpe: overall ? Number(overall) : null,
        peak_rpe: peak ? Number(peak) : null,
        notes: notes || null,
        status: "completed",
      }).eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Logged"); onChange(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Log how it actually went</CardTitle>
        <CardDescription>RPE-based, no GPS or speed required.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label>Actual hours</Label>
            <Input type="number" min={0} value={h} onChange={(e) => setH(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Actual minutes</Label>
            <Input type="number" min={0} max={59} value={m} onChange={(e) => setM(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Overall RPE</Label>
            <Input type="number" min={1} max={10} value={overall} onChange={(e) => setOverall(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Hardest part RPE</Label>
            <Input type="number" min={1} max={10} value={peak} onChange={(e) => setPeak(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>How did it feel?</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Terrain, weather, energy, anything notable…" />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 h-4 w-4" /> Save log
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
