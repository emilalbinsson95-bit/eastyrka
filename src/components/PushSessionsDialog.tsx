import { useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ArrowRight, Info } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CalendarItem, CalendarSource } from "@/lib/calendar";
import { setOverride } from "@/lib/calendar";
import type { Unavailability } from "@/lib/unavailability";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ownerId: string;
  period: Unavailability | null;
  items: CalendarItem[];
  onDone: () => void;
};

const BUFFER_OPTIONS = [
  { label: "Next day", days: 1, helper: "Straight back at it — no extra rest." },
  { label: "+1 day (return-to-load)", days: 2, helper: "Reserves the first day back for a light primer session." },
  { label: "+2 days", days: 3, helper: "Extra breathing room. Safest after longer breaks." },
];

export function PushSessionsDialog({ open, onOpenChange, ownerId, period, items, onDone }: Props) {
  const [buffer, setBuffer] = useState<number>(2);
  const [busy, setBusy] = useState(false);

  const affected = useMemo(() => {
    if (!period) return [];
    return items
      .filter((i) => i.source !== "adhoc_strength")
      .filter((i) => i.effectiveDate >= period.startDate && i.effectiveDate <= period.endDate)
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  }, [items, period]);

  const preview = useMemo(() => {
    if (!period) return [];
    const base = parseISO(period.endDate);
    return affected.map((it, idx) => ({
      item: it,
      fromDate: it.effectiveDate,
      toDate: format(addDays(base, buffer + idx), "yyyy-MM-dd"),
    }));
  }, [affected, period, buffer]);

  async function handleConfirm() {
    if (!period) return;
    setBusy(true);
    try {
      for (const p of preview) {
        await setOverride({
          ownerId,
          source: p.item.source as CalendarSource,
          sourceId: p.item.sourceId,
          date: p.toDate,
        });
      }
      toast.success(
        `Moved ${preview.length} session${preview.length === 1 ? "" : "s"} past ${format(
          parseISO(period.endDate),
          "MMM d",
        )}`,
      );
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not push sessions");
    } finally {
      setBusy(false);
    }
  }

  if (!period) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Push sessions past this period</DialogTitle>
          <DialogDescription>
            Reschedules any planned sessions that fall inside{" "}
            <span className="font-medium text-foreground">
              {format(parseISO(period.startDate), "MMM d")} – {format(parseISO(period.endDate), "MMM d")}
            </span>{" "}
            to consecutive days after it ends. Ad-hoc strength entries and rest days stay put.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Start rescheduling</Label>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {BUFFER_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setBuffer(opt.days)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    buffer === opt.days
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card hover:bg-muted/40",
                  )}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{opt.helper}</div>
                </button>
              ))}
            </div>
          </div>

          {preview.length === 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
              <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p>No planned sessions inside this range — nothing to push.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {preview.length} session{preview.length === 1 ? "" : "s"} will move
              </Label>
              <div className="max-h-56 overflow-y-auto rounded-md border border-border/60 bg-card">
                <table className="w-full text-sm">
                  <tbody>
                    {preview.map((p) => (
                      <tr key={p.item.key} className="border-b border-border/40 last:border-0">
                        <td className="w-full px-3 py-2 truncate">{p.item.title}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums">
                          {format(parseISO(p.fromDate), "MMM d")}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums">
                          {format(parseISO(p.toDate), "EEE MMM d")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                You can drag any card afterwards to fine-tune.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || preview.length === 0}>
            {busy ? "Moving…" : `Move ${preview.length || ""} session${preview.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
