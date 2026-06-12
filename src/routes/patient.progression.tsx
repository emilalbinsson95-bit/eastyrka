import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { ProgressionDashboard } from "@/components/ProgressionDashboard";

export const Route = createFileRoute("/patient/progression")({
  head: () => ({
    meta: [
      { title: "My progression — EA" },
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
  return <ProgressionDashboard patientId={user!.id} canEdit={false} />;
}
