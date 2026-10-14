import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, RotateCcw, Star, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getRoutine, ROUTINE_LABEL, type RoutineId } from "@/lib/routines";

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
    navigator.vibrate?.(300);
  } catch {
    /* ignore */
  }
}

export function useStarCount(athleteId: string) {
  return useQuery({
    queryKey: ["routine-stars", athleteId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("routine_completions")
        .select("id", { count: "exact", head: true })
        .eq("athlete_id", athleteId);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function RoutineLauncher({ athleteId }: { athleteId: string }) {
  const [active, setActive] = useState<RoutineId | null>(null);
  const stars = useStarCount(athleteId);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Kör rörlighet eller uppvärmning</p>
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Star className="h-4 w-4 fill-star text-star" /> {stars.data ?? 0}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ROUTINE_LABEL) as RoutineId[]).map((id) => (
          <Button key={id} variant="outline" size="sm" onClick={() => setActive(id)}>
            {ROUTINE_LABEL[id]}
          </Button>
        ))}
      </div>
      {active && <RoutinePlayer athleteId={athleteId} routine={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function RoutinePlayer({ athleteId, routine, onClose }: { athleteId: string; routine: RoutineId; onClose: () => void }) {
  const steps = getRoutine(routine);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState<number | null>(steps[0].seconds);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();
  const stars = useStarCount(athleteId);
  const timer = useRef<number | null>(null);
  const step = steps[idx];

  useEffect(() => {
    document.body.style.overflow = "hidden";
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      document.body.style.overflow = "";
      lock?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => {
      setLeft((l) => {
        if (l == null) return l;
        if (l <= 1) {
          setRunning(false);
          beep();
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("routine_completions").insert({ athlete_id: athleteId, routine });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routine-stars", athleteId] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const go = (n: number) => {
    setRunning(false);
    if (n >= steps.length) {
      setDone(true);
      save.mutate();
      return;
    }
    setIdx(n);
    setLeft(steps[n].seconds);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {done ? ROUTINE_LABEL[routine] : `${idx + 1} / ${steps.length} · ${ROUTINE_LABEL[routine]}`}
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <Star className="h-28 w-28 fill-star text-star" />
          <h2 className="text-2xl font-semibold">Klart!</h2>
          <p className="text-muted-foreground">Du fick en guldstjärna. Du har {save.isSuccess ? (stars.data ?? 0) : "…"} totalt.</p>
          <Button size="lg" onClick={onClose}>Stäng</Button>
        </div>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 text-center">
            <h2 className="text-3xl font-semibold">{step.title}</h2>
            <p className="text-lg leading-relaxed text-muted-foreground">{step.text}</p>
            {step.seconds != null && left != null && (
              <div className="flex flex-col items-center gap-4">
                <div className={`font-mono text-7xl tabular-nums ${left === 0 ? "text-primary" : ""}`}>{fmt(left)}</div>
                <div className="flex gap-2">
                  <Button size="lg" onClick={() => setRunning((r) => !r)} disabled={left === 0}>
                    {running ? <Pause className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
                    {running ? "Pausa" : "Starta"}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => { setRunning(false); setLeft(step.seconds); }} aria-label="Börja om">
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          {idx + 1 < steps.length && (
            <p className="mb-3 text-center text-sm text-muted-foreground">Nästa: {steps[idx + 1].title}</p>
          )}
          <div className="mx-auto flex w-full max-w-xl gap-2">
            <Button variant="outline" size="lg" className="flex-1" disabled={idx === 0} onClick={() => go(idx - 1)}>
              Föregående
            </Button>
            <Button size="lg" className="flex-1" onClick={() => go(idx + 1)}>
              {idx + 1 === steps.length ? "Klar" : "Nästa"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
