import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, ChevronRight, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/physio/templates")({
  head: () => ({
    meta: [
      { title: "Workout templates — EA Physio" },
      { name: "description", content: "Reusable rehab workout templates." },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const { user } = useAuth();
  const physioId = user!.id;
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["rehab-templates", physioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rehab_plan_templates")
        .select("id, name, description, created_at")
        .eq("physio_id", physioId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("rehab_plan_templates").insert({
        physio_id: physioId,
        name: name.trim(),
        description: desc || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template created");
      setName("");
      setDesc("");
      qc.invalidateQueries({ queryKey: ["rehab-templates", physioId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rehab_plan_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rehab-templates", physioId] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workout templates</h1>
        <p className="text-sm text-muted-foreground">
          Reusable exercise sets you can drop into any rehab session or plan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> New template
          </CardTitle>
          <CardDescription>Give it a name; add exercises after creating.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="t-name">Name</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ACL Phase 2 — Strength A" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create template"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Your templates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {templatesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!templatesQuery.isLoading && (templatesQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          )}
          {(templatesQuery.data ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
              <Link
                to="/physio/templates/$templateId"
                params={{ templateId: t.id }}
                className="flex flex-1 items-center gap-3 min-w-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.name}</div>
                  {t.description && (
                    <div className="truncate text-xs text-muted-foreground">{t.description}</div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
