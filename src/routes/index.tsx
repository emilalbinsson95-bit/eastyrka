import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Gauge, TrendingDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EAkoefficient — Powerlifting Coaching Platform" },
      {
        name: "description",
        content:
          "Coach powerlifters with the EAkoefficient autoregulation system. Weekly plans, real-time CNS-fatigue tracking, and intra-set volume quality.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user) {
      if (role === "coach") navigate({ to: "/coach" });
      else if (role === "athlete") navigate({ to: "/today" });
    }
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            EAkoefficient
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Built for powerlifting coaches & their athletes
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Stop guessing.{" "}
          <span className="text-primary">Coach with EAkoefficient.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Send weekly training plans, see every athlete's readiness in real time, and
          catch junk volume before it costs them progress.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/signup">Create free account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">I already have one</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Feature
            icon={<Gauge className="h-5 w-5 text-primary" />}
            title="Real-time readiness"
            body="Every set logged converts to a Daily E1RM and EAkoefficient %. Athletes see Exhausted / Adapting / Peaking the moment they save a set."
          />
          <Feature
            icon={<TrendingDown className="h-5 w-5 text-primary" />}
            title="Catches junk volume"
            body="Each set after set 1 is compared to the day's reference. ≥5% drop in E1RM flags Junk volume so the athlete knows when to stop."
          />
          <Feature
            icon={<Users className="h-5 w-5 text-primary" />}
            title="Coach-first roster"
            body="See all your athletes at a glance. Color-coded readiness, last-session warnings, and a full EAkoefficient log per athlete."
          />
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        EAkoefficient — autoregulation for serious lifters.
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          {icon}
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
