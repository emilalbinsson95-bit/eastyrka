import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Copy, KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { parseTimeToSeconds, secondsToTimeStr } from "@/lib/endurancePaceHr";

export const Route = createFileRoute("/_app/me")({
  head: () => ({
    meta: [
      { title: "My Profile — EA Training System" },
      { name: "description", content: "Your profile and current 1RM baselines." },
    ],
  }),
  component: MePage,
});

function MePage() {
  const { user } = useAuth();
  const userId = user!.id;

  const qc = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, weight_class, ten_k_pb_seconds, max_hr, resting_hr, ftp_watts, css_per_100m_seconds")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const baselinesQuery = useQuery({
    queryKey: ["baselines", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baselines")
        .select("exercise, one_rm_kg, updated_at")
        .eq("athlete_id", userId)
        .order("exercise", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your account info and current baselines (managed by your coach).
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Your athlete code
          </CardTitle>
          <CardDescription>
            Share this code with your coach so they can connect your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-xs sm:text-sm">
              {userId}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(userId);
                toast.success("Athlete code copied");
              }}
            >
              <Copy className="mr-1 h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Name: </span>
            <span className="font-medium">
              {profileQuery.data?.full_name ?? "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Weight class: </span>
            <span className="font-medium">
              {profileQuery.data?.weight_class ?? "Not set"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1RM Baselines</CardTitle>
          <CardDescription>
            These power your EAkoefficient. Ask your coach to update them after a new
            tested 1RM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {baselinesQuery.data && baselinesQuery.data.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {baselinesQuery.data.map((b) => (
                <div
                  key={b.exercise}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="text-xs text-muted-foreground">{b.exercise}</div>
                  <div className="text-lg font-bold">{b.one_rm_kg} kg</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No baselines set yet. Your coach will configure these.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
