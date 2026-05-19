import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SharedCalendar } from "@/components/SharedCalendar";

export const Route = createFileRoute("/physio/patients/$patientId/calendar")({
  head: () => ({
    meta: [
      { title: "Patient calendar — EA Training System Physio" },
      { name: "description", content: "Shared rehab calendar for this patient." },
    ],
  }),
  component: PhysioPatientCalendarPage,
});

function PhysioPatientCalendarPage() {
  const { patientId } = useParams({ from: "/physio/patients/$patientId/calendar" });
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/physio/patients/$patientId" params={{ patientId }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shared calendar</h1>
        <p className="text-sm text-muted-foreground">
          Read-only view of what your patient sees. Dashed cards are sessions they haven&apos;t confirmed yet.
        </p>
      </div>
      <SharedCalendar ownerId={patientId} readOnly viewerRole="physio" />
    </div>
  );
}
