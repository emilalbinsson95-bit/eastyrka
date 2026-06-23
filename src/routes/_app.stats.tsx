import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { StatsDashboard } from "@/components/StatsDashboard";

export const Route = createFileRoute("/_app/stats")({
  head: () => ({
    meta: [
      { title: "Stats — SETPOINT" },
      {
        name: "description",
        content:
          "Your training dashboard: load status, week-over-week numbers, mesocycle summary, PRs and bodyweight vs strength.",
      },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const { user } = useAuth();
  return <StatsDashboard athleteId={user!.id} />;
}
