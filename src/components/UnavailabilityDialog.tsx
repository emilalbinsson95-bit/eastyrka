import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { AlertTriangle, HeartPulse, Info, Thermometer, Coffee } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createUnavailability,
  fetchUnavailability,
  updateUnavailability,
  type Unavailability,
  type UnavailabilityReason,
} from "@/lib/unavailability";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  athleteId: string;
  currentUserId: string;
  existing?: Unavailability | null;
};

const REASONS: {
  value: UnavailabilityReason;
  label: string;
  helper: string;
  Icon: typeof Thermometer;
  ring: string;
  chip: string;
}[] = [
  {
    value: "sick",
    label: "Sick",
    helper: "Fever, flu, stomach bug — anything systemic. Rest fully, then return-to-load.",
    Icon: Thermometer,
    ring: "ring-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    chip: "border-amber-500/40",
  },
  {
    value: "injured",
    label: "Hurt",
    helper: "Local pain or strain. Skip loaded work on the site until it settles.",
    Icon: HeartPulse,
    ring: "ring-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    chip: "border-rose-500/40",
  },
  {
    value: "other",
    label: "Away",
    helper: "Travel, work, family — planned time off training.",
    Icon: Coffee,
    ring: "ring-slate-500/50 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    chip: "border-slate-500/40",
  },
];

const DURATION_PRESETS = [
  { label: "Today only", days: 0 },
  { label: "2 days", days: 1 },
  { label: "3 days", days: 2 },
  { label: "1 week", days: 6 },
];

const INJURY_SITES = ["Lower back", "Knee", "Hip", "Shoulder", "Elbow", "Hamstring", "Neck", "Wrist"];

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function UnavailabilityDialog({ open, onOpenChange, athleteId, currentUserId, existing }: Props) {
  const qc = useQueryClient();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState<UnavailabilityReason>("sick");
  const [notes, setNotes] = useState("");
  const [site, setSite] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setStartDate(existing.startDate);
      setEndDate(existing.endDate);
      setReason(existing.reason);
      setNotes(existing.notes ?? "");
      setSite(null);
    } else {
      const today = isoToday();
      setStartDate(today);
      setEndDate(today);
      setReason("sick");
      setNotes("");
      setSite(null);
    }
  }, [open, existing]);

  // Overlap detection: fetch a wide window and see if any *other* period intersects.
  const overlapQuery = useQuery({
    queryKey: ["unavailability", athleteId, "overlap-check", startDate],
    queryFn: () => fetchUnavailability(athleteId, startDate ? parseISO(startDate) : new Date()),
    enabled: open && !!startDate,
  });

  const overlap = useMemo(() => {
    if (!startDate || !endDate) return null;
    const list = overlapQuery.data ?? [];
    return list.find(
      (u) => u.id !== existing?.id && u.startDate <= endDate && u.endDate >= startDate,
    );
  }, [overlapQuery.data, startDate, endDate, existing?.id]);

  const days = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return 0;
    return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
  }, [startDate, endDate]);

  const returnDate = useMemo(() => {
    if (!endDate) return null;
    return format(addDays(parseISO(endDate), 1), "EEE MMM d");
  }, [endDate]);

  const activeReason = REASONS.find((r) => r.value === reason)!;

  function applyPreset(deltaDays: number) {
    const start = startDate || isoToday();
    setStartDate(start);
    setEndDate(format(addDays(parseISO(start), deltaDays), "yyyy-MM-dd"));
  }

  function toggleSite(name: string) {
    setSite((cur) => (cur === name ? null : name));
    setNotes((prev) => {
      // Replace or add the site tag at the front of notes.
      const stripped = prev.replace(/^(Lower back|Knee|Hip|Shoulder|Elbow|Hamstring|Neck|Wrist)(\s·\s|:\s)?/i, "").trim();
      if (site === name) return stripped;
      return stripped ? `${name} · ${stripped}` : name;
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!startDate || !endDate) throw new Error("Pick a start and end date");
      if (endDate < startDate) throw new Error("End date must be on or after start date");
      if (existing) {
        await updateUnavailability(existing.id, { startDate, endDate, reason, notes: notes.trim() || null });
      } else {
        await createUnavailability({
          athleteId,
          startDate,
          endDate,
          reason,
          notes: notes.trim() || null,
          createdBy: currentUserId,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unavailability", athleteId] });
      toast.success(existing ? "Period updated" : "Marked on calendar");
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not save");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <activeReason.Icon className="h-5 w-5 text-muted-foreground" />
            {existing ? "Edit off-training period" : "Mark time off training"}
          </DialogTitle>
          <DialogDescription>
            Block a range of days at once — no need to mark each day. Sessions inside the range
            stay visible so you can move them, and a gentle{" "}
            <span className="font-medium text-foreground">return-to-load</span> workout appears
            automatically the day after.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Reason */}
          <div className="space-y-2">
            <Label>What's going on?</Label>
            <div className="grid grid-cols-3 gap-2">
              {REASONS.map((r) => {
                const active = reason === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-center transition-colors",
                      active
                        ? cn("ring-1", r.ring, r.chip)
                        : "border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    <r.Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{r.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{activeReason.helper}</p>
          </div>

          {/* Injury site chips */}
          {reason === "injured" && (
            <div className="space-y-1.5">
              <Label>Where does it hurt? (optional)</Label>
              <div className="flex flex-wrap gap-1.5">
                {INJURY_SITES.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={site === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleSite(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Duration presets */}
          <div className="space-y-1.5">
            <Label>How long?</Label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_PRESETS.map((p) => {
                const wouldEnd = startDate
                  ? format(addDays(parseISO(startDate), p.days), "yyyy-MM-dd")
                  : null;
                const active = wouldEnd === endDate;
                return (
                  <Button
                    key={p.label}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    onClick={() => applyPreset(p.days)}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="u-start">Start</Label>
              <Input id="u-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="u-end">End (last day off)</Label>
              <Input id="u-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Summary */}
          {days > 0 && (
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="space-y-0.5">
                  <p>
                    <span className="font-medium">{days} day{days === 1 ? "" : "s"}</span> blocked
                    {" "}({format(parseISO(startDate), "EEE MMM d")}
                    {days > 1 ? ` – ${format(parseISO(endDate), "EEE MMM d")}` : ""}).
                  </p>
                  {returnDate && (
                    <p className="text-muted-foreground">
                      First training day back: <span className="font-medium text-foreground">{returnDate}</span> — a
                      light return-to-load session (60% × 3×5) will be suggested automatically.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Overlap warning */}
          {overlap && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <p>
                Overlaps an existing period ({overlap.reason},{" "}
                {format(parseISO(overlap.startDate), "MMM d")} – {format(parseISO(overlap.endDate), "MMM d")}).
                Consider editing that one instead of adding a new range.
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="u-notes">Notes (optional)</Label>
            <Textarea
              id="u-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={
                reason === "sick"
                  ? "e.g. fever 38.5, sore throat"
                  : reason === "injured"
                    ? "e.g. tweaked lower back on Monday deadlifts"
                    : "e.g. work trip to Berlin"
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || days === 0}>
            {save.isPending ? "Saving…" : existing ? "Save changes" : "Mark on calendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
