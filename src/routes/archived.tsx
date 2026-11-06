import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/archived")({
  head: () => ({
    meta: [
      { title: "Patient och fysio pausade — SETPOINT" },
      { name: "description", content: "Patient- och fysiodelarna i SETPOINT är tillfälligt arkiverade. Sparade uppgifter finns kvar." },
      { property: "og:title", content: "Patient och fysio pausade — SETPOINT" },
      { property: "og:description", content: "Patient- och fysiodelarna är tillfälligt pausade. Sparade uppgifter finns kvar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ArchivedPage,
});

function ArchivedPage() {
  const { roles, setViewMode, signOut } = useAuth();
  const activeRole = roles.includes("coach") ? "coach" : roles.includes("athlete") ? "athlete" : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md space-y-5">
        <Archive className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold">SETPOINT</p>
        <h1 className="text-2xl font-semibold">Patient och fysio är pausade</h1>
        <p className="text-muted-foreground">Delarna är tillfälligt arkiverade och går inte att öppna. Konton, rehabplaner och historik finns kvar.</p>
        <div className="flex flex-wrap gap-3">
          {activeRole ? (
            <Button asChild onClick={() => setViewMode(activeRole)}>
              <Link to={activeRole === "coach" ? "/coach" : "/today"}>{activeRole === "coach" ? "Till coachvyn" : "Till dagens pass"}</Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={async () => { await signOut(); window.location.assign("/login"); }}>Till inloggningen</Button>
        </div>
      </div>
    </main>
  );
}