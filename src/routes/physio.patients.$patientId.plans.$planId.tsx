import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Calendar, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/physio/patients/$patientId/plans/$planId")({
  head: () => ({ meta: [{ title: "Rehab plan — EA Physio" }] }),
  component: PlanDetail,
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addDays(base: string, days: number) {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function PlanDetail() {
  const { patientId, planId } = Route.useParams();
  const { user } = useAuth();
  const physioId = user!.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const planQuery = useQuery({
    queryKey: ["rehab-plan", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_plans")
        .select("*")
        .eq("id", planId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const cellsQuery = useQuery({
    queryKey: ["rehab-plan-sessions", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_plan_sessions")
        .select("*")
        .eq("plan_id", planId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["rehab-templates", physioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_plan_templates")
        .select("id, name")
        .eq("physio_id", physioId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsertCell = useMutation({
    mutationFn: async (cell: { week_index: number; day_of_week: number; template_id: string | null; title: string | null }) => {
      const existing = (cellsQuery.data ?? []).find(
        (c) => c.week_index === cell.week_index && c.day_of_week === cell.day_of_week,
      );
      if (cell.template_id === null && !cell.title) {
        if (existing) {
          const { error } = await supabase.from("rehab_plan_sessions").delete().eq("id", existing.id);
          if (error) throw error;
        }
        return;
      }
      if (existing) {
        const { error } = await supabase
          .from("rehab_plan_sessions")
          .update({ template_id: cell.template_id, title: cell.title })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rehab_plan_sessions").insert({
          plan_id: planId,
          week_index: cell.week_index,
          day_of_week: cell.day_of_week,
          template_id: cell.template_id,
          title: cell.title,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rehab-plan-sessions", planId] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const plan = planQuery.data!;
      const cells = cellsQuery.data ?? [];
      const toGenerate = cells.filter((c) => !c.materialized_session_id);
      if (toGenerate.length === 0) throw new Error("Nothing new to generate");

      // Load template exercises in one batch
      const tplIds = Array.from(new Set(toGenerate.map((c) => c.template_id).filter(Boolean) as string[]));
      const tplExMap = new Map<string, Array<Record<string, unknown>>>();
      if (tplIds.length) {
        const { data: tplEx, error } = await supabase
          .from("rehab_plan_template_exercises")
          .select("*")
          .in("template_id", tplIds)
          .order("order_index");
        if (error) throw error;
        for (const e of tplEx ?? []) {
          if (!tplExMap.has(e.template_id)) tplExMap.set(e.template_id, []);
          tplExMap.get(e.template_id)!.push(e);
        }
      }

      let created = 0;
      for (const cell of toGenerate) {
        const sessionDate = addDays(plan.start_date, cell.week_index * 7 + cell.day_of_week);
        const { data: sess, error: sErr } = await supabase
          .from("rehab_sessions")
          .insert({
            physio_id: physioId,
            patient_id: patientId,
            session_date: sessionDate,
            title: cell.title || `Week ${cell.week_index + 1} · ${DAYS[cell.day_of_week]}`,
            status: "planned",
          })
          .select("id")
          .single();
        if (sErr) throw sErr;

        if (cell.template_id) {
          const exs = tplExMap.get(cell.template_id) ?? [];
          if (exs.length > 0) {
            const rows = exs.map((e, idx) => ({
              session_id: sess.id,
              order_index: idx,
              name: e.name,
              sets: e.sets,
              reps: e.reps,
              hold_seconds: e.hold_seconds,
              load_kg: e.load_kg,
              band_id: e.band_id,
              resistance_band: e.band_label,
              band_min_kg: e.band_min_kg,
              band_max_kg: e.band_max_kg,
              notes: e.notes,
            }));
            const { error: eErr } = await supabase.from("rehab_exercises").insert(rows);
            if (eErr) throw eErr;
          }
        }

        const { error: uErr } = await supabase
          .from("rehab_plan_sessions")
          .update({ materialized_session_id: sess.id })
          .eq("id", cell.id);
        if (uErr) throw uErr;
        created++;
      }
      return created;
    },
    onSuccess: (n) => {
      toast.success(`Generated ${n} session${n === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["rehab-plan-sessions", planId] });
      qc.invalidateQueries({ queryKey: ["physio-patient-sessions", physioId, patientId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updatePlan = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("rehab_plans").update(patch).eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rehab-plan", planId] }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rehab_plans").delete().eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan deleted");
      navigate({ to: "/physio/patients/$patientId", params: { patientId } });
    },
  });

  if (planQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!planQuery.data) return <p className="text-sm text-muted-foreground">Plan not found.</p>;
  const plan = planQuery.data;
  const cells = cellsQuery.data ?? [];
  const cellAt = (w: number, d: number) => cells.find((c) => c.week_index === w && c.day_of_week === d);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/physio/patients/$patientId" params={{ patientId }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to patient
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{plan.name}</h1>
          <p className="text-sm text-muted-foreground">
            {plan.weeks} weeks · starts {new Date(plan.start_date).toLocaleDateString()} · status {plan.status}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            <Wand2 className="mr-1 h-4 w-4" /> Generate sessions
          </Button>
          <Button variant="ghost" onClick={() => remove.mutate()}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan settings</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              defaultValue={plan.name}
              onBlur={(e) => e.target.value !== plan.name && updatePlan.mutate({ name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Start date</Label>
            <Input
              type="date"
              defaultValue={plan.start_date}
              onBlur={(e) => e.target.value !== plan.start_date && updatePlan.mutate({ start_date: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <select
              defaultValue={plan.status}
              onChange={(e) => updatePlan.mutate({ status: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {["draft", "active", "completed", "archived"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Schedule
          </CardTitle>
          <CardDescription>Pick a template (or leave a custom session) for any day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: plan.weeks }, (_, w) => (
            <div key={w} className="space-y-2">
              <div className="text-sm font-semibold">Week {w + 1}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                {DAYS.map((day, d) => {
                  const cell = cellAt(w, d);
                  return (
                    <div key={d} className="rounded-md border border-border p-2">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        {day} · {new Date(addDays(plan.start_date, w * 7 + d)).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                      <select
                        value={cell?.template_id ?? ""}
                        onChange={(e) =>
                          upsertCell.mutate({
                            week_index: w,
                            day_of_week: d,
                            template_id: e.target.value || null,
                            title: cell?.title ?? null,
                          })
                        }
                        disabled={!!cell?.materialized_session_id}
                        className="h-8 w-full rounded-md border border-input bg-background px-1 text-xs"
                      >
                        <option value="">— rest —</option>
                        {(templatesQuery.data ?? []).map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                        <option value="" disabled>──────</option>
                      </select>
                      <Input
                        className="mt-1 h-7 text-xs"
                        defaultValue={cell?.title ?? ""}
                        placeholder="Custom title"
                        disabled={!!cell?.materialized_session_id}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== (cell?.title ?? null)) {
                            upsertCell.mutate({
                              week_index: w,
                              day_of_week: d,
                              template_id: cell?.template_id ?? null,
                              title: v,
                            });
                          }
                        }}
                      />
                      {cell?.materialized_session_id && (
                        <Link
                          to="/physio/patients/$patientId/sessions/$sessionId"
                          params={{ patientId, sessionId: cell.materialized_session_id }}
                          className="mt-1 block text-[10px] text-primary underline"
                        >
                          Open session
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
