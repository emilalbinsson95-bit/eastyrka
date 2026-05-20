import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Bucket {
  sec: number;
  m: number;
  samples: number;
}

function emptyBucket(): Bucket {
  return { sec: 0, m: 0, samples: 0 };
}

function fmtPace(secPerKm: number | null): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

/**
 * Compact card on the coach's athlete page that estimates this athlete's
 * actual running pace at each RPE 1–10, learned from their logged sessions.
 * Prefers interval-level samples (e.g. the tempo block of a workout) over
 * whole-session averages so a 6×1 km @ RPE 8 stays at RPE 8.
 */
export function RpePaceEstimateCard({
  athleteId,
  days = 180,
}: {
  athleteId: string;
  days?: number;
}) {
  const query = useQuery({
    queryKey: ["rpe-pace-estimate", athleteId, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data: sessions, error } = await supabase
        .from("endurance_sessions")
        .select(
          "id, date, discipline, status, actual_total_seconds, actual_distance_m, overall_rpe, peak_rpe",
        )
        .eq("athlete_id", athleteId)
        .eq("discipline", "run")
        .eq("status", "completed")
        .gte("date", format(since, "yyyy-MM-dd"));
      if (error) throw error;
      const list = sessions ?? [];
      const ids = list.map((s) => s.id);
      let steps: Array<{
        session_id: string;
        discipline: string | null;
        actual_duration_seconds: number | null;
        actual_distance_m: number | null;
        actual_avg_rpe: number | null;
      }> = [];
      if (ids.length) {
        const { data: stepData, error: sErr } = await supabase
          .from("endurance_steps")
          .select(
            "session_id, discipline, actual_duration_seconds, actual_distance_m, actual_avg_rpe",
          )
          .in("session_id", ids);
        if (sErr) throw sErr;
        steps = stepData ?? [];
      }

      // Interval samples (preferred)
      const sessionsWithSteps = new Set<string>();
      const samples: Array<{ sec: number; m: number; rpe: number }> = [];
      for (const st of steps) {
        if ((st.discipline ?? "run") !== "run") continue;
        const sec = Number(st.actual_duration_seconds ?? 0);
        const m = Number(st.actual_distance_m ?? 0);
        const rpe = st.actual_avg_rpe != null ? Number(st.actual_avg_rpe) : null;
        if (sec <= 0 || m <= 0 || rpe == null) continue;
        sessionsWithSteps.add(st.session_id);
        samples.push({ sec, m, rpe });
      }

      // Whole-session fallback for sessions with no interval RPE samples
      for (const s of list) {
        if (sessionsWithSteps.has(s.id)) continue;
        const sec = Number(s.actual_total_seconds ?? 0);
        const m = Number(s.actual_distance_m ?? 0);
        const rpe = s.overall_rpe ?? s.peak_rpe;
        if (sec <= 0 || m <= 0 || rpe == null) continue;
        samples.push({ sec, m, rpe: Number(rpe) });
      }

      const buckets: Record<number, Bucket> = {};
      for (let i = 1; i <= 10; i++) buckets[i] = emptyBucket();
      for (const s of samples) {
        const r = Math.max(1, Math.min(10, Math.round(s.rpe)));
        buckets[r].sec += s.sec;
        buckets[r].m += s.m;
        buckets[r].samples += 1;
      }

      const rows = Array.from({ length: 10 }, (_, i) => {
        const r = i + 1;
        const b = buckets[r];
        const paceSec = b.m > 0 ? b.sec / (b.m / 1000) : null;
        return {
          rpe: r,
          paceSec,
          paceLabel: fmtPace(paceSec),
          samples: b.samples,
          km: b.m / 1000,
        };
      });

      return {
        rows,
        sampledFromSteps: sessionsWithSteps.size > 0,
        totalSamples: samples.length,
      };
    },
  });

  const data = query.data;
  const hasAny = useMemo(
    () => !!data && data.rows.some((r) => r.samples > 0),
    [data],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" />
          Estimated run pace by RPE
        </CardTitle>
        <CardDescription>
          {data?.sampledFromSteps
            ? `Learned from ${data.totalSamples} interval samples in the last ${days} days — tempo and threshold blocks counted separately, not blended.`
            : `Learned from this athlete's last ${days} days of logged runs.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !hasAny ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Not enough logged runs with RPE yet — estimates will appear here as the
            athlete logs more sessions.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {data!.rows.map((r) => {
              const muted = r.samples === 0;
              return (
                <div
                  key={r.rpe}
                  className={
                    "rounded-md border border-border bg-muted/20 px-2.5 py-2 " +
                    (muted ? "opacity-40" : "")
                  }
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    RPE {r.rpe}
                  </div>
                  <div className="text-base font-semibold tabular-nums">
                    {r.paceLabel}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.samples > 0
                      ? `${r.samples} ${r.samples === 1 ? "sample" : "samples"} · ${r.km.toFixed(1)} km`
                      : "no data"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
