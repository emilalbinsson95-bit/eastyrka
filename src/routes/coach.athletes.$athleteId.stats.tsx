import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { StatsDashboard } from "@/components/StatsDashboard";

export const Route = createFileRoute("/coach/athletes/$athleteId/stats")({
  head: () => ({
    meta: [
      { title: "Athlete stats — EA Training System Coach" },
      {
        name: "description",
        content:
          "Athlete training dashboard: load status, mesocycle summary, PRs and bodyweight vs strength.",
      },
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
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/coach/athletes/$athleteId" params={{ athleteId }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to athlete
        </Link>
      </Button>
      <StatsDashboard
        athleteId={athleteId}
        athleteName={profile.data?.full_name ?? undefined}
      />
    </div>
  );
}
