import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { StatsDashboard } from "@/components/StatsDashboard";

export const Route = createFileRoute("/_app/stats")({
  head: () => ({
    meta: [
      {title: "Min statistik — SETPOINT"},
      {name: "description", content: "EAk per lyft, samlad belastning, personbästa, DOTS och kroppsvikt."},
      {property: "og:title", content: "Min statistik — SETPOINT"},
      {property: "og:description", content: "EAk per lyft, samlad belastning, personbästa, DOTS och kroppsvikt."},
      {property: "og:type", content: "website"},
      {name: "twitter:card", content: "summary"},
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <StatsDashboard athleteId={user.id} />;
}
