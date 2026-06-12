import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stethoscope, HeartPulse, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Mirrors RoleSwitcher: lets a physio enable a "patient view" on their own
 * account (to test exercise plans on themselves) and toggle between the two
 * views. Renders nothing for accounts that are not physios.
 */
export function PhysioRoleSwitcher() {
  const { user, role, roles, refreshRole, setViewMode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const isPhysio = roles.includes("physio");
  if (!isPhysio || !user) return null;

  const hasPatientRole = roles.includes("patient");

  const enablePatientMutation = useMutation({
    mutationFn: async () => {
      // 1. Grant self the patient role.
      const { error: roleErr } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: user.id, role: "patient" },
          { onConflict: "user_id,role" },
        );
      if (roleErr) throw roleErr;

      // 2. Link self as own patient.
      const { data: existing } = await supabase
        .from("physio_patients")
        .select("id")
        .eq("physio_id", user.id)
        .eq("patient_id", user.id)
        .maybeSingle();
      if (!existing) {
        const { error: linkErr } = await supabase
          .from("physio_patients")
          .insert({ physio_id: user.id, patient_id: user.id });
        if (linkErr) throw linkErr;
      }
    },
    onSuccess: async () => {
      await refreshRole();
      qc.invalidateQueries({ queryKey: ["physio-roster"] });
      toast.success("Patient view enabled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const switchTo = (next: "physio" | "patient") => {
    setViewMode(next);
    navigate({ to: next === "physio" ? "/physio" : "/patient" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {role === "physio" ? (
            <Stethoscope className="h-4 w-4" />
          ) : (
            <HeartPulse className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {role === "physio" ? "Physio view" : "Patient view"}
          </span>
          <ArrowRightLeft className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch view</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => switchTo("physio")}
          disabled={role === "physio"}
        >
          <Stethoscope className="mr-2 h-4 w-4" /> Physio view
        </DropdownMenuItem>
        {hasPatientRole ? (
          <DropdownMenuItem
            onClick={() => switchTo("patient")}
            disabled={role === "patient"}
          >
            <HeartPulse className="mr-2 h-4 w-4" /> Patient view
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => enablePatientMutation.mutate()}
            disabled={enablePatientMutation.isPending}
          >
            <HeartPulse className="mr-2 h-4 w-4" />
            {enablePatientMutation.isPending
              ? "Enabling…"
              : "Enable patient view"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
