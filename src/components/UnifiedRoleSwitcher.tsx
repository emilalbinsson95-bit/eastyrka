import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Dumbbell,
  Stethoscope,
  HeartPulse,
  ArrowRightLeft,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
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
 * Unified switcher for all four roles (coach / athlete / physio / patient).
 *
 * - For each role the user already holds → "Switch to <role> view".
 * - For each role the user does NOT hold → "Enable <role> view" which
 *   grants the role and (where relevant) self-links in coach_athletes /
 *   physio_patients so the user can program for / treat themselves.
 *
 * Renders nothing if the account holds no roles yet (loading state).
 */

const ROLE_META: Record<
  AppRole,
  {
    label: string;
    Icon: typeof Users;
    route: "/coach" | "/today" | "/physio" | "/patient";
  }
> = {
  coach: { label: "Coach view", Icon: Users, route: "/coach" },
  athlete: { label: "Athlete view", Icon: Dumbbell, route: "/today" },
  physio: { label: "Physio view", Icon: Stethoscope, route: "/physio" },
  patient: { label: "Patient view", Icon: HeartPulse, route: "/patient" },
};

const ROLE_ORDER: AppRole[] = ["coach", "athlete", "physio", "patient"];

export function UnifiedRoleSwitcher() {
  const { user, role, roles, refreshRole, setViewMode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (!user || roles.length === 0) return null;

  const enableMutation = useMutation({
    mutationFn: async (target: AppRole) => {
      const { error: roleErr } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: user.id, role: target },
          { onConflict: "user_id,role" },
        );
      if (roleErr) throw roleErr;

      // Self-link so the user can program / treat themselves.
      if (target === "athlete") {
        const { data: existing } = await supabase
          .from("coach_athletes")
          .select("id")
          .eq("coach_id", user.id)
          .eq("athlete_id", user.id)
          .maybeSingle();
        if (!existing) {
          await supabase
            .from("coach_athletes")
            .insert({ coach_id: user.id, athlete_id: user.id });
        }
      }
      if (target === "patient") {
        const { data: existing } = await supabase
          .from("physio_patients")
          .select("id")
          .eq("physio_id", user.id)
          .eq("patient_id", user.id)
          .maybeSingle();
        if (!existing) {
          await supabase
            .from("physio_patients")
            .insert({ physio_id: user.id, patient_id: user.id });
        }
      }
    },
    onSuccess: async (_data, target) => {
      await refreshRole();
      qc.invalidateQueries({ queryKey: ["roster"] });
      qc.invalidateQueries({ queryKey: ["physio-roster"] });
      toast.success(`${ROLE_META[target].label} enabled`);
      setViewMode(target);
      navigate({ to: ROLE_META[target].route });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const switchTo = (next: AppRole) => {
    setViewMode(next);
    navigate({ to: ROLE_META[next].route });
  };

  const CurrentIcon = role ? ROLE_META[role].Icon : ArrowRightLeft;
  const currentLabel = role ? ROLE_META[role].label : "Switch view";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <CurrentIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{currentLabel}</span>
          <ArrowRightLeft className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch view</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLE_ORDER.map((r) => {
          const { label, Icon } = ROLE_META[r];
          const has = roles.includes(r);
          if (has) {
            return (
              <DropdownMenuItem
                key={r}
                onClick={() => switchTo(r)}
                disabled={role === r}
              >
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </DropdownMenuItem>
            );
          }
          return (
            <DropdownMenuItem
              key={r}
              onClick={() => enableMutation.mutate(r)}
              disabled={enableMutation.isPending}
            >
              <Plus className="mr-2 h-4 w-4 opacity-60" />
              <span className="text-muted-foreground">Enable {label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
