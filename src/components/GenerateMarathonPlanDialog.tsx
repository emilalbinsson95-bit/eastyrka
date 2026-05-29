import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, addDays, startOfWeek } from "date-fns";
import { Sparkles, Calendar as CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { parseTimeToSeconds, fmtMSS } from "@/lib/endurancePaceHr";
import { generate20WeekMarathonPlan } from "@/lib/marathonPlanGenerator";

export function GenerateMarathonPlanDialog({
  athleteId,
  coachId,
  athleteName,
  athletePb10k,
  onCreated,
}: {
  athleteId: string;
  coachId: string;
  athleteName: string;
  athletePb10k: number | null;
  onCreated?: (mesoId: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const nextMonday = useMemo(
    () => format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7), "yyyy-MM-dd"),
    [],
  );
  const [startDate, setStartDate] = useState(nextMonday);
  const [daysPerWeek, setDaysPerWeek] = useState<"4" | "5" | "6">("5");
  const [pbInput, setPbInput] = useState(athletePb10k ? fmtMSS(athletePb10k) : "45:00");

  const pbSeconds = useMemo(() => parseTimeToSeconds(pbInput) ?? 0, [pbInput]);
  const pbValid = pbSeconds >= 1500 && pbSeconds <= 14400;

  const preview = useMemo(() => {
    if (!pbValid) return null;
    return generate20WeekMarathonPlan({
      startMonday: startDate,
      tenKPbSeconds: pbSeconds,
      daysPerWeek: Number(daysPerWeek) as 4 | 5 | 6,
    });
  }, [startDate, pbSeconds, daysPerWeek, pbValid]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("Invalid input");

      // 1. Create mesocycle
      const { data: meso, error: mesoErr } = await supabase
        .from("mesocycles")
        .insert({
          coach_id: coachId,
          athlete_id: athleteId,
          name: `Marathon ${format(new Date(preview.raceDate), "MMM yyyy")}`,
          goal: `20-week marathon block — race ${preview.raceDate}`,
          start_date: preview.startDate,
          total_weeks: 20,
          days_per_week: Number(daysPerWeek),
          notes: `Pfitzinger × Daniels × 80/20 polarized. Scaled to 10k PB ${fmtMSS(pbSeconds)}.`,
        })
        .select("id")
        .single();
      if (mesoErr) throw mesoErr;
      const mesoId = meso.id;

      // 2. Create endurance_sessions in bulk
      const sessionRows = preview.sessions
        .filter((s) => s.type !== "rest")
        .map((s) => ({
          athlete_id: athleteId,
          coach_id: coachId,
          date: s.date,
          discipline: s.discipline,
          mode: s.mode,
          title: s.title,
          planned_total_seconds: s.planned_total_seconds || null,
          planned_avg_rpe: s.planned_avg_rpe || null,
          notes: s.notes || null,
          status: "planned",
        }));

      const { data: insertedSessions, error: sessErr } = await supabase
        .from("endurance_sessions")
        .insert(sessionRows)
        .select("id, date, title");
      if (sessErr) throw sessErr;

      // Map back: (date+title) → id (titles unique within a session date in this plan)
      const idByKey = new Map<string, string>();
      for (const row of insertedSessions ?? []) {
        idByKey.set(`${row.date}__${row.title}`, row.id);
      }

      // 3. Insert steps per session, two passes (groups first, then children with parent_id)
      for (const s of preview.sessions) {
        if (s.type === "rest" || s.steps.length === 0) continue;
        const sessionId = idByKey.get(`${s.date}__${s.title}`);
        if (!sessionId) continue;

        // Pass 1: top-level steps (no parent_local_id)
        const topLevel = s.steps.filter((st) => !st.parent_local_id);
        const topRows = topLevel.map((st) => ({
          session_id: sessionId,
          parent_id: null as string | null,
          order_index: st.order_index,
          is_group: st.is_group,
          repeat_count: st.repeat_count,
          discipline: st.discipline,
          duration_seconds: st.duration_seconds,
          target_rpe: st.target_rpe,
          notes: st.notes,
        }));
        const { data: insertedTop, error: topErr } = await supabase
          .from("endurance_steps")
          .insert(topRows)
          .select("id, order_index, is_group");
        if (topErr) throw topErr;

        // Build local_id → db id map for groups
        const groupDbIds = new Map<string, string>();
        topLevel.forEach((st, i) => {
          if (st.is_group && st.local_id) {
            const match = insertedTop?.find(
              (r) => r.order_index === st.order_index && r.is_group,
            );
            if (match) groupDbIds.set(st.local_id, match.id);
          }
        });

        // Pass 2: children of groups
        const children = s.steps.filter((st) => st.parent_local_id);
        if (children.length > 0) {
          const childRows = children.map((st) => ({
            session_id: sessionId,
            parent_id: groupDbIds.get(st.parent_local_id!) ?? null,
            order_index: st.order_index,
            is_group: false,
            repeat_count: st.repeat_count,
            discipline: st.discipline,
            duration_seconds: st.duration_seconds,
            target_rpe: st.target_rpe,
            notes: st.notes,
          }));
          const { error: childErr } = await supabase
            .from("endurance_steps")
            .insert(childRows);
          if (childErr) throw childErr;
        }
      }

      return mesoId;
    },
    onSuccess: (mesoId) => {
      toast.success("20-week marathon plan generated");
      qc.invalidateQueries({ queryKey: ["mesocycles", athleteId] });
      qc.invalidateQueries({ queryKey: ["athlete-endurance"] });
      setOpen(false);
      onCreated?.(mesoId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="mr-1 h-4 w-4" />
          Generate 20w marathon
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate 20-week marathon plan</DialogTitle>
          <DialogDescription>
            For {athleteName}. Hybrid Pfitzinger / Daniels / polarized 80/20, scaled to the athlete's 10k PB.
            Creates a full mesocycle with ~100 endurance sessions. Everything is editable afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="mp-start">Start date (Monday)</Label>
            <div className="relative">
              <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="mp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-9"
              />
            </div>
            {preview && (
              <p className="mt-1 text-xs text-muted-foreground">
                Race day: <strong>{format(new Date(preview.raceDate), "EEE d MMM yyyy")}</strong>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mp-pb">10k PB (mm:ss)</Label>
              <Input
                id="mp-pb"
                value={pbInput}
                onChange={(e) => setPbInput(e.target.value)}
                placeholder="45:00"
              />
              {!pbValid && pbInput.length > 0 && (
                <p className="mt-1 text-xs text-destructive">Enter 25:00 – 4:00:00</p>
              )}
            </div>
            <div>
              <Label htmlFor="mp-days">Days / week</Label>
              <Select value={daysPerWeek} onValueChange={(v) => setDaysPerWeek(v as "4" | "5" | "6")}>
                <SelectTrigger id="mp-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 days</SelectItem>
                  <SelectItem value="5">5 days (recommended)</SelectItem>
                  <SelectItem value="6">6 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {preview && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <div className="mb-2 font-medium text-foreground">Plan preview</div>
              <div className="grid grid-cols-5 gap-1.5">
                {preview.weeklyVolumeMin.map((min, i) => {
                  const phase = preview.phaseLabels[i];
                  const tone =
                    phase === "Base" ? "bg-status-peaking/30" :
                    phase === "Lactate Threshold" ? "bg-status-adapting/30" :
                    phase === "Race-Specific" ? "bg-status-exhausted/30" :
                    phase === "Sharpening" ? "bg-primary/20" :
                    "bg-muted";
                  return (
                    <div key={i} className={`rounded p-1.5 text-center ${tone}`}>
                      <div className="text-[10px] text-muted-foreground">W{i + 1}</div>
                      <div className="font-mono font-semibold">{Math.round(min / 60)}h</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">Base 1-4</Badge>
                <Badge variant="outline" className="text-[10px]">LT 5-10</Badge>
                <Badge variant="outline" className="text-[10px]">Race-spec 11-15</Badge>
                <Badge variant="outline" className="text-[10px]">Sharpen 16-18</Badge>
                <Badge variant="outline" className="text-[10px]">Taper 19-20</Badge>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!pbValid || mutation.isPending}
          >
            {mutation.isPending ? "Generating…" : "Generate plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
