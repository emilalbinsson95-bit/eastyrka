import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminDeleteExercise, adminUpdateExercise } from "@/lib/admin.functions";
import { useMemo, useState } from "react";
import { Plus, Search, Trash2, Pencil, Save, X, BookOpen, Copy } from "lucide-react";
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

export const Route = createFileRoute("/coach/exercises")({
  head: () => ({
    meta: [
      { title: "Exercise library — SETPOINT Coach" },
      {
        name: "description",
        content:
          "Manage your exercise library — add new movements with descriptions and reuse them across mesocycles.",
      },
    ],
  }),
  component: ExerciseLibraryPage,
});

const exerciseSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(80),
  category: z.string().trim().max(40).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  default_intensity_metric: z.enum(["rpe", "rir"]),
});

interface Exercise {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_global: boolean;
  created_by: string | null;
  default_intensity_metric: "rpe" | "rir";
  updated_at: string;
}

function ExerciseLibraryPage() {
  const { user } = useAuth();
  const userId = user!.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [open, setOpen] = useState(false);

  const exercisesQuery = useQuery({
    queryKey: ["exercises"],
    queryFn: async (): Promise<Exercise[]> => {
      const { data, error } = await supabase
        .from("exercises")
        .select(
          "id, name, description, category, is_global, created_by, default_intensity_metric, updated_at",
        )
        .order("is_global", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Exercise[];
    },
  });

  const filtered = useMemo(() => {
    const list = exercisesQuery.data ?? [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(s) ||
        e.category?.toLowerCase().includes(s) ||
        e.description?.toLowerCase().includes(s),
    );
  }, [exercisesQuery.data, search]);

  const duplicateGroups = useMemo(() => {
    const list = exercisesQuery.data ?? [];
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "")
        .replace(/(machine|barbell|dumbbell|db|bb|cable)/g, "");
    const map = new Map<string, Exercise[]>();
    for (const ex of list) {
      const k = norm(ex.name);
      if (!k) continue;
      const arr = map.get(k) ?? [];
      arr.push(ex);
      map.set(k, arr);
    }
    return Array.from(map.values()).filter((g) => g.length > 1);
  }, [exercisesQuery.data]);

  const upsertMutation = useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      category?: string;
      description?: string;
      default_intensity_metric: "rpe" | "rir";
    }) => {
      const parsed = exerciseSchema.parse(input);
      const payload = {
        name: parsed.name,
        category: parsed.category || null,
        description: parsed.description || null,
        default_intensity_metric: parsed.default_intensity_metric,
        created_by: userId,
        is_global: false,
      };
      if (input.id) {
        const { error } = await supabase
          .from("exercises")
          .update({
            name: payload.name,
            category: payload.category,
            description: payload.description,
            default_intensity_metric: payload.default_intensity_metric,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exercises").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Exercise saved");
      qc.invalidateQueries({ queryKey: ["exercises"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exercises").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exercise removed");
      qc.invalidateQueries({ queryKey: ["exercises"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const adminDelete = useServerFn(adminDeleteExercise);
  const adminDeleteMutation = useMutation({
    mutationFn: async (vars: { id: string; password: string }) =>
      adminDelete({ data: { exerciseId: vars.id, password: vars.password } }),
    onSuccess: () => {
      toast.success("Exercise removed (admin)");
      qc.invalidateQueries({ queryKey: ["exercises"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const adminUpdate = useServerFn(adminUpdateExercise);
  const adminUpdateMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      password: string;
      name: string;
      category?: string;
      description?: string;
      default_intensity_metric: "rpe" | "rir";
    }) =>
      adminUpdate({
        data: {
          exerciseId: vars.id,
          password: vars.password,
          name: vars.name,
          category: vars.category || null,
          description: vars.description || null,
          default_intensity_metric: vars.default_intensity_metric,
        },
      }),
    onSuccess: () => {
      toast.success("Exercise updated (admin)");
      qc.invalidateQueries({ queryKey: ["exercises"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function promptAdminDelete(ex: Exercise) {
    const pw = window.prompt(
      `Admin password to delete "${ex.name}":`,
      "",
    );
    if (!pw) return;
    adminDeleteMutation.mutate({ id: ex.id, password: pw });
  }

  function handleSave(values: {
    name: string;
    category?: string;
    description?: string;
    default_intensity_metric: "rpe" | "rir";
  }) {
    if (!editing) {
      upsertMutation.mutate({ ...values });
      return;
    }
    const pw = window.prompt(
      `Admin password to edit "${editing.name}":`,
      "",
    );
    if (!pw) return;
    adminUpdateMutation.mutate({ id: editing.id, password: pw, ...values });
  }


  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BookOpen className="h-6 w-6 text-primary" /> Exercise library
          </h1>
          <p className="text-sm text-muted-foreground">
            Movements you can program in any mesocycle. Custom additions are visible
            to all coaches but only you can edit yours.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" /> New exercise
            </Button>
          </DialogTrigger>
          <ExerciseDialog
            key={editing?.id ?? "new"}
            editing={editing}
            onSubmit={handleSave}
            saving={upsertMutation.isPending || adminUpdateMutation.isPending}
          />
        </Dialog>
      </div>


      {duplicateGroups.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Copy className="h-4 w-4 text-amber-600" />
              Possible duplicates ({duplicateGroups.length})
            </CardTitle>
            <CardDescription>
              Names that look the same after stripping casing, punctuation and
              common equipment words. Delete the redundant entry — your custom
              ones only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {duplicateGroups.map((group, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-background p-2"
              >
                <div className="flex flex-wrap gap-2">
                  {group.map((ex) => {
                    const mine = ex.created_by === userId && !ex.is_global;
                    return (
                      <div
                        key={ex.id}
                        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs"
                      >
                        <span className="font-medium">{ex.name}</span>
                        {ex.is_global && (
                          <Badge variant="secondary" className="text-[10px]">
                            Standard
                          </Badge>
                        )}
                        <button
                          type="button"
                          aria-label={`Delete ${ex.name}`}
                          className="text-destructive hover:text-destructive/80"
                          onClick={() => promptAdminDelete(ex)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>

                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search exercises…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {exercisesQuery.isLoading ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No exercises match.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((ex) => {
                const mine = ex.created_by === userId;
                return (
                  <li key={ex.id} className="flex items-start gap-4 px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{ex.name}</span>
                        {ex.is_global && (
                          <Badge variant="secondary" className="text-xs">
                            Standard
                          </Badge>
                        )}
                        {ex.category && (
                          <Badge variant="outline" className="text-xs">
                            {ex.category}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs uppercase">
                          {ex.default_intensity_metric}
                        </Badge>
                        {!ex.is_global && mine && (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/15 text-xs">
                            Yours
                          </Badge>
                        )}
                      </div>
                      {ex.description && (
                        <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                          {ex.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={
                          mine && !ex.is_global
                            ? "Edit"
                            : "Edit (admin password required)"
                        }
                        onClick={() => {
                          setEditing(ex);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete (admin password required)"
                        onClick={() => promptAdminDelete(ex)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>

                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExerciseDialog({
  editing,
  onSubmit,
  saving,
}: {
  editing: Exercise | null;
  onSubmit: (v: {
    name: string;
    category?: string;
    description?: string;
    default_intensity_metric: "rpe" | "rir";
  }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [metric, setMetric] = useState<"rpe" | "rir">(
    editing?.default_intensity_metric ?? "rpe",
  );

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit exercise" : "New exercise"}</DialogTitle>
        <DialogDescription>
          Add a movement with cueing or setup notes. Athletes will see this when it
          appears in their session.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tempo Front Squat"
          />
        </div>
        <div>
          <Label htmlFor="category">Category (optional)</Label>
          <Input
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Squat, Bench, Deadlift, Accessory…"
          />
        </div>
        <div>
          <Label>Default intensity metric</Label>
          <div className="mt-1 flex gap-2">
            <Button
              type="button"
              variant={metric === "rpe" ? "default" : "outline"}
              size="sm"
              onClick={() => setMetric("rpe")}
              className="flex-1"
            >
              RPE
              <span className="ml-2 text-[10px] opacity-70">powerlifting</span>
            </Button>
            <Button
              type="button"
              variant={metric === "rir" ? "default" : "outline"}
              size="sm"
              onClick={() => setMetric("rir")}
              className="flex-1"
            >
              RIR
              <span className="ml-2 text-[10px] opacity-70">bodybuilding</span>
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            This is the default when programming this exercise. Coaches can still
            override per set in the plan.
          </p>
        </div>
        <div>
          <Label htmlFor="description">Description / cues</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="3s eccentric, 1s pause at depth, drive elbows up out of the hole."
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          variant="ghost"
          onClick={() => {
            setName("");
            setCategory("");
            setDescription("");
            setMetric("rpe");
          }}
        >
          <X className="mr-1 h-4 w-4" /> Reset
        </Button>
        <Button
          onClick={() =>
            onSubmit({
              name,
              category,
              description,
              default_intensity_metric: metric,
            })
          }
          disabled={saving || !name.trim()}
        >
          <Save className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
