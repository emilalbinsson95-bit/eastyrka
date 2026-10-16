import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, RotateCcw, Star, ThumbsDown, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getRoutine, ROUTINE_LABEL, type RoutineId } from "@/lib/routines";

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

let audioCtx: AudioContext | null = null;

/** Must be called from a tap so iOS allows sound later. */
function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    // Silent blip to fully unlock on iOS.
    const g = audioCtx.createGain();
    g.gain.value = 0.0001;
    const o = audioCtx.createOscillator();
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.01);
  } catch {
    /* ignore */
  }
}

function beep(count = 3) {
  try {
    navigator.vibrate?.([250, 120, 250, 120, 250]);
    const ctx = audioCtx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + i * 0.3;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.22);
    }
  } catch {
    /* ignore */
  }
}

type Lock = { release: () => Promise<void>; released?: boolean };

function useWakeLock() {
  const lock = useRef<Lock | null>(null);
  const request = async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<Lock> } }).wakeLock;
      if (!wl || (lock.current && !lock.current.released)) return;
      lock.current = await wl.request("screen");
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    void request();
    const onVis = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock.current?.release().catch(() => {});
      lock.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return request;
}

export function useStarCount(athleteId: string) {
  return useQuery({
    queryKey: ["routine-stars", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routine_completions")
        .select("routine")
        .eq("athlete_id", athleteId);
      if (error) throw error;
      const rows = data ?? [];
      const thumbs = rows.filter((r) => r.routine === "skipped").length;
      return { stars: rows.length - thumbs, thumbs };
    },
  });
}

export function RoutineScore({ athleteId }: { athleteId: string }) {
  const q = useStarCount(athleteId);
  return (
    <span className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="flex items-center gap-1" title="Genomförda flöden">
        <Star className="h-4 w-4 fill-star text-star" /> {q.data?.stars ?? 0}
      </span>
      <span className="flex items-center gap-1" title="Överhoppade">
        <ThumbsDown className="h-4 w-4" /> {q.data?.thumbs ?? 0}
      </span>
    </span>
  );
}

export function RoutineLauncher({
  athleteId,
  onComplete,
  onSkip,
}: {
  athleteId: string;
  onComplete?: () => void;
  onSkip?: () => void;
}) {
  const [active, setActive] = useState<RoutineId | null>(null);
  const qc = useQueryClient();
  const skip = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("routine_completions")
        .insert({ athlete_id: athleteId, routine: "skipped" });
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["routine-stars", athleteId] });
      toast("Tumme ned 👎 Uppvärmningen hoppades över.");
      onSkip?.();
    },
  });
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Kör rörlighet eller uppvärmning innan dagens pass</p>
        <RoutineScore athleteId={athleteId} />
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ROUTINE_LABEL) as RoutineId[]).map((id) => (
          <Button key={id} variant="outline" size="sm" onClick={() => setActive(id)}>
            {ROUTINE_LABEL[id]}
          </Button>
        ))}
      </div>
      {onSkip && (
        <button
          type="button"
          className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
          disabled={skip.isPending}
          onClick={() => skip.mutate()}
        >
          Hoppa över för idag (ger en tumme ned)
        </button>
      )}
      {active && (
        <RoutinePlayer
          athleteId={athleteId}
          routine={active}
          onClose={() => setActive(null)}
          onComplete={onComplete}
        />
      )}
    </div>
  );
}

function RoutinePlayer({
  athleteId,
  routine,
  onClose,
  onComplete,
}: {
  athleteId: string;
  routine: RoutineId;
  onClose: () => void;
  onComplete?: () => void;
}) {
  const steps = getRoutine(routine);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState<number | null>(steps[0].seconds);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();
  const stars = useStarCount(athleteId);
  const timer = useRef<number | null>(null);
  const step = steps[idx];

  const [side, setSide] = useState<1 | 2>(1);
  const keepAwake = useWakeLock();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => {
      setLeft((l) => (l == null || l <= 0 ? l : l - 1));
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [running]);

  useEffect(() => {
    if (!running || left !== 0) return;
    beep();
    if (step.sides && side === 1) {
      setSide(2);
      setLeft(step.seconds);
    } else {
      setRunning(false);
    }
  }, [left, running, side, step]);

  const toggle = () => {
    unlockAudio();
    void keepAwake();
    setRunning((r) => !r);
  };

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
    setSide(1);
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
          <p className="text-muted-foreground">Du fick en guldstjärna. Du har {save.isSuccess ? (stars.data?.stars ?? 0) : "…"} totalt.</p>
          <Button size="lg" onClick={() => { onComplete?.(); onClose(); }}>Till dagens pass</Button>
        </div>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 text-center">
            <h2 className="text-3xl font-semibold">{step.title}</h2>
            <p className="text-lg leading-relaxed text-muted-foreground">{step.text}</p>
            {step.seconds != null && left != null && (
              <div className="flex flex-col items-center gap-4">
                {step.sides && (
                  <div className="text-lg font-medium">
                    {side === 1 ? "Första sidan" : "Andra sidan"} <span className="text-muted-foreground">({side}/2)</span>
                  </div>
                )}
                <div className={`font-mono text-7xl tabular-nums ${left === 0 ? "text-primary" : ""}`}>{fmt(left)}</div>
                <div className="flex gap-2">
                  <Button size="lg" onClick={toggle} disabled={left === 0}>
                    {running ? <Pause className="mr-2 h-5 w-5" /> : <Play className="mr-2 h-5 w-5" />}
                    {running ? "Pausa" : "Starta"}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => { setRunning(false); setSide(1); setLeft(step.seconds); }} aria-label="Börja om">
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
