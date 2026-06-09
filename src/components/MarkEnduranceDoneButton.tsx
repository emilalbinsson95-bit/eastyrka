import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDuration } from "@/lib/endurance";

/**
 * One-tap "Mark as done" for an endurance session.
 *
 * Copies the planned total time + planned avg RPE into the actuals and sets
 * status='completed' — no per-rep entry, no editor. Optional inputs let the
 * athlete tweak total minutes or RPE before confirming.
 */
export function MarkEnduranceDoneButton({
  sessionId,
  plannedSeconds,
  plannedAvgRpe,
  size = "sm",
  variant = "default",
  className,
  label = "Mark as done",
  invalidateKeys = [],
}: {
  sessionId: string;
  plannedSeconds: number | null;
  plannedAvgRpe: number | null;
  size?: "sm" | "default";
  variant?: "default" | "secondary" | "outline" | "ghost";
  className?: string;
  label?: string;
  invalidateKeys?: readonly unknown[][];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const defaultMin = plannedSeconds ? Math.round(plannedSeconds / 60) : 30;
  const [minutes, setMinutes] = useState<string>(String(defaultMin));
  const [rpe, setRpe] = useState<string>(
    plannedAvgRpe != null ? String(plannedAvgRpe) : "",
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const mins = Number(minutes);
      const rpeNum = rpe.trim() === "" ? null : Number(rpe);
      if (!Number.isFinite(mins) || mins <= 0) throw new Error("Enter total minutes");
      if (rpeNum != null && (!Number.isFinite(rpeNum) || rpeNum < 1 || rpeNum > 10))
        throw new Error("RPE must be 1–10");
      const { error } = await supabase
        .from("endurance_sessions")
        .update({
          actual_total_seconds: Math.round(mins * 60),
          overall_rpe: rpeNum,
          status: "completed",
        })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Session marked as done");
      setOpen(false);
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setMinutes(String(defaultMin));
          setRpe(plannedAvgRpe != null ? String(plannedAvgRpe) : "");
          setOpen(true);
        }}
      >
        <Check className="mr-1 h-3.5 w-3.5" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark session as done</DialogTitle>
            <DialogDescription>
              Quick log — just total time and overall RPE. You can always open
              the session later to add per-rep HR or distance.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="mins" className="text-xs">Total minutes</Label>
              <Input
                id="mins"
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
              {plannedSeconds ? (
                <p className="text-[11px] text-muted-foreground">
                  Planned: {formatDuration(plannedSeconds)}
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="rpe" className="text-xs">Overall RPE (1–10)</Label>
              <Input
                id="rpe"
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                step={0.5}
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
                placeholder="optional"
              />
              {plannedAvgRpe != null && (
                <p className="text-[11px] text-muted-foreground">
                  Planned avg: {plannedAvgRpe}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              Save & complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
