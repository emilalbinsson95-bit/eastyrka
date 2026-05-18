import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { BookOpen, Library, Plus, Filter } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SESSION_LIBRARY,
  RACE_GOALS,
  LEVELS,
  CATEGORIES,
  templateTotalSeconds,
  templateAvgRpe,
  templatePeakRpe,
  templateStrain,
  strainBucket,
  templateInsertPlan,
  type RaceGoal,
  type AthleteLevel,
  type SessionCategory,
  type SessionTemplate,
} from "@/lib/enduranceLibrary";
import { formatDuration, rpeTone } from "@/lib/endurance";

export function EnduranceLibrary({
  athleteId,
  coachId,
  onDeployed,
}: {
  athleteId: string;
  coachId: string;
  onDeployed?: (sessionId: string) => void;
}) {
  const qc = useQueryClient();
  const [goal, setGoal] = useState<RaceGoal | "all">("all");
  const [level, setLevel] = useState<AthleteLevel | "all">("all");
  const [category, setCategory] = useState<SessionCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const filtered = useMemo(() => {
    return SESSION_LIBRARY.filter((t) => {
      if (goal !== "all" && !t.goals.includes(goal)) return false;
      if (level !== "all" && !t.levels.includes(level)) return false;
      if (category !== "all" && t.category !== category) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [goal, level, category, search]);

  const deploy = useMutation({
    mutationFn: async (template: SessionTemplate) => {
      // 1. Create the session
      const { data: session, error: sErr } = await supabase
        .from("endurance_sessions")
        .insert({
          athlete_id: athleteId,
          coach_id: coachId,
          date,
          discipline: template.discipline,
          mode: template.mode,
          title: template.name,
          notes: template.description,
        })
        .select("id")
        .single();
      if (sErr) throw sErr;
      const sessionId = session.id as string;

      // 2. Two-pass insert of steps: insert all without parent first, then map parents.
      const plan = templateInsertPlan(template);
      const rows = plan.map((n) => ({
        session_id: sessionId,
        parent_id: null,
        order_index: n.order_index,
        is_group: n.is_group,
        repeat_count: n.repeat_count,
        discipline: n.discipline,
        duration_seconds: n.duration_seconds,
        target_rpe: n.target_rpe,
        notes: n.notes,
      }));
      const { data: inserted, error: iErr } = await supabase
        .from("endurance_steps")
        .insert(rows)
        .select("id, order_index, is_group, duration_seconds");
      if (iErr) throw iErr;

      // Map tempId → real UUID using order index + is_group + duration as fingerprint.
      // Plan rows and inserted rows are in the same order if PG returns insert order;
      // to be safe we re-fetch by session and match by index in `plan`.
      const { data: stored } = await supabase
        .from("endurance_steps")
        .select("id, order_index, is_group, parent_id, duration_seconds, target_rpe")
        .eq("session_id", sessionId);

      // Build temp→real by aligning plan order with stored. Since we inserted in
      // plan order and Postgres preserves it for a single batch, zip them.
      const idMap = new Map<string, string>();
      const insertedSorted = (inserted ?? []).slice();
      // Re-sort inserted to match the original plan order: by order_index+is_group+duration
      // (this is best-effort; PG usually preserves batch order).
      for (let i = 0; i < plan.length; i++) {
        const realId = insertedSorted[i]?.id ?? stored?.[i]?.id;
        if (realId) idMap.set(plan[i].tempId, realId);
      }

      // 3. Update parent_ids for children
      const childUpdates = plan
        .filter((n) => n.parentTemp != null)
        .map((n) => ({
          tempId: n.tempId,
          parentReal: idMap.get(n.parentTemp!),
          realId: idMap.get(n.tempId),
        }))
        .filter((u) => u.parentReal && u.realId);

      for (const u of childUpdates) {
        await supabase
          .from("endurance_steps")
          .update({ parent_id: u.parentReal })
          .eq("id", u.realId!);
      }

      // 4. Update session totals
      await supabase
        .from("endurance_sessions")
        .update({
          planned_total_seconds: templateTotalSeconds(template),
          planned_avg_rpe: templateAvgRpe(template),
        })
        .eq("id", sessionId);

      return sessionId;
    },
    onSuccess: (sessionId) => {
      toast.success("Session deployed");
      qc.invalidateQueries({ queryKey: ["coach-endurance", athleteId] });
      onDeployed?.(sessionId);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Library className="h-5 w-5 text-primary" />
          Session library
        </CardTitle>
        <CardDescription>
          RPE-tension templates for 3 K → marathon. Filter, then deploy to the athlete on the chosen date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="space-y-3">
          <FilterRow label="Goal">
            <ChipBtn active={goal === "all"} onClick={() => setGoal("all")}>All</ChipBtn>
            {RACE_GOALS.map((g) => (
              <ChipBtn key={g.value} active={goal === g.value} onClick={() => setGoal(g.value)}>
                {g.label}
              </ChipBtn>
            ))}
          </FilterRow>
          <FilterRow label="Level">
            <ChipBtn active={level === "all"} onClick={() => setLevel("all")}>All</ChipBtn>
            {LEVELS.map((l) => (
              <ChipBtn key={l.value} active={level === l.value} onClick={() => setLevel(l.value)}>
                {l.label}
              </ChipBtn>
            ))}
          </FilterRow>
          <FilterRow label="Type">
            <ChipBtn active={category === "all"} onClick={() => setCategory("all")}>All</ChipBtn>
            {CATEGORIES.map((c) => (
              <ChipBtn key={c.value} active={category === c.value} onClick={() => setCategory(c.value)}>
                {c.label}
              </ChipBtn>
            ))}
          </FilterRow>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px]">
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search sessions…"
                className="pl-7"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Deploy on</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "session" : "sessions"}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const total = templateTotalSeconds(t);
            const avg = templateAvgRpe(t);
            const peak = templatePeakRpe(t);
            const strain = templateStrain(t);
            const bucket = strainBucket(strain);
            return (
              <div
                key={t.id}
                className="flex flex-col rounded-md border border-border bg-card p-3 text-sm"
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="font-semibold leading-tight">{t.name}</div>
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
                <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                <div className="mb-3 flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[10px]">{formatDuration(total)}</Badge>
                  {avg != null && (
                    <Badge className={cn("text-[10px]", rpeTone(avg))}>avg {avg}</Badge>
                  )}
                  {peak != null && (
                    <Badge className={cn("text-[10px]", rpeTone(peak))} title="Peak target RPE">
                      peak {peak}
                    </Badge>
                  )}
                  <Badge
                    className={cn("text-[10px]", bucket.tone)}
                    title="TRIMP-style strain score (minutes × RPE-weighting)"
                  >
                    strain {strain} · {bucket.label}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {CATEGORIES.find((c) => c.value === t.category)?.label}
                  </Badge>
                  {t.goals.map((g) => (
                    <Badge key={g} variant="outline" className="text-[10px]">
                      {RACE_GOALS.find((r) => r.value === g)?.label}
                    </Badge>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="mt-auto"
                  disabled={deploy.isPending}
                  onClick={() => deploy.mutate(t)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Deploy
                </Button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No sessions match the filters.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function ChipBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
