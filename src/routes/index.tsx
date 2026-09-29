import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: heroAsset.url },
      { name: "twitter:image", content: heroAsset.url },
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

      <main className="relative flex min-h-[min(75vh,720px)] items-end overflow-hidden border-b border-border bg-ink">
        <img src={heroAsset.url} alt="Barbell in a training space" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-32 sm:pb-20">
          <h1 className="text-5xl font-bold text-paper sm:text-7xl">SETPOINT</h1>
          <p className="mt-4 max-w-lg text-lg text-paper">Training, coaching and rehabilitation in one place.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/login">Sign in</Link></Button>
            <Button asChild size="lg" variant="secondary"><Link to="/signup">Create account</Link></Button>
          </div>
        </div>
      </main>
    </div>
  );
}
