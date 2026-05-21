import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Copy, History, KeyRound, Save } from "lucide-react";
import { format, parseISO } from "date-fns";
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

      <EnduranceBenchmarksCard
        userId={userId}
        initial={profileQuery.data}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["profile", userId] });
          qc.invalidateQueries({ queryKey: ["pb-history", userId] });
        }}
      />
    </div>
  );
}

function EnduranceBenchmarksCard({
  userId, initial, onSaved,
}: {
  userId: string;
  initial: { ten_k_pb_seconds: number | null; max_hr: number | null; resting_hr: number | null; ftp_watts: number | null; css_per_100m_seconds: number | null } | null | undefined;
  onSaved: () => void;
}) {
  const [pb, setPb] = useState("");
  const [maxHr, setMaxHr] = useState("");
  const [restHr, setRestHr] = useState("");
  const [ftp, setFtp] = useState("");
  const [css, setCss] = useState("");

  useEffect(() => {
    if (!initial) return;
    setPb(secondsToTimeStr(initial.ten_k_pb_seconds));
    setMaxHr(initial.max_hr?.toString() ?? "");
    setRestHr(initial.resting_hr?.toString() ?? "");
    setFtp(initial.ftp_watts?.toString() ?? "");
    setCss(secondsToTimeStr(initial.css_per_100m_seconds));
  }, [initial]);

  const pbHistory = useQuery({
    queryKey: ["pb-history", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endurance_pb_history")
        .select("id, ten_k_pb_seconds, recorded_at")
        .eq("athlete_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const patch = {
        ten_k_pb_seconds: pb ? parseTimeToSeconds(pb) : null,
        max_hr: maxHr ? Number(maxHr) : null,
        resting_hr: restHr ? Number(restHr) : null,
        ftp_watts: ftp ? Number(ftp) : null,
        css_per_100m_seconds: css ? parseTimeToSeconds(css) : null,
      };
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Endurance profile saved"); onSaved(); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Endurance benchmarks
        </CardTitle>
        <CardDescription>
          Used to estimate pace and heart-rate zones for each RPE. Update Max HR
          and Resting HR after a fresh field test for accurate Karvonen zones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>10k PB (mm:ss)</Label>
            <Input placeholder="42:30" value={pb} onChange={(e) => setPb(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Max HR (bpm)</Label>
            <Input type="number" min={120} max={230} value={maxHr} onChange={(e) => setMaxHr(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Resting HR (bpm)</Label>
            <Input type="number" min={30} max={110} value={restHr} onChange={(e) => setRestHr(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>FTP (watts, bike)</Label>
            <Input type="number" min={50} max={600} value={ftp} onChange={(e) => setFtp(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>CSS pace (m:ss / 100m, swim)</Label>
            <Input placeholder="1:42" value={css} onChange={(e) => setCss(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 h-4 w-4" /> Save benchmarks
          </Button>
        </div>

        {/* 10k PB history */}
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> 10k PB history
          </div>
          {pbHistory.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (pbHistory.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No history yet — save a 10k PB above and it will be recorded here.
            </p>
          ) : (
            <ol className="space-y-1 text-sm">
              {(pbHistory.data ?? []).map((h, i) => {
                const prev = (pbHistory.data ?? [])[i + 1];
                const delta = prev ? h.ten_k_pb_seconds - prev.ten_k_pb_seconds : null;
                return (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-3 rounded border border-border/60 bg-background px-2 py-1.5"
                  >
                    <span className="font-mono font-semibold tabular-nums">
                      {secondsToTimeStr(h.ten_k_pb_seconds)}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {delta != null && (
                        <span
                          className={
                            delta < 0
                              ? "font-medium text-status-peaking"
                              : delta > 0
                              ? "font-medium text-status-exhausted"
                              : ""
                          }
                        >
                          {delta < 0 ? "−" : delta > 0 ? "+" : "±"}
                          {secondsToTimeStr(Math.abs(delta))}
                        </span>
                      )}
                      <span>{format(parseISO(h.recorded_at), "MMM d, yyyy")}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
