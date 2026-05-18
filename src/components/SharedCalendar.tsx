import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { addMonths, format, isSameMonth, isToday, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Check, Dumbbell, Footprints, HeartPulse, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarItem,
  cancelSession,
  fetchCalendarItems,
  fetchReadinessDots,
  monthGridDays,
  setOverride,
  uncancelSession,
} from "@/lib/calendar";

type Props = {
  ownerId: string;
  /** When true, the viewer cannot drag/confirm cards (coach/physio view). */
  readOnly?: boolean;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SharedCalendar({ ownerId, readOnly = false }: Props) {
  const [monthDate, setMonthDate] = useState<Date>(() => new Date());
  const qc = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: ["calendar-items", ownerId, format(monthDate, "yyyy-MM")],
    queryFn: () => fetchCalendarItems(ownerId, monthDate),
  });

  const readinessQuery = useQuery({
    queryKey: ["calendar-readiness", ownerId, format(monthDate, "yyyy-MM")],
    queryFn: () => fetchReadinessDots(ownerId, monthDate),
  });

  const moveMutation = useMutation({
    mutationFn: setOverride,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not move session");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
      toast.success("Session cancelled");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not cancel session");
    },
  });

  const uncancelMutation = useMutation({
    mutationFn: uncancelSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not restore session");
    },
  });

  const [cancelTarget, setCancelTarget] = useState<CalendarItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const days = useMemo(() => monthGridDays(monthDate), [monthDate]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of itemsQuery.data ?? []) {
      const arr = map.get(it.effectiveDate) ?? [];
      arr.push(it);
      map.set(it.effectiveDate, arr);
    }
    return map;
  }, [itemsQuery.data]);

  const readinessByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of readinessQuery.data ?? []) map.set(r.date, r.daily_form);
    return map;
  }, [readinessQuery.data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(e: DragEndEvent) {
    if (readOnly) return;
    const overId = e.over?.id;
    const activeId = e.active?.id;
    if (!overId || !activeId) return;
    const [source, sourceId] = String(activeId).split(":") as [CalendarItem["source"], string];
    const date = String(overId);
    const item = (itemsQuery.data ?? []).find((i) => i.sourceId === sourceId && i.source === source);
    if (!item) return;
    if (item.effectiveDate === date) return;
    moveMutation.mutate({ ownerId, source, sourceId, date });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setMonthDate((d) => addMonths(d, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[10rem] text-center text-lg font-semibold">
              {format(monthDate, "MMMM yyyy")}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMonthDate((d) => addMonths(d, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setMonthDate(new Date())}>Today</Button>
        </div>

        {!readOnly && (
          <p className="text-xs text-muted-foreground">
            Dashed cards are coach/physio suggestions. Drag them onto any day to confirm, or tap the check to keep the suggested day.
          </p>
        )}

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-muted/60 px-2 py-1.5 text-center font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const inMonth = isSameMonth(d, monthDate);
            const items = itemsByDay.get(iso) ?? [];
            const readiness = readinessByDay.get(iso);
            return (
              <DayCell
                key={iso}
                date={iso}
                label={format(d, "d")}
                isToday={isToday(d)}
                inMonth={inMonth}
                items={items}
                readiness={readiness}
                readOnly={readOnly}
                onConfirm={(it) =>
                  moveMutation.mutate({ ownerId, source: it.source, sourceId: it.sourceId, date: it.suggestedDate })
                }
              />
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}

function DayCell({
  date,
  label,
  inMonth,
  isToday: today,
  items,
  readiness,
  readOnly,
  onConfirm,
}: {
  date: string;
  label: string;
  inMonth: boolean;
  isToday: boolean;
  items: CalendarItem[];
  readiness?: number;
  readOnly: boolean;
  onConfirm: (it: CalendarItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date, disabled: readOnly });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[110px] bg-card p-1.5 transition-colors",
        !inMonth && "bg-muted/30 text-muted-foreground/60",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold",
            today && "bg-primary text-primary-foreground",
          )}
        >
          {label}
        </span>
        {readiness != null && <ReadinessDot value={readiness} />}
      </div>
      <div className="mt-1 space-y-1">
        {items.map((it) => (
          <SessionCard key={it.key} item={it} readOnly={readOnly} onConfirm={onConfirm} />
        ))}
      </div>
    </div>
  );
}

function ReadinessDot({ value }: { value: number }) {
  const color =
    value >= 8 ? "bg-emerald-500" : value >= 6 ? "bg-lime-500" : value >= 4 ? "bg-amber-500" : "bg-red-500";
  return <span className={cn("h-2 w-2 rounded-full", color)} title={`Readiness ${value}/10`} />;
}

function SessionCard({
  item,
  readOnly,
  onConfirm,
}: {
  item: CalendarItem;
  readOnly: boolean;
  onConfirm: (it: CalendarItem) => void;
}) {
  const draggable = !readOnly;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${item.source}:${item.sourceId}`,
    disabled: !draggable,
  });

  const Icon = item.source === "endurance" ? Footprints : item.source === "rehab" ? HeartPulse : Dumbbell;
  const moved = !!item.override && item.override.scheduledDate !== item.suggestedDate;

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      {...attributes}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "group relative flex items-start gap-1 rounded-md border px-1.5 py-1 text-[11px] leading-tight",
        item.isGhost
          ? "border-dashed border-primary/60 bg-primary/5 text-foreground/80"
          : "border-border bg-secondary text-secondary-foreground",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
      title={
        item.isGhost
          ? `Suggested ${item.subtitle ?? ""} — drag to move or tap ✓ to accept`
          : moved
            ? `Moved from ${format(parseISO(item.suggestedDate), "MMM d")}`
            : item.subtitle
      }
    >
      <Icon className="mt-0.5 h-3 w-3 flex-shrink-0" />
      <span className="flex-1 truncate">{item.title}</span>
      {item.isGhost && !readOnly && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onConfirm(item);
          }}
          className="rounded p-0.5 text-primary hover:bg-primary/10"
          aria-label="Accept suggested day"
        >
          <Check className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
