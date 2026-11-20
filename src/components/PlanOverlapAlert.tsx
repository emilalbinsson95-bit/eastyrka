import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addDays, format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { findPlanOverlaps } from "@/lib/planOverlaps";

const d = (iso: string) => format(parseISO(iso), "d MMM", { locale: sv });

/**
 * Varning när två block har pass inom samma period. Visar pågående och
 * kommande krockar där minst ett av blocken har publicerade pass.
 */
export function PlanOverlapAlert({ athleteId }: { athleteId: string }) {
  const query = useQuery({
    queryKey: ["plan-overlaps", athleteId],
    queryFn: async () => {
      const since = format(addDays(new Date(), -42), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("week_plans")
        .select("mesocycle_id, status, week_start_date, mesocycles!inner(name, status), planned_sessions(day_of_week, title, planned_exercises(id))")
        .eq("athlete_id", athleteId)
        .neq("mesocycles.status", "archived")
        .gte("week_start_date", since);
      if (error) throw error;
      return data ?? [];
    },
  });
  const overlaps = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return findPlanOverlaps(
      (query.data ?? []).map((w) => ({
        mesocycle_id: w.mesocycle_id,
        mesocycle_name: (w.mesocycles as unknown as { name: string }).name,
        status: w.status,
        week_start_date: w.week_start_date,
        sessions: (w.planned_sessions ?? []).map((s) => ({ day_of_week: s.day_of_week, title: s.title, exerciseCount: (s.planned_exercises ?? []).length })),
      })),
    ).filter((o) => o.to >= today);
  }, [query.data]);

  if (!overlaps.length) return null;
  return (
    <Alert variant="destructive" data-testid="plan-overlap-alert">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Överlappande träningsplaner</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1">
          {overlaps.map((o) => (
            <li key={`${o.a.id}-${o.b.id}`}>
              <Link to="/coach/athletes/$athleteId/cycles/$cycleId" params={{ athleteId, cycleId: o.a.id }} className="underline">
                {o.a.name}
              </Link>{" "}
              och{" "}
              <Link to="/coach/athletes/$athleteId/cycles/$cycleId" params={{ athleteId, cycleId: o.b.id }} className="underline">
                {o.b.name}
              </Link>{" "}
              har pass {d(o.from)}–{d(o.to)} ({o.dates.length} passdagar).{" "}
              {o.bothPublished ? "Båda är publicerade, så atleten ser två planer." : "Det ena är ett utkast; publicera inte båda."}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs">Avpublicera eller korta det block som inte ska gälla. Loggad träning påverkas inte.</p>
      </AlertDescription>
    </Alert>
  );
}
