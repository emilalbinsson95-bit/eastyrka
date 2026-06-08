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
