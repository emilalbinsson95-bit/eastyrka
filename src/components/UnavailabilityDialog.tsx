import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  createUnavailability,
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

const REASONS: { value: UnavailabilityReason; label: string }[] = [
  { value: "sick", label: "Sick" },
  { value: "injured", label: "Hurt / Injured" },
  { value: "other", label: "Other" },
];

export function UnavailabilityDialog({ open, onOpenChange, athleteId, currentUserId, existing }: Props) {
  const qc = useQueryClient();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState<UnavailabilityReason>("sick");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setStartDate(existing.startDate);
      setEndDate(existing.endDate);
      setReason(existing.reason);
      setNotes(existing.notes ?? "");
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setStartDate(today);
      setEndDate(today);
      setReason("sick");
      setNotes("");
    }
  }, [open, existing]);

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit period" : "Mark sick / injured"}</DialogTitle>
          <DialogDescription>
            Blocks a range of days on the calendar automatically — no need to mark each day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="u-start">Start</Label>
              <Input id="u-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="u-end">End</Label>
              <Input id="u-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Reason</Label>
            <div className="flex gap-1.5">
              {REASONS.map((r) => (
                <Button
                  key={r.value}
                  type="button"
                  size="sm"
                  variant={reason === r.value ? "default" : "outline"}
                  onClick={() => setReason(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="u-notes">Notes (optional)</Label>
            <Textarea
              id="u-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Fever, hamstring tweak, travel…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : existing ? "Save" : "Mark period"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
