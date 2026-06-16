import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/physio/templates/$templateId")({
  head: () => ({
    meta: [{ title: "Template — EA Physio" }],
  }),
  component: TemplateDetail,
});

function TemplateDetail() {
  const { templateId } = Route.useParams();
  const qc = useQueryClient();

  const tplQuery = useQuery({
    queryKey: ["rehab-template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_plan_templates")
        .select("id, name, description")
        .eq("id", templateId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const exQuery = useQuery({
    queryKey: ["rehab-template-exercises", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_plan_template_exercises")
        .select("*")
        .eq("template_id", templateId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const bandsQuery = useQuery({
    queryKey: ["resistance-bands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resistance_bands")
        .select("id, label, min_kg, max_kg, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [name, setName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [hold, setHold] = useState("");
  const [load, setLoad] = useState("");
  const [bandId, setBandId] = useState("");
  const [notes, setNotes] = useState("");

  const addEx = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Exercise name required");
      const order = (exQuery.data ?? []).length;
      const band = (bandsQuery.data ?? []).find((b) => b.id === bandId);
      const { error } = await supabase.from("rehab_plan_template_exercises").insert({
        template_id: templateId,
        order_index: order,
        name: name.trim(),
        sets: sets === "" ? null : Number(sets),
        reps: reps === "" ? null : Number(reps),
        hold_seconds: hold === "" ? null : Number(hold),
        load_kg: load === "" ? null : Number(load),
        band_id: band?.id ?? null,
        band_label: band?.label ?? null,
        band_min_kg: band ? Number(band.min_kg) : null,
        band_max_kg: band ? Number(band.max_kg) : null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rehab-template-exercises", templateId] });
      setName(""); setSets(""); setReps(""); setHold(""); setLoad(""); setBandId(""); setNotes("");
      toast.success("Exercise added");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeEx = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rehab_plan_template_exercises").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rehab-template-exercises", templateId] }),
  });

  const updateMeta = useMutation({
    mutationFn: async (patch: { name?: string; description?: string | null }) => {
      const { error } = await supabase.from("rehab_plan_templates").update(patch).eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rehab-template", templateId] });
      toast.success("Saved");
    },
  });

  if (tplQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!tplQuery.data) return <p className="text-sm text-muted-foreground">Template not found.</p>;
  const tpl = tplQuery.data;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/physio/templates">
          <ArrowLeft className="mr-1 h-4 w-4" /> Templates
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{tpl.name}</CardTitle>
          <CardDescription>Edit name and description; changes save on blur.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              defaultValue={tpl.name}
              onBlur={(e) => e.target.value !== tpl.name && updateMeta.mutate({ name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              defaultValue={tpl.description ?? ""}
              onBlur={(e) =>
                e.target.value !== (tpl.description ?? "") &&
                updateMeta.mutate({ description: e.target.value || null })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(exQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No exercises yet.</p>
          )}
          {(exQuery.data ?? []).map((ex) => (
            <div key={ex.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-3">
              <div>
                <div className="font-semibold">{ex.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[
                    ex.sets != null && `${ex.sets} sets`,
                    ex.reps != null && `${ex.reps} reps`,
                    ex.hold_seconds != null && `${ex.hold_seconds}s hold`,
                    ex.load_kg != null && `${ex.load_kg} kg`,
                    ex.band_label && `band: ${ex.band_label}`,
                  ].filter(Boolean).join(" · ") || "—"}
                </div>
                {ex.notes && <p className="mt-1 text-xs">{ex.notes}</p>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeEx.mutate(ex.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}

          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Exercise</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Single-leg squat" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                <div><Label className="text-xs">Sets</Label><Input value={sets} onChange={(e) => setSets(e.target.value)} type="number" min={0} /></div>
                <div><Label className="text-xs">Reps</Label><Input value={reps} onChange={(e) => setReps(e.target.value)} type="number" min={0} /></div>
                <div><Label className="text-xs">Hold (s)</Label><Input value={hold} onChange={(e) => setHold(e.target.value)} type="number" min={0} /></div>
              </div>
              <div><Label className="text-xs">Load (kg)</Label><Input value={load} onChange={(e) => setLoad(e.target.value)} type="number" min={0} step="0.5" /></div>
              <div>
                <Label className="text-xs">Band</Label>
                <select
                  value={bandId}
                  onChange={(e) => setBandId(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— none —</option>
                  {(bandsQuery.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} ({Number(b.min_kg)}–{Number(b.max_kg)} kg)
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </div>
            <Button size="sm" onClick={() => addEx.mutate()} disabled={addEx.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Add exercise
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
