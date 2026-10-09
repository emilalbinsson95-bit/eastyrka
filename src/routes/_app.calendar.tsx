import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { SharedCalendar } from "@/components/SharedCalendar";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — SETPOINT" },
      { name: "description", content: "Shared training calendar between athlete and coach." },
      { property: "og:title", content: "Kalender — SETPOINT" },
      { property: "og:description", content: "Träning, tävlingar och betalningspåminnelser i din kalender." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AthleteCalendarPage,
});

function AthleteCalendarPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("calendar.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("calendar.pageDescription")}
        </p>
      </div>
      {user && <SharedCalendar ownerId={user.id} />}
    </div>
  );
}
