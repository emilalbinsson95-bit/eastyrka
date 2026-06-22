import { createFileRoute, Link } from "@tanstack/react-router";
import { Gauge, TrendingDown, LineChart, Microscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import logoAsset from "@/assets/setpoint-logo.png.asset.json";
import heroAsset from "@/assets/setpoint-hero.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SETPOINT — Train at your readiness" },
      {
        name: "description",
        content:
          "The readiness baseline for strength. Per-set fatigue-limit detection and EAkoefficient readiness for serious lifters and their coaches.",
      },
      { property: "og:title", content: "SETPOINT — Train at your readiness" },
      {
        property: "og:description",
        content:
          "The readiness baseline for strength. Every set tells you if you should push or pull back.",
      },
      { property: "og:url", content: "https://eastyrka.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://eastyrka.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "SETPOINT",
          applicationCategory: "HealthApplication",
          operatingSystem: "Web, iOS, Android",
          description:
            "Per-set readiness tracking and fatigue-limit detection for serious lifters and strength coaches.",
          url: "https://eastyrka.lovable.app/",
          image: "https://eastyrka.lovable.app/__l5e/assets-v1/4bf5e6a5-90ae-4231-a3ba-35d301d670a7/setpoint-logo.png",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList: [
            "EAkoefficient — per-set readiness as a percentage of your baseline",
            "Fatigue-limit detection (≥5% E1RM drop signals the limit)",
            "Mesocycle planning and load progression",
            "Coach roster with color-coded readiness across athletes",
          ],
        }),
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
      else if (role === "physio") navigate({ to: "/physio" });
      else if (role === "patient") navigate({ to: "/patient" });
      else if (role === "athlete") navigate({ to: "/today" });
    }
  }, [user, role, loading, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-mono text-sm font-bold tracking-[0.18em]">
            <img
              src={logoAsset.url}
              alt="SETPOINT"
              width={28}
              height={28}
              className="h-7 w-7 rounded-sm"
            />
            SETPOINT
          </Link>
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
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:py-28 md:grid-cols-2">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                For serious lifters &amp; their coaches
              </div>
              <h1 className="text-balance text-5xl font-bold tracking-tight sm:text-6xl">
                Train at your{" "}
                <span className="text-primary">readiness.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                SETPOINT is the readiness baseline for strength. Every set is
                measured against your baseline E1RM — when the drop hits 5%,
                you&apos;ve hit your fatigue limit. Push or pull back, on data.
              </p>
              <div className="mt-8 flex items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/signup">Create free account</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">I already have one</Link>
                </Button>
              </div>
              <div className="mt-8 flex items-center gap-6 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>EAkoefficient</span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span>Fatigue-limit detection</span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span>Mesocycles</span>
              </div>
            </div>
            <div className="relative">
              <img
                src={heroAsset.url}
                alt="Calibrated barbell with a readiness baseline traced across it"
                width={1920}
                height={1080}
                className="aspect-[16/10] w-full rounded-lg border border-border object-cover shadow-2xl"
              />
            </div>
          </div>
        </section>

        {/* Stat strip */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden md:grid-cols-4">
            <Stat value="≥5%" label="E1RM drop = fatigue limit" />
            <Stat value="1 set" label="Time to recalibrate readiness" />
            <Stat value="0–100%" label="EAkoefficient range" />
            <Stat value="2" label="Roles in one workspace" />
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-10 max-w-2xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              What it does
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              A lab instrument for the rack.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
            <Feature
              icon={<Gauge className="h-5 w-5" />}
              title="Readiness, per set"
              body="Each set logged converts to a Daily E1RM and an EAkoefficient — your readiness as a percentage of baseline."
            />
            <Feature
              icon={<TrendingDown className="h-5 w-5" />}
              title="Fatigue-limit detection"
              body="A ≥5% drop in E1RM flags the limit. Stop guessing when to cut the set."
            />
            <Feature
              icon={<LineChart className="h-5 w-5" />}
              title="Mesocycles that hold up"
              body="Plan blocks, log against the plan, and watch progression drift surface in the dashboard."
            />
            <Feature
              icon={<Microscope className="h-5 w-5" />}
              title="Coach roster, color-coded"
              body="See every athlete's readiness at a glance. Open one and get the full session log."
            />
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
              The method
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Baseline. Compare. Decide.
            </h2>
            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              <Step n="01" title="Set the baseline">
                A short calibration block sets your daily E1RM baseline per
                lift. This is your setpoint.
              </Step>
              <Step n="02" title="Log every set">
                Weight × reps × RPE → Daily E1RM. The EAkoefficient updates
                live as a percentage of baseline.
              </Step>
              <Step n="03" title="Stop at the limit">
                A 5% drop signals the fatigue limit. Stop, taper, or push —
                with the number in front of you.
              </Step>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>SETPOINT</span>
          <span>Train at your readiness.</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-background p-6 text-center">
      <div className="font-mono text-3xl font-bold tracking-tight text-primary">
        {value}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
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
    <Card className="rounded-none border-0 bg-background shadow-none">
      <CardContent className="space-y-3 p-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-primary pl-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
        {n}
      </div>
      <h3 className="mt-2 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
