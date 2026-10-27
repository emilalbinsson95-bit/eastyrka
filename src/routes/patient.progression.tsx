import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { ProgressionDashboard } from "@/components/ProgressionDashboard";

export const Route = createFileRoute("/patient/progression")({
  head: () => ({
    meta: [
      { title: "Min rehabprogression — SETPOINT" },
      { property: "og:title", content: "Min rehabprogression — SETPOINT" },
      { property: "og:description", content: "Belastning, smärta och funktionstester över tid." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Your rehab progression: exercises, stiffness, function tests and adherence.",
      },
    ],
  }),
  component: PatientProgressionPage,
});

function PatientProgressionPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <ProgressionDashboard patientId={user.id} canEdit={false} />;
}
