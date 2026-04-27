import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Dumbbell, ArrowRightLeft } from "lucide-react";
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
 * Lets a coach enable an athlete view of the app on their own account
 * (so they can test plans on themselves) and switch between Coach and Athlete views.
 *
 * Renders nothing for accounts that hold only the athlete role.
 */
export function RoleSwitcher() {
  const { user, role, roles, isCoach, refreshRole, setViewMode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Hide entirely for athlete-only accounts.
  if (!isCoach || !user) return null;

  const hasAthleteRole = roles.includes("athlete");

  const enableAthleteMutation = useMutation({
    mutationFn: async () => {
      // 1. Grant self the athlete role (idempotent via UPSERT)
      const { error: roleErr } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: user.id, role: "athlete" },
          { onConflict: "user_id,role" },
        );
      if (roleErr) throw roleErr;

      // 2. Link self as own athlete in coach_athletes (so the coach can program for themselves)
      const { data: existing } = await supabase
        .from("coach_athletes")
        .select("id")
        .eq("coach_id", user.id)
        .eq("athlete_id", user.id)
        .maybeSingle();
      if (!existing) {
        const { error: linkErr } = await supabase
          .from("coach_athletes")
          .insert({ coach_id: user.id, athlete_id: user.id });
        if (linkErr) throw linkErr;
      }
    },
    onSuccess: async () => {
      await refreshRole();
      qc.invalidateQueries({ queryKey: ["roster"] });
      toast.success("Athlete view enabled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const switchTo = (next: "coach" | "athlete") => {
    setViewMode(next);
    navigate({ to: next === "coach" ? "/coach" : "/today" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {role === "coach" ? (
            <Users className="h-4 w-4" />
          ) : (
            <Dumbbell className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {role === "coach" ? "Coach view" : "Athlete view"}
          </span>
          <ArrowRightLeft className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch view</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => switchTo("coach")}
          disabled={role === "coach"}
        >
          <Users className="mr-2 h-4 w-4" />
          Coach view
        </DropdownMenuItem>
        {hasAthleteRole ? (
          <DropdownMenuItem
            onClick={() => switchTo("athlete")}
            disabled={role === "athlete"}
          >
            <Dumbbell className="mr-2 h-4 w-4" />
            Athlete view
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => enableAthleteMutation.mutate()}
            disabled={enableAthleteMutation.isPending}
          >
            <Dumbbell className="mr-2 h-4 w-4" />
            {enableAthleteMutation.isPending
              ? "Enabling…"
              : "Enable athlete view"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
