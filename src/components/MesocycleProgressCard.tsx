import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, addWeeks, isBefore, isAfter } from "date-fns";
import { Calendar, ArrowRight, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Mesocycle {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  total_weeks: number;
  status: "draft" | "active" | "archived";
}

interface WeekRow {
  id: string;
  mesocycle_id: string | null;
  week_index: number | null;
  week_start_date: string;
  status: string;
}

/**
 * Surfaces mesocycle progress on the coach athlete dashboard:
 *  - active block name, weeks elapsed / total, % complete
 *  - published vs draft week count
 *  - quick link into the cycle editor
 */
export function MesocycleProgressCard({ athleteId }: { athleteId: string }) {
  const cyclesQuery = useQuery({
    queryKey: ["meso-progress-cycles", athleteId],
    queryFn: async (): Promise<Mesocycle[]> => {
      const { data, error } = await supabase
        .from("mesocycles")
        .select("id, name, goal, start_date, total_weeks, status")
        .eq("athlete_id", athleteId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Mesocycle[];
    },
  });

  const weeksQuery = useQuery({
    queryKey: ["meso-progress-weeks", athleteId],
    queryFn: async (): Promise<WeekRow[]> => {
      const { data, error } = await supabase
        .from("week_plans")
        .select("id, mesocycle_id, week_index, week_start_date, status")
        .eq("athlete_id", athleteId)
        .not("mesocycle_id", "is", null);
      if (error) throw error;
      return (data ?? []) as WeekRow[];
    },
  });

  const active = useMemo(() => {
    const cycles = cyclesQuery.data ?? [];
    if (cycles.length === 0) return null;
    const today = new Date();
    // Prefer a cycle whose window contains today
    const containing = cycles.find((c) => {
      const start = parseISO(c.start_date);
      const end = addWeeks(start, c.total_weeks);
      return !isBefore(today, start) && isBefore(today, end);
    });
    return containing ?? cycles[0];
  }, [cyclesQuery.data]);

  if (cyclesQuery.isLoading) return null;
  if (!active) return null;

  const start = parseISO(active.start_date);
  const end = addWeeks(start, active.total_weeks);
  const today = new Date();
  const totalDays = active.total_weeks * 7;
  const elapsedDays = Math.max(
    0,
    Math.min(
      totalDays,
      Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
    ),
  );
  const pct = Math.round((elapsedDays / totalDays) * 100);
  const weekNumber = Math.min(active.total_weeks, Math.floor(elapsedDays / 7) + 1);
  const isFuture = isAfter(start, today);
  const isPast = isAfter(today, end);

  const blockWeeks = (weeksQuery.data ?? []).filter(
    (w) => w.mesocycle_id === active.id,
  );
  const publishedCount = blockWeeks.filter((w) => w.status === "published").length;
  const draftCount = blockWeeks.filter((w) => w.status === "draft").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              {active.name}
              <Badge
                variant={active.status === "active" ? "default" : "outline"}
                className="text-[10px] capitalize"
              >
                {active.status}
              </Badge>
            </CardTitle>
            {active.goal && (
              <CardDescription className="text-xs">{active.goal}</CardDescription>
            )}
          </div>
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
            <Link
              to="/coach/athletes/$athleteId/cycles/$cycleId"
              params={{ athleteId, cycleId: active.id }}
            >
              Open <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {isFuture
                ? "Starts soon"
                : isPast
                  ? "Block complete"
                  : `Week ${weekNumber} of ${active.total_weeks}`}
            </span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isPast ? "bg-status-adapting" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(start, "MMM d")} – {format(end, "MMM d, yyyy")}
            </span>
            <span>
              {publishedCount} published · {draftCount} draft
            </span>
          </div>
        </div>

        {/* Week strip */}
        <div className="flex gap-1">
          {Array.from({ length: active.total_weeks }).map((_, i) => {
            const w = blockWeeks.find((x) => x.week_index === i + 1);
            const wStart = addWeeks(start, i);
            const isCurrent = i + 1 === weekNumber && !isFuture && !isPast;
            const cls = !w
              ? "bg-muted/50"
              : w.status === "published"
                ? "bg-primary"
                : "bg-amber-400/60";
            return (
              <div
                key={i}
                title={`Week ${i + 1} · ${format(wStart, "MMM d")}${w ? ` · ${w.status}` : " · not created"}`}
                className={cn(
                  "h-2 flex-1 rounded-sm transition-all",
                  cls,
                  isCurrent && "ring-2 ring-primary/60 ring-offset-1 ring-offset-background",
                )}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
