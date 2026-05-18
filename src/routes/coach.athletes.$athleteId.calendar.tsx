import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SharedCalendar } from "@/components/SharedCalendar";

export const Route = createFileRoute("/coach/athletes/$athleteId/calendar")({
  head: () => ({
    meta: [
      { title: "Athlete calendar — EA Training System Coach" },
      { name: "description", content: "Shared training calendar for this athlete." },
    ],
  }),
  component: CoachAthleteCalendarPage,
});

function CoachAthleteCalendarPage() {
  const { athleteId } = useParams({ from: "/coach/athletes/$athleteId/calendar" });
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/coach/athletes/$athleteId" params={{ athleteId }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shared calendar</h1>
        <p className="text-sm text-muted-foreground">
          Read-only view of what your athlete sees. Dashed cards are sessions they haven&apos;t confirmed yet.
        </p>
      </div>
      <SharedCalendar ownerId={athleteId} readOnly />
    </div>
  );
}
