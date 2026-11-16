import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StatsDashboard } from "@/components/StatsDashboard";

export const Route = createFileRoute("/coach/athletes/$athleteId/stats")({
  head: () => ({
    meta: [
      {title: "Atletstatistik — SETPOINT Coach"},
      {name: "description", content: "Atletens EAk, samlade belastning, personbästa, DOTS och kroppsvikt."},
      {property: "og:title", content: "Atletstatistik — SETPOINT Coach"},
      {property: "og:description", content: "Atletens EAk, samlade belastning, personbästa, DOTS och kroppsvikt."},
      {property: "og:type", content: "website"},
      {name: "twitter:card", content: "summary"},
    ],
  }),
  component: AthleteStatsPage,
});

function AthleteStatsPage() {
  const { athleteId } = useParams({
    from: "/coach/athletes/$athleteId/stats",
  });
  const profile = useQuery({
    queryKey: ["athlete-profile-name", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", athleteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/coach/athletes/$athleteId" params={{ athleteId }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to athlete
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          Översikt, samma som atleten ser.{" "}
          <Link to="/coach/athletes/$athleteId/analytics" params={{ athleteId }} search={{}} className="text-primary underline-offset-4 hover:underline">Djupanalys och beslut finns under Analys.</Link>
        </p>
      </div>
      <StatsDashboard
        athleteId={athleteId}
        athleteName={profile.data?.full_name ?? undefined}
      />
    </div>
  );
}
