import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { SharedCalendar } from "@/components/SharedCalendar";

export const Route = createFileRoute("/_app/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — EA Training System" },
      { name: "description", content: "Shared training calendar between athlete and coach." },
    ],
  }),
  component: AthleteCalendarPage,
});

function AthleteCalendarPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Your shared calendar with your coach. Move sessions to the day that fits you.
        </p>
      </div>
      {user && <SharedCalendar ownerId={user.id} />}
    </div>
  );
}
