import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Gauge, TrendingDown, Users, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EA Training System — Coaching & Rehab Monitoring" },
      {
        name: "description",
        content:
          "A professional platform for coaches, athletes, physiotherapists and patients. Plan, track and monitor progress in one place.",
      },
      { property: "og:title", content: "EA Training System — Coaching & Rehab Monitoring" },
      {
        property: "og:description",
        content:
          "Plan, track and monitor training and rehab progress in one professional platform.",
      },
      { property: "og:url", content: "https://set-smart-guide.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://set-smart-guide.lovable.app/" }],
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
      else if (role === "physio") navigate({ to: "/physio" });
      else if (role === "patient") navigate({ to: "/patient" });
      else if (role === "athlete") navigate({ to: "/today" });
    }
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            EA Training System
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

      <main>
        <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" />
            For coaches, athletes, physiotherapists & their patients
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Plan, track and{" "}
            <span className="text-primary">monitor progress.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            One professional platform to programme training, follow athlete readiness,
            and monitor rehab sessions with patient-reported outcomes.
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Feature
              icon={<Gauge className="h-5 w-5 text-primary" />}
              title="Readiness in real time"
              body="Every set logged converts to a Daily E1RM and EAkoefficient %, surfacing the athlete's current state instantly."
            />
            <Feature
              icon={<TrendingDown className="h-5 w-5 text-primary" />}
              title="Fatigue limit detection"
              body="Each set is compared to the day's reference. A ≥5% drop in E1RM flags that the fatigue limit has been reached."
            />
            <Feature
              icon={<Users className="h-5 w-5 text-primary" />}
              title="Coach-first roster"
              body="See every athlete at a glance with color-coded readiness and a full performance log per athlete."
            />
            <Feature
              icon={<HeartPulse className="h-5 w-5 text-primary" />}
              title="Rehab monitoring"
              body="Physiotherapists prescribe rehab sessions with sets, load, ROM and pain (0–10). Patients log how each session felt."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        EA Training System — performance and rehab, in one place.
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
