import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SharedCalendar } from "@/components/SharedCalendar";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/coach/athletes/$athleteId/calendar")({
  head: () => ({
    meta: [
      { title: "Athlete calendar — SETPOINT Coach" },
      { name: "description", content: "Shared training calendar for this athlete." },
      { property: "og:title", content: "Atletkalender — SETPOINT Coach" },
      { property: "og:description", content: "Atletens träning, tävlingar och betalningsdagar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CoachAthleteCalendarPage,
});

function CoachAthleteCalendarPage() {
  const { t } = useTranslation();
  const { athleteId } = useParams({ from: "/coach/athletes/$athleteId/calendar" });
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/coach/athletes/$athleteId" params={{ athleteId }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> {t("actions.back")}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("calendar.coachTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("calendar.coachDescription")}
        </p>
      </div>
      <SharedCalendar ownerId={athleteId} readOnly viewerRole="coach" />
    </div>
  );
}
