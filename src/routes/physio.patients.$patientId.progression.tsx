import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ProgressionDashboard } from "@/components/ProgressionDashboard";

export const Route = createFileRoute("/physio/patients/$patientId/progression")({
  head: () => ({
    meta: [
      {title: "Rehabprogression — SETPOINT"},
      {name: "description", content: "Separata belastningsserier, smärtgräns och sidsymmetri i rehabuppföljningen."},
      {property: "og:title", content: "Rehabprogression — SETPOINT"},
      {property: "og:description", content: "Separata belastningsserier, smärtgräns och sidsymmetri i rehabuppföljningen."},
      {property: "og:type", content: "website"},
      {name: "twitter:card", content: "summary"},
    ],
  }),
  component: PhysioPatientProgressionPage,
});

function PhysioPatientProgressionPage() {
  const { patientId } = useParams({
    from: "/physio/patients/$patientId/progression",
  });
  const profile = useQuery({
    queryKey: ["patient-profile-name", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", patientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/physio/patients/$patientId" params={{ patientId }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to patient
        </Link>
      </Button>
      <ProgressionDashboard
        patientId={patientId}
        canEdit
        patientName={profile.data?.full_name ?? undefined}
      />
    </div>
  );
}
