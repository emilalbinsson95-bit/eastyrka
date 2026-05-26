import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Trash2, Save, ChevronUp, ChevronDown, Repeat, Bike, Waves, Footprints, Activity, Sparkles,
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
  paceLabelFromDistance,
} from "@/lib/endurance";
import { estimateForRpe, hasAnyBenchmark, type AthleteBenchmarks } from "@/lib/endurancePaceHr";

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
  predicted_10k_seconds: number | null;
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

  const benchmarksQuery = useQuery({
    queryKey: ["athlete-benchmarks", session?.athlete_id],
    enabled: !!session?.athlete_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("ten_k_pb_seconds, max_hr, resting_hr, ftp_watts, css_per_100m_seconds")
        .eq("id", session!.athlete_id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        ten_k_pb_seconds: null, max_hr: null, resting_hr: null, ftp_watts: null, css_per_100m_seconds: null,
      }) as AthleteBenchmarks;
    },
  });
  const profileBenchmarks: AthleteBenchmarks = benchmarksQuery.data ?? {
    ten_k_pb_seconds: null, max_hr: null, resting_hr: null, ftp_watts: null, css_per_100m_seconds: null,
  };
  // For pace estimates in this session, prefer the session's own predicted 10k
  // (athlete's "feel today") over the all-time PB stored on the profile.
  const benchmarks: AthleteBenchmarks = {
    ...profileBenchmarks,
    ten_k_pb_seconds:
      sessionQuery.data?.predicted_10k_seconds ?? profileBenchmarks.ten_k_pb_seconds,
  };

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
      {session.mode === "quick" && (
        <QuickEstimate discipline={session.discipline} rpe={session.planned_avg_rpe} benchmarks={benchmarks} />
      )}
      {session.mode === "structured" && (
        <StepsEditor
          sessionId={sessionId}
          steps={stepsQuery.data ?? []}
          canEditPlan={canEditPlan}
          canLogActuals={canEditPlan || isAthlete}
          defaultDiscipline={session.discipline}
          benchmarks={benchmarks}
          sessionStatus={session.status}
          onChange={() => {
            qc.invalidateQueries({ queryKey: ["endurance-steps", sessionId] });
            qc.invalidateQueries({ queryKey: ["endurance-session", sessionId] });
          }}
        />
      )}
      {isAthlete && <ActualLogger session={session} steps={stepsQuery.data ?? []} onChange={() =>
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
      const patch: { mode: Mode; planned_total_seconds?: number | null; planned_avg_rpe?: number | null } = { mode: next };
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
      // Promote draft → planned so it surfaces on the calendar
      const patch = {
        title: title || null,
        date,
        discipline,
        planned_total_seconds,
        planned_avg_rpe,
        ...(session.status === "draft" ? { status: "planned" } : {}),
      };
      const { error } = await supabase
        .from("endurance_sessions")
        .update(patch)
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

            <Tabs value={mode} onValueChange={(v) => { if (v !== mode) setMode.mutate(v as Mode); }}>
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
  sessionId, steps, canEditPlan, canLogActuals, defaultDiscipline, benchmarks, sessionStatus, onChange,
}: {
  sessionId: string;
  steps: StepRow[];
  canEditPlan: boolean;
  canLogActuals: boolean;
  defaultDiscipline: Discipline;
  benchmarks: AthleteBenchmarks;
  sessionStatus: string;
  onChange: () => void;
}) {
  const totalSec = useMemo(() => totalPlannedSeconds(steps), [steps]);
  const avgRpe = useMemo(() => avgTargetRpe(steps), [steps]);

  useEffect(() => {
    const patch: { planned_total_seconds: number | null; planned_avg_rpe: number | null; status?: string } = {
      planned_total_seconds: totalSec || null,
      planned_avg_rpe: avgRpe,
    };
    // Promote draft → planned once the structure has real content
    if (sessionStatus === "draft" && totalSec > 0) patch.status = "planned";
    void supabase.from("endurance_sessions").update(patch).eq("id", sessionId);
  }, [sessionId, totalSec, avgRpe, sessionStatus]);

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

  const applyTemplate = useMutation({
    mutationFn: async (tpl: "warmup_main_cool" | "4x4_int" | "tempo20" | "long_easy") => {
      // Wipe existing
      await supabase.from("endurance_steps").delete().eq("session_id", sessionId);
      type Insert = {
        session_id: string; parent_id: string | null; order_index: number; is_group: boolean;
        repeat_count: number; discipline: Discipline | null; duration_seconds: number | null; target_rpe: number | null; notes: string | null;
      };
      const mk = (over: Partial<Insert>): Insert => ({
        session_id: sessionId, parent_id: null, order_index: 0, is_group: false,
        repeat_count: 1, discipline: defaultDiscipline, duration_seconds: 600, target_rpe: 5, notes: null,
        ...over,
      });
      if (tpl === "warmup_main_cool") {
        await supabase.from("endurance_steps").insert([
          mk({ order_index: 0, duration_seconds: 600, target_rpe: 3, notes: "Warm-up" }),
          mk({ order_index: 1, duration_seconds: 1800, target_rpe: 6, notes: "Main" }),
          mk({ order_index: 2, duration_seconds: 600, target_rpe: 2, notes: "Cool-down" }),
        ]);
      } else if (tpl === "tempo20") {
        await supabase.from("endurance_steps").insert([
          mk({ order_index: 0, duration_seconds: 600, target_rpe: 3, notes: "Warm-up" }),
          mk({ order_index: 1, duration_seconds: 1200, target_rpe: 7, notes: "Tempo" }),
          mk({ order_index: 2, duration_seconds: 600, target_rpe: 2, notes: "Cool-down" }),
        ]);
      } else if (tpl === "long_easy") {
        await supabase.from("endurance_steps").insert([
          mk({ order_index: 0, duration_seconds: 3600, target_rpe: 4, notes: "Base / long" }),
        ]);
      } else if (tpl === "4x4_int") {
        const wu = await supabase.from("endurance_steps").insert(
          mk({ order_index: 0, duration_seconds: 600, target_rpe: 3, notes: "Warm-up" }),
        );
        if (wu.error) throw wu.error;
        const grp = await supabase.from("endurance_steps").insert(
          mk({ order_index: 1, is_group: true, repeat_count: 4, discipline: null, duration_seconds: null, target_rpe: null, notes: "4 × (4min hard / 1min easy)" }),
        ).select("id").single();
        if (grp.error) throw grp.error;
        await supabase.from("endurance_steps").insert([
          mk({ parent_id: grp.data.id, order_index: 0, duration_seconds: 240, target_rpe: 8, notes: "Work" }),
          mk({ parent_id: grp.data.id, order_index: 1, duration_seconds: 60, target_rpe: 3, notes: "Recovery" }),
        ]);
        await supabase.from("endurance_steps").insert(
          mk({ order_index: 2, duration_seconds: 600, target_rpe: 2, notes: "Cool-down" }),
        );
      }
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
        {canEditPlan && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground self-center mr-1">
              <Sparkles className="inline h-3 w-3 mr-1" />Templates:
            </span>
            <Button size="sm" variant="outline" onClick={() => applyTemplate.mutate("long_easy")}>Long easy</Button>
            <Button size="sm" variant="outline" onClick={() => applyTemplate.mutate("warmup_main_cool")}>WU / Main / CD</Button>
            <Button size="sm" variant="outline" onClick={() => applyTemplate.mutate("tempo20")}>20min tempo</Button>
            <Button size="sm" variant="outline" onClick={() => applyTemplate.mutate("4x4_int")}>4×4 intervals</Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {topLevel.length === 0 && (
          <p className="text-sm text-muted-foreground">No steps yet — add one or pick a template above.</p>
        )}
        {topLevel.map((step) => (
          <StepRowItem
            key={step.id}
            step={step}
            allSteps={steps}
            canEditPlan={canEditPlan}
            canLogActuals={canLogActuals}
            defaultDiscipline={defaultDiscipline}
            benchmarks={benchmarks}
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
        {!hasAnyBenchmark(benchmarks) && (
          <p className="pt-2 text-[11px] text-muted-foreground">
            Tip: add 10k PB, max HR, FTP or CSS in your profile to see pace and heart-rate estimates per step.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function QuickEstimate({ discipline, rpe, benchmarks }: { discipline: Discipline; rpe: number | null; benchmarks: AthleteBenchmarks }) {
  if (rpe == null || !hasAnyBenchmark(benchmarks)) return null;
  const est = estimateForRpe(discipline, rpe, benchmarks);
  if (!est.paceLabel && !est.hrLabel && !est.wattLabel) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" /> Estimated target (RPE {rpe})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-xs">
        {est.paceLabel && <Badge variant="secondary">{est.paceLabel}</Badge>}
        {est.wattLabel && <Badge variant="secondary">{est.wattLabel}</Badge>}
        {est.hrLabel && <Badge variant="secondary">{est.hrLabel}</Badge>}
      </CardContent>
    </Card>
  );
}

function StepRowItem({
  step, allSteps, canEditPlan, canLogActuals = false, defaultDiscipline, benchmarks, onChange, depth = 0,
}: {
  step: StepRow;
  allSteps: StepRow[];
  canEditPlan: boolean;
  canLogActuals?: boolean;
  defaultDiscipline: Discipline;
  benchmarks: AthleteBenchmarks;
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
            <StepRowItem key={c.id} step={c} allSteps={allSteps} canEditPlan={canEditPlan} canLogActuals={canLogActuals}
              defaultDiscipline={defaultDiscipline} benchmarks={benchmarks} onChange={onChange} depth={depth + 1} />
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
      {(() => {
        const disc = (step.discipline ?? defaultDiscipline) as Discipline;
        const est = estimateForRpe(disc, step.target_rpe ?? null, benchmarks);
        if (!est.paceLabel && !est.hrLabel && !est.wattLabel) return null;
        return (
          <div className="mt-1.5 flex flex-wrap gap-1 pl-1 text-[11px]">
            {est.paceLabel && <Badge variant="outline" className="font-mono">{est.paceLabel}</Badge>}
            {est.wattLabel && <Badge variant="outline" className="font-mono">{est.wattLabel}</Badge>}
            {est.hrLabel && <Badge variant="outline" className="font-mono">{est.hrLabel}</Badge>}
          </div>
        );
      })()}
      {(canEditPlan || canLogActuals) && (() => {
        const parent = step.parent_id ? allSteps.find((p) => p.id === step.parent_id) : null;
        const parentRepeats = parent?.is_group ? parent.repeat_count : 1;
        if (parentRepeats > 1) {
          return (
            <RepActualsList
              stepId={step.id}
              repeatCount={parentRepeats}
              discipline={(step.discipline ?? defaultDiscipline) as Discipline}
              onChange={onChange}
            />
          );
        }
        return <ActualStepInputs step={step} defaultDiscipline={defaultDiscipline} onSaved={onChange} />;
      })()}
    </div>
  );
}

function ActualStepInputs({
  step, defaultDiscipline, onSaved,
}: {
  step: StepRow;
  defaultDiscipline: Discipline;
  onSaved: () => void;
}) {
  const initSec = step.actual_duration_seconds ?? null;
  const [mm, setMm] = useState(initSec != null ? String(Math.floor(initSec / 60)) : "");
  const [ss, setSs] = useState(initSec != null ? String(initSec % 60).padStart(2, "0") : "");
  const [dist, setDist] = useState(step.actual_distance_m != null ? String(step.actual_distance_m) : "");
  const [hr, setHr] = useState(step.actual_avg_hr != null ? String(step.actual_avg_hr) : "");
  const [rpe, setRpe] = useState(step.actual_avg_rpe != null ? String(step.actual_avg_rpe) : "");

  // Sync inputs when the underlying row changes (data arrives async or another save happens)
  useEffect(() => {
    const sec = step.actual_duration_seconds ?? null;
    setMm(sec != null ? String(Math.floor(sec / 60)) : "");
    setSs(sec != null ? String(sec % 60).padStart(2, "0") : "");
    setDist(step.actual_distance_m != null ? String(step.actual_distance_m) : "");
    setHr(step.actual_avg_hr != null ? String(step.actual_avg_hr) : "");
    setRpe(step.actual_avg_rpe != null ? String(step.actual_avg_rpe) : "");
  }, [step.actual_duration_seconds, step.actual_distance_m, step.actual_avg_hr, step.actual_avg_rpe]);

  const disc = (step.discipline ?? defaultDiscipline) as Discipline;
  const durationSec = (Number(mm) || 0) * 60 + (Number(ss) || 0);
  const distM = Number(dist) || 0;
  const paceLabel = paceLabelFromDistance(disc, distM || null, durationSec || null);

  const save = useMutation({
    mutationFn: async () => {
      const patch = {
        actual_duration_seconds: durationSec > 0 ? durationSec : null,
        actual_distance_m: distM > 0 ? distM : null,
        actual_avg_hr: hr ? Number(hr) : null,
        actual_avg_rpe: rpe ? Number(rpe) : null,
      };
      const { error } = await supabase.from("endurance_steps").update(patch).eq("id", step.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Step logged"); onSaved(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border border-dashed border-border bg-muted/30 p-1.5 text-[11px]">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Actual</span>
      <div className="flex items-center gap-1">
        <Input type="number" min={0} className="h-7 w-12" value={mm} onChange={(e) => setMm(e.target.value)} placeholder="m" />
        <span>:</span>
        <Input type="number" min={0} max={59} className="h-7 w-12" value={ss} onChange={(e) => setSs(e.target.value)} placeholder="s" />
      </div>
      <Input type="number" min={0} className="h-7 w-20" value={dist} onChange={(e) => setDist(e.target.value)}
        placeholder={disc === "swim" ? "m" : "metres"} />
      <Input type="number" min={40} max={230} className="h-7 w-16" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="bpm" />
      <Input type="number" min={1} max={10} step={0.5} className="h-7 w-14" value={rpe} onChange={(e) => setRpe(e.target.value)} placeholder="RPE" />
      {paceLabel && <Badge variant="secondary" className="font-mono">{paceLabel}</Badge>}
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => save.mutate()} disabled={save.isPending}>
        <Save className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ---------- Per-rep actuals (inside repeat groups) ----------

interface RepRow {
  id: string;
  step_id: string;
  rep_index: number;
  actual_duration_seconds: number | null;
  actual_distance_m: number | null;
  actual_avg_hr: number | null;
  actual_avg_rpe: number | null;
}

function RepActualsList({
  stepId, repeatCount, discipline, onChange,
}: {
  stepId: string;
  repeatCount: number;
  discipline: Discipline;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const repsQuery = useQuery({
    queryKey: ["endurance-step-reps", stepId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_step_reps")
        .select("*")
        .eq("step_id", stepId)
        .order("rep_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RepRow[];
    },
  });
  const reps = repsQuery.data ?? [];
  const byIdx = new Map(reps.map((r) => [r.rep_index, r]));

  // Time-weighted averages across the logged reps
  const summary = useMemo(() => {
    let secTotal = 0;
    let distTotal = 0;
    let rpeWeighted = 0;
    let rpeWeight = 0;
    let hrWeighted = 0;
    let hrWeight = 0;
    let countRpe = 0;
    let countHr = 0;
    for (const r of reps) {
      const sec = r.actual_duration_seconds ?? 0;
      secTotal += sec;
      distTotal += r.actual_distance_m ?? 0;
      if (r.actual_avg_rpe != null) {
        const w = sec > 0 ? sec : 1;
        rpeWeighted += r.actual_avg_rpe * w;
        rpeWeight += w;
        countRpe++;
      }
      if (r.actual_avg_hr != null) {
        const w = sec > 0 ? sec : 1;
        hrWeighted += r.actual_avg_hr * w;
        hrWeight += w;
        countHr++;
      }
    }
    return {
      secTotal,
      distTotal,
      avgRpe: countRpe > 0 && rpeWeight > 0 ? Math.round((rpeWeighted / rpeWeight) * 10) / 10 : null,
      avgHr: countHr > 0 && hrWeight > 0 ? Math.round(hrWeighted / hrWeight) : null,
      logged: reps.length,
    };
  }, [reps]);

  return (
    <div className="mt-2 space-y-1 rounded border border-dashed border-primary/40 bg-primary/5 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          Log each rep ({summary.logged}/{repeatCount})
        </span>
        {summary.avgRpe != null && (
          <Badge variant="secondary" className="font-mono text-[10px]">
            avg RPE {summary.avgRpe}
          </Badge>
        )}
        {summary.avgHr != null && (
          <Badge variant="secondary" className="font-mono text-[10px]">
            avg {summary.avgHr} bpm
          </Badge>
        )}
        {summary.secTotal > 0 && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {formatDuration(summary.secTotal)}
          </Badge>
        )}
      </div>
      {Array.from({ length: repeatCount }, (_, i) => i + 1).map((idx) => (
        <RepRowInputs
          key={idx}
          stepId={stepId}
          repIndex={idx}
          existing={byIdx.get(idx) ?? null}
          discipline={discipline}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["endurance-step-reps", stepId] });
            qc.invalidateQueries({ queryKey: ["endurance-session-reps"] });
            onChange();
          }}
        />
      ))}
    </div>
  );
}

function RepRowInputs({
  stepId, repIndex, existing, discipline, onSaved,
}: {
  stepId: string;
  repIndex: number;
  existing: RepRow | null;
  discipline: Discipline;
  onSaved: () => void;
}) {
  const initSec = existing?.actual_duration_seconds ?? null;
  const [mm, setMm] = useState(initSec != null ? String(Math.floor(initSec / 60)) : "");
  const [ss, setSs] = useState(initSec != null ? String(initSec % 60).padStart(2, "0") : "");
  const [dist, setDist] = useState(existing?.actual_distance_m != null ? String(existing.actual_distance_m) : "");
  const [hr, setHr] = useState(existing?.actual_avg_hr != null ? String(existing.actual_avg_hr) : "");
  const [rpe, setRpe] = useState(existing?.actual_avg_rpe != null ? String(existing.actual_avg_rpe) : "");

  // Sync state when the existing row arrives async or is updated elsewhere
  useEffect(() => {
    const sec = existing?.actual_duration_seconds ?? null;
    setMm(sec != null ? String(Math.floor(sec / 60)) : "");
    setSs(sec != null ? String(sec % 60).padStart(2, "0") : "");
    setDist(existing?.actual_distance_m != null ? String(existing.actual_distance_m) : "");
    setHr(existing?.actual_avg_hr != null ? String(existing.actual_avg_hr) : "");
    setRpe(existing?.actual_avg_rpe != null ? String(existing.actual_avg_rpe) : "");
  }, [existing?.actual_duration_seconds, existing?.actual_distance_m, existing?.actual_avg_hr, existing?.actual_avg_rpe]);

  const durationSec = (Number(mm) || 0) * 60 + (Number(ss) || 0);
  const distM = Number(dist) || 0;
  const paceLabel = paceLabelFromDistance(discipline, distM || null, durationSec || null);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        step_id: stepId,
        rep_index: repIndex,
        actual_duration_seconds: durationSec > 0 ? durationSec : null,
        actual_distance_m: distM > 0 ? distM : null,
        actual_avg_hr: hr ? Number(hr) : null,
        actual_avg_rpe: rpe ? Number(rpe) : null,
      };
      const { error } = await supabase
        .from("endurance_step_reps")
        .upsert(payload, { onConflict: "step_id,rep_index" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`Rep ${repIndex} logged`); onSaved(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="w-12 text-[10px] font-semibold text-muted-foreground">Rep {repIndex}</span>
      <div className="flex items-center gap-1">
        <Input type="number" min={0} className="h-7 w-12" value={mm} onChange={(e) => setMm(e.target.value)} placeholder="m" />
        <span>:</span>
        <Input type="number" min={0} max={59} className="h-7 w-12" value={ss} onChange={(e) => setSs(e.target.value)} placeholder="s" />
      </div>
      <Input type="number" min={0} className="h-7 w-20" value={dist} onChange={(e) => setDist(e.target.value)}
        placeholder={discipline === "swim" ? "m" : "metres"} />
      <Input type="number" min={40} max={230} className="h-7 w-16" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="bpm" />
      <Input type="number" min={1} max={10} step={0.5} className="h-7 w-14" value={rpe} onChange={(e) => setRpe(e.target.value)} placeholder="RPE" />
      {paceLabel && <Badge variant="secondary" className="font-mono">{paceLabel}</Badge>}
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => save.mutate()} disabled={save.isPending}>
        <Save className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ---------- Actual logging (athlete) ----------

function ActualLogger({ session, steps, onChange }: { session: SessionRow; steps: StepRow[]; onChange: () => void }) {
  const isStructured = session.mode === "structured";
  const [h, setH] = useState(session.actual_total_seconds ? String(Math.floor(session.actual_total_seconds / 3600)) : "");
  const [m, setM] = useState(session.actual_total_seconds ? String(Math.floor((session.actual_total_seconds % 3600) / 60)) : "");
  const initDist = (session as SessionRow & { actual_distance_m?: number | null }).actual_distance_m ?? null;
  const distUnit = session.discipline === "swim" ? "m" : "km";
  const [dist, setDist] = useState<string>(
    initDist != null
      ? (session.discipline === "swim" ? String(initDist) : String(initDist / 1000))
      : "",
  );
  const [overall, setOverall] = useState<string>(session.overall_rpe?.toString() ?? "");
  const [peak, setPeak] = useState<string>(session.peak_rpe?.toString() ?? "");
  const [notes, setNotes] = useState(session.notes ?? "");
  const initPred = session.predicted_10k_seconds;
  const [pred10kMin, setPred10kMin] = useState<string>(initPred ? String(Math.floor(initPred / 60)) : "");
  const [pred10kSec, setPred10kSec] = useState<string>(initPred ? String(initPred % 60).padStart(2, "0") : "");

  // For structured mode: sum actuals from steps + reps to derive session totals.
  const sessionId = session.id;
  const stepIds = useMemo(() => steps.filter((s) => !s.is_group).map((s) => s.id), [steps]);
  const repsQuery = useQuery({
    queryKey: ["endurance-session-reps", sessionId],
    enabled: isStructured && stepIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_step_reps")
        .select("step_id, actual_duration_seconds, actual_distance_m, actual_avg_rpe, actual_avg_hr")
        .in("step_id", stepIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const derivedTotals = useMemo(() => {
    if (!isStructured) return null;
    let sec = 0;
    let meters = 0;
    // Time-weighted RPE and HR (so 90s strides don't dominate over 20min of easy)
    let rpeWeighted = 0;
    let rpeWeight = 0;
    let hrWeighted = 0;
    let hrWeight = 0;
    let peakRpeSeen: number | null = null;

    const repsByStep = new Map<string, { d: number; m: number; rpeW: number; rpeWeight: number; hrW: number; hrWeight: number; peak: number | null }>();
    for (const r of repsQuery.data ?? []) {
      const cur = repsByStep.get(r.step_id) ?? { d: 0, m: 0, rpeW: 0, rpeWeight: 0, hrW: 0, hrWeight: 0, peak: null };
      const d = r.actual_duration_seconds ?? 0;
      cur.d += d;
      cur.m += r.actual_distance_m ?? 0;
      if (r.actual_avg_rpe != null) {
        const w = d > 0 ? d : 1;
        cur.rpeW += r.actual_avg_rpe * w;
        cur.rpeWeight += w;
        cur.peak = cur.peak == null ? r.actual_avg_rpe : Math.max(cur.peak, r.actual_avg_rpe);
      }
      if (r.actual_avg_hr != null) {
        const w = d > 0 ? d : 1;
        cur.hrW += r.actual_avg_hr * w;
        cur.hrWeight += w;
      }
      repsByStep.set(r.step_id, cur);
    }

    for (const st of steps) {
      if (st.is_group) continue;
      const fromReps = repsByStep.get(st.id);
      if (fromReps && (fromReps.d > 0 || fromReps.m > 0 || fromReps.rpeWeight > 0)) {
        sec += fromReps.d;
        meters += fromReps.m;
        rpeWeighted += fromReps.rpeW;
        rpeWeight += fromReps.rpeWeight;
        hrWeighted += fromReps.hrW;
        hrWeight += fromReps.hrWeight;
        if (fromReps.peak != null) peakRpeSeen = peakRpeSeen == null ? fromReps.peak : Math.max(peakRpeSeen, fromReps.peak);
      } else {
        const d = st.actual_duration_seconds ?? 0;
        sec += d;
        meters += st.actual_distance_m ?? 0;
        if (st.actual_avg_rpe != null) {
          const w = d > 0 ? d : 1;
          rpeWeighted += st.actual_avg_rpe * w;
          rpeWeight += w;
          peakRpeSeen = peakRpeSeen == null ? st.actual_avg_rpe : Math.max(peakRpeSeen, st.actual_avg_rpe);
        }
        if (st.actual_avg_hr != null) {
          const w = d > 0 ? d : 1;
          hrWeighted += st.actual_avg_hr * w;
          hrWeight += w;
        }
      }
    }
    return {
      seconds: sec,
      meters,
      avgRpe: rpeWeight > 0 ? Math.round((rpeWeighted / rpeWeight) * 10) / 10 : null,
      avgHr: hrWeight > 0 ? Math.round(hrWeighted / hrWeight) : null,
      peakRpe: peakRpeSeen,
    };
  }, [isStructured, steps, repsQuery.data]);

  // Derived live pace label (quick mode uses entered values; structured uses derived)
  const liveSeconds = isStructured
    ? (derivedTotals?.seconds || null)
    : ((h || m) ? parseHMS(h || "0", m || "0", "0") : null);
  const liveDistanceM = isStructured
    ? (derivedTotals?.meters || null)
    : (dist ? (session.discipline === "swim" ? Number(dist) : Number(dist) * 1000) : null);
  const livePace = paceLabelFromDistance(session.discipline, liveDistanceM, liveSeconds);

  const save = useMutation({
    mutationFn: async () => {
      const actual_total_seconds = isStructured
        ? (derivedTotals?.seconds ? derivedTotals.seconds : null)
        : ((h || m) ? parseHMS(h || "0", m || "0", "0") : null);
      const actual_distance_m = isStructured
        ? (derivedTotals?.meters ? derivedTotals.meters : null)
        : (dist ? Math.round(session.discipline === "swim" ? Number(dist) : Number(dist) * 1000) : null);
      let predicted_10k_seconds: number | null = null;
      if (pred10kMin || pred10kSec) {
        const total = (Number(pred10kMin) || 0) * 60 + (Number(pred10kSec) || 0);
        if (total > 0) {
          if (total < 1500 || total > 14400) {
            throw new Error("Predicted 10k must be between 25:00 and 4:00:00");
          }
          predicted_10k_seconds = total;
        }
      }
      // In structured mode, prefer derived (time-weighted) overall/peak RPE when the
      // athlete hasn't overridden them manually.
      const overallNum = overall ? Number(overall) : (isStructured ? (derivedTotals?.avgRpe ?? null) : null);
      const peakNum = peak ? Number(peak) : (isStructured ? (derivedTotals?.peakRpe ?? null) : null);
      const hasAnyActual =
        !!actual_total_seconds || !!actual_distance_m ||
        overallNum != null || peakNum != null || !!notes.trim() || predicted_10k_seconds != null;
      const patch: {
        actual_total_seconds: number | null;
        actual_distance_m: number | null;
        overall_rpe: number | null;
        peak_rpe: number | null;
        predicted_10k_seconds: number | null;
        notes: string | null;
        status?: string;
      } = {
        actual_total_seconds,
        actual_distance_m,
        overall_rpe: overallNum,
        peak_rpe: peakNum,
        predicted_10k_seconds,
        notes: notes || null,
      };
      if (hasAnyActual) patch.status = "completed";
      const { error } = await supabase.from("endurance_sessions").update(patch).eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Logged"); onChange(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Log how it actually went</CardTitle>
        <CardDescription>
          {isStructured
            ? "Time & distance are summed from your per-step / per-rep entries above."
            : "RPE-based — add distance to auto-derive pace."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isStructured ? (
          <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total from steps</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {derivedTotals?.seconds ? formatDuration(derivedTotals.seconds) : "—"}
              </Badge>
              <Badge variant="secondary" className="font-mono">
                {derivedTotals?.meters
                  ? (session.discipline === "swim"
                      ? `${derivedTotals.meters} m`
                      : `${(derivedTotals.meters / 1000).toFixed(2)} km`)
                  : "—"}
              </Badge>
              {livePace && <Badge variant="secondary" className="font-mono">{livePace}</Badge>}
            </div>
          </div>
        ) : (
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
              <Label>Distance ({distUnit})</Label>
              <Input
                type="number" min={0} step={distUnit === "km" ? 0.01 : 25}
                value={dist} onChange={(e) => setDist(e.target.value)}
                placeholder={distUnit === "km" ? "e.g. 8.5" : "e.g. 1500"}
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label>Overall RPE</Label>
            <Input type="number" min={1} max={10} step={0.5} value={overall} onChange={(e) => setOverall(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Hardest part RPE</Label>
            <Input type="number" min={1} max={10} step={0.5} value={peak} onChange={(e) => setPeak(e.target.value)} />
          </div>
        </div>
        {!isStructured && livePace && (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Your actual pace:</span>
            <Badge variant="secondary" className="font-mono">{livePace}</Badge>
          </div>
        )}
        <div className="space-y-1">
          <Label>Predicted 10k time today</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={0} max={240} placeholder="min"
              className="w-24"
              value={pred10kMin}
              onChange={(e) => setPred10kMin(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">:</span>
            <Input
              type="number" min={0} max={59} placeholder="sec"
              className="w-24"
              value={pred10kSec}
              onChange={(e) => setPred10kSec(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              How fast you feel you could race a 10k today. Updates only this session — your all-time PB stays in your profile.
            </span>
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
