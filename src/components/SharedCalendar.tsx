import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { addDays, addMonths, format, isSameMonth, isToday, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Check, Dumbbell, Footprints, HeartPulse, X, RotateCcw, Plus, Trash2, Thermometer, ArrowRight } from "lucide-react";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  deleteSessionHard,
  fetchCalendarItems,
  fetchReadinessDots,
  monthGridDays,
  setOverride,
  uncancelSession,
} from "@/lib/calendar";
import {
  fetchUnavailability,
  deleteUnavailability,
  pushSessionsPastPeriod,
  unavailabilityCovering,
  isPeriodStart,
  type Unavailability,
} from "@/lib/unavailability";
import { UnavailabilityDialog } from "@/components/UnavailabilityDialog";
import { PushSessionsDialog } from "@/components/PushSessionsDialog";
import { useAuth } from "@/lib/auth";
import { SessionPreviewDialog } from "@/components/SessionPreviewDialog";
import { AddSessionDialog } from "@/components/AddSessionDialog";
import { AdhocStrengthEditor } from "@/components/AdhocStrengthEditor";
import { EnduranceSessionEditor } from "@/components/EnduranceSessionEditor";

type Props = {
  ownerId: string;
  /** When true, the viewer cannot drag/confirm cards (coach/physio view). */
  readOnly?: boolean;
  /** Role of the person looking at the calendar. Coach/physio gets hard-delete. */
  viewerRole?: "coach" | "physio" | "athlete" | "patient";
};

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function SharedCalendar({ ownerId, readOnly = false, viewerRole }: Props) {
  const { t } = useTranslation();
  const [monthDate, setMonthDate] = useState<Date>(() => new Date());
  const qc = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id ?? ownerId;

  const canDelete = viewerRole === "coach" || viewerRole === "physio";
  // Athlete manages their own; coach can manage for their athletes.
  const canManageUnavailability = !readOnly || viewerRole === "coach";

  const itemsQuery = useQuery({
    queryKey: ["calendar-items", ownerId, format(monthDate, "yyyy-MM")],
    queryFn: () => fetchCalendarItems(ownerId, monthDate),
  });

  const readinessQuery = useQuery({
    queryKey: ["calendar-readiness", ownerId, format(monthDate, "yyyy-MM")],
    queryFn: () => fetchReadinessDots(ownerId, monthDate),
  });

  const unavailQuery = useQuery({
    queryKey: ["unavailability", ownerId, format(monthDate, "yyyy-MM")],
    queryFn: () => fetchUnavailability(ownerId, monthDate),
  });

  const moveMutation = useMutation({
    mutationFn: setOverride,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : t("calendar.couldNotMove"));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
      toast.success(t("calendar.sessionCancelled"));
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : t("calendar.couldNotCancel"));
    },
  });

  const uncancelMutation = useMutation({
    mutationFn: uncancelSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : t("calendar.couldNotRestore"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSessionHard,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
      toast.success(t("calendar.deleted"));
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : t("calendar.couldNotDelete"));
    },
  });

  const [cancelTarget, setCancelTarget] = useState<CalendarItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CalendarItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<CalendarItem | null>(null);
  const [addForDate, setAddForDate] = useState<string | null>(null);
  const [unavailDialogOpen, setUnavailDialogOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<Unavailability | null>(null);
  const [pushPeriod, setPushPeriod] = useState<Unavailability | null>(null);
  const [editorTarget, setEditorTarget] = useState<
    | { kind: "endurance"; sessionId: string }
    | { kind: "adhoc_strength"; date: string }
    | null
  >(null);

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

  // The day immediately after each period ends — this is where the
  // return-to-load session auto-suggests, so we mark it on the calendar.
  const returnDays = useMemo(() => {
    const set = new Set<string>();
    for (const u of unavailQuery.data ?? []) {
      set.add(format(addDays(parseISO(u.endDate), 1), "yyyy-MM-dd"));
    }
    return set;
  }, [unavailQuery.data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Track active drag so we can auto-switch month when hovering nav buttons.
  const [isDragging, setIsDragging] = useState(false);
  const hoverPrevTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHoverTimers() {
    if (hoverPrevTimer.current) { clearTimeout(hoverPrevTimer.current); hoverPrevTimer.current = null; }
    if (hoverNextTimer.current) { clearTimeout(hoverNextTimer.current); hoverNextTimer.current = null; }
  }
  useEffect(() => clearHoverTimers, []);

  function handleDragStart(_e: DragStartEvent) {
    if (readOnly) return;
    setIsDragging(true);
  }

  function handleDragEnd(e: DragEndEvent) {
    setIsDragging(false);
    clearHoverTimers();
    if (readOnly) return;
    const overId = e.over?.id;
    const activeId = e.active?.id;
    if (!overId || !activeId) return;
    const overStr = String(overId);
    // Dropped on month-nav zone → don't move, just switch month
    if (overStr === "__nav_prev__" || overStr === "__nav_next__") return;
    const [source, sourceId] = String(activeId).split(":") as [CalendarItem["source"], string];
    const date = overStr;
    const item = (itemsQuery.data ?? []).find((i) => i.sourceId === sourceId && i.source === source);
    if (!item) return;
    if (item.effectiveDate === date) return;
    moveMutation.mutate({ ownerId, source, sourceId, date });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => { setIsDragging(false); clearHoverTimers(); }}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MonthNavButton
              id="__nav_prev__"
              isDragging={isDragging}
              ariaLabel={t("calendar.prevMonth")}
              onClick={() => setMonthDate((d) => addMonths(d, -1))}
              onHoverHold={() => {
                if (hoverPrevTimer.current) return;
                hoverPrevTimer.current = setTimeout(() => {
                  setMonthDate((d) => addMonths(d, -1));
                  hoverPrevTimer.current = null;
                }, 400);
              }}
              onHoverLeave={() => {
                if (hoverPrevTimer.current) { clearTimeout(hoverPrevTimer.current); hoverPrevTimer.current = null; }
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </MonthNavButton>
            <div className="min-w-[10rem] text-center text-lg font-semibold">
              {format(monthDate, "MMMM yyyy")}
            </div>
            <MonthNavButton
              id="__nav_next__"
              isDragging={isDragging}
              ariaLabel={t("calendar.nextMonth")}
              onClick={() => setMonthDate((d) => addMonths(d, 1))}
              onHoverHold={() => {
                if (hoverNextTimer.current) return;
                hoverNextTimer.current = setTimeout(() => {
                  setMonthDate((d) => addMonths(d, 1));
                  hoverNextTimer.current = null;
                }, 400);
              }}
              onHoverLeave={() => {
                if (hoverNextTimer.current) { clearTimeout(hoverNextTimer.current); hoverNextTimer.current = null; }
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </MonthNavButton>
          </div>
          <div className="flex items-center gap-2">
            {canManageUnavailability && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setEditingPeriod(null); setUnavailDialogOpen(true); }}
              >
                <Thermometer className="mr-1 h-3.5 w-3.5" /> Mark sick / hurt
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setMonthDate(new Date())}>{t("calendar.today")}</Button>
          </div>
        </div>


        {!readOnly && (
          <p className="text-xs text-muted-foreground">
            {t("calendar.helperAthlete")}
          </p>
        )}

        {(unavailQuery.data ?? []).length > 0 && (
          <>
            <CalendarLegend />
            <UnavailabilityList
              periods={unavailQuery.data ?? []}
              canManage={canManageUnavailability}
              onEdit={(p) => { setEditingPeriod(p); setUnavailDialogOpen(true); }}
              onPush={(p) => setPushPeriod(p)}
              onChanged={() => {
                qc.invalidateQueries({ queryKey: ["unavailability", ownerId] });
                qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
              }}
            />
          </>
        )}

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
          {WEEKDAY_KEYS.map((d) => (
            <div key={d} className="bg-muted/60 px-2 py-1.5 text-center font-medium text-muted-foreground">
              {t(`common.weekdaysShort.${d}`)}
            </div>
          ))}
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const inMonth = isSameMonth(d, monthDate);
            const items = itemsByDay.get(iso) ?? [];
            const readiness = readinessByDay.get(iso);
            const period = unavailabilityCovering(unavailQuery.data ?? [], iso);
            const periodStart = period ? isPeriodStart(period, iso) : false;
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
                canDelete={canDelete}
                unavailability={period ?? null}
                unavailabilityIsStart={periodStart}
                unavailabilityIsEnd={period ? period.endDate === iso : false}
                isReturnDay={returnDays.has(iso)}
                onConfirm={(it) =>
                  moveMutation.mutate({ ownerId, source: it.source, sourceId: it.sourceId, date: it.suggestedDate })
                }
                onRequestCancel={(it) => {
                  setCancelReason("");
                  setCancelTarget(it);
                }}
                onUncancel={(it) => uncancelMutation.mutate({ source: it.source, sourceId: it.sourceId })}
                onRequestDelete={(it) => setDeleteTarget(it)}
                onPreview={(it) => {
                  if (!readOnly && it.source === "adhoc_strength") {
                    setEditorTarget({ kind: "adhoc_strength", date: it.sourceId });
                    return;
                  }
                  if (!readOnly && it.source === "endurance") {
                    setEditorTarget({ kind: "endurance", sessionId: it.sourceId });
                    return;
                  }
                  setPreviewTarget(it);
                }}
                onAdd={readOnly ? undefined : (d) => setAddForDate(d)}
              />
            );
          })}
        </div>
      </div>

      {addForDate && (
        <AddSessionDialog
          athleteId={ownerId}
          date={addForDate}
          open={!!addForDate}
          onOpenChange={(o) => !o && setAddForDate(null)}
          onOpenEditor={(target) => setEditorTarget(target)}
        />
      )}

      <Dialog open={!!editorTarget} onOpenChange={(o) => !o && setEditorTarget(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editorTarget?.kind === "endurance" ? "Edit session" : "Strength workout"}
            </DialogTitle>
          </DialogHeader>
          {editorTarget?.kind === "endurance" && (
            <EnduranceSessionEditor
              sessionId={editorTarget.sessionId}
              canEditPlan
              isAthlete
              onClose={() => {
                setEditorTarget(null);
                qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
              }}
            />
          )}
          {editorTarget?.kind === "adhoc_strength" && (
            <AdhocStrengthEditor
              athleteId={ownerId}
              date={editorTarget.date}
              onClose={() => setEditorTarget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <SessionPreviewDialog
        item={previewTarget}
        open={!!previewTarget}
        onOpenChange={(o) => !o && setPreviewTarget(null)}
        canStartToday={!readOnly}
      />

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("calendar.cancelSessionTitle")}</DialogTitle>
            <DialogDescription>
              {t("calendar.cancelSessionDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">{t("calendar.reason")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {(["sick", "injured", "noTime", "travel", "lowReadiness"] as const).map((presetKey) => (
                <Button
                  key={presetKey}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelReason(t(`calendar.preset.${presetKey}`))}
                >
                  {t(`calendar.preset.${presetKey}`)}
                </Button>
              ))}
            </div>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("calendar.reasonPlaceholder")}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>{t("actions.back")}</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              onClick={() => {
                if (!cancelTarget) return;
                cancelMutation.mutate(
                  {
                    ownerId,
                    source: cancelTarget.source,
                    sourceId: cancelTarget.sourceId,
                    suggestedDate: cancelTarget.effectiveDate,
                    reason: cancelReason.trim(),
                  },
                  { onSuccess: () => setCancelTarget(null) },
                );
              }}
            >
              {t("calendar.cancelSession")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("calendar.deleteSessionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title} — {t("calendar.deleteSessionDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate(
                  { ownerId, source: deleteTarget.source, sourceId: deleteTarget.sourceId },
                  { onSuccess: () => setDeleteTarget(null) },
                );
              }}
            >
              {t("calendar.deleteSession")}
            </AlertDialogAction>
          </AlertDialogFooter>
      </AlertDialogContent>
      </AlertDialog>

      <UnavailabilityDialog
        open={unavailDialogOpen}
        onOpenChange={(o) => {
          setUnavailDialogOpen(o);
          if (!o) setEditingPeriod(null);
        }}
        athleteId={ownerId}
        currentUserId={currentUserId}
        existing={editingPeriod}
      />

      <PushSessionsDialog
        open={!!pushPeriod}
        onOpenChange={(o) => !o && setPushPeriod(null)}
        ownerId={ownerId}
        period={pushPeriod}
        items={itemsQuery.data ?? []}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["unavailability", ownerId] });
          qc.invalidateQueries({ queryKey: ["calendar-items", ownerId] });
        }}
      />
    </DndContext>
  );
}

function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-mono uppercase tracking-[0.16em]">Legend</span>
      <LegendSwatch className="bg-amber-500/25 ring-amber-500/50" label="Sick" />
      <LegendSwatch className="bg-rose-500/25 ring-rose-500/50" label="Hurt" />
      <LegendSwatch className="bg-slate-500/25 ring-slate-500/50" label="Away" />
      <span className="flex items-center gap-1.5">
        <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-primary/20 ring-1 ring-primary/60">
          <span className="h-1 w-1 rounded-full bg-primary" />
        </span>
        Return-to-load
      </span>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-4 rounded ring-1", className)} />
      {label}
    </span>
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
  canDelete,
  unavailability,
  unavailabilityIsStart,
  onConfirm,
  onRequestCancel,
  onUncancel,
  onRequestDelete,
  onPreview,
  onAdd,
}: {
  date: string;
  label: string;
  inMonth: boolean;
  isToday: boolean;
  items: CalendarItem[];
  readiness?: number;
  readOnly: boolean;
  canDelete: boolean;
  unavailability: Unavailability | null;
  unavailabilityIsStart: boolean;
  onConfirm: (it: CalendarItem) => void;
  onRequestCancel: (it: CalendarItem) => void;
  onUncancel: (it: CalendarItem) => void;
  onRequestDelete: (it: CalendarItem) => void;
  onPreview: (it: CalendarItem) => void;
  onAdd?: (date: string) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: date, disabled: readOnly });
  const bandColor =
    unavailability?.reason === "injured"
      ? "bg-rose-500/15 ring-rose-500/40"
      : unavailability?.reason === "sick"
        ? "bg-amber-500/15 ring-amber-500/40"
        : "bg-slate-500/15 ring-slate-500/40";
  const bandLabel = unavailability?.reason === "injured" ? "HURT" : unavailability?.reason === "sick" ? "SICK" : "OFF";
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/day relative min-h-[110px] bg-card p-1.5 transition-colors",
        !inMonth && "bg-muted/30 text-muted-foreground/60",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary",
        unavailability && cn(bandColor, "ring-1 ring-inset"),
      )}
    >
      {unavailability && unavailabilityIsStart && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center py-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-foreground/70">
          {bandLabel}
        </div>
      )}
      <div className={cn("flex items-center justify-between", unavailability && unavailabilityIsStart && "mt-2.5")}>
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold",
            today && "bg-primary text-primary-foreground",
          )}
        >
          {label}
        </span>
        <div className="flex items-center gap-1">
          {readiness != null && <ReadinessDot value={readiness} />}
          {onAdd && inMonth && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdd(date);
              }}
              className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary group-hover/day:opacity-100 focus:opacity-100"
              aria-label={t("calendar.addSession")}
              title={t("calendar.addSession")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-1 space-y-1">
        {items.map((it) => (
          <SessionCard
            key={it.key}
            item={it}
            readOnly={readOnly}
            canDelete={canDelete}
            onConfirm={onConfirm}
            onRequestCancel={onRequestCancel}
            onUncancel={onUncancel}
            onRequestDelete={onRequestDelete}
            onPreview={onPreview}
          />
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
  canDelete,
  onConfirm,
  onRequestCancel,
  onUncancel,
  onRequestDelete,
  onPreview,
}: {
  item: CalendarItem;
  readOnly: boolean;
  canDelete: boolean;
  onConfirm: (it: CalendarItem) => void;
  onRequestCancel: (it: CalendarItem) => void;
  onUncancel: (it: CalendarItem) => void;
  onRequestDelete: (it: CalendarItem) => void;
  onPreview: (it: CalendarItem) => void;
}) {
  const { t } = useTranslation();
  const draggable = !readOnly && !item.isCancelled;
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
      onClick={() => { if (!isDragging) onPreview(item); }}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "group relative flex items-start gap-1 rounded-md border px-1.5 py-1 text-[11px] leading-tight",
        item.isCancelled
          ? "border-destructive/60 bg-destructive/10 text-destructive line-through decoration-destructive/70"
          : item.isGhost
            ? "border-dashed border-primary/60 bg-primary/5 text-foreground/80"
            : "border-border bg-secondary text-secondary-foreground",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
      title={
        item.isCancelled
          ? `${t("calendar.cancelled")}${item.cancelReason ? ` — ${item.cancelReason}` : ""}`
          : item.isGhost
            ? `${t("calendar.suggested")} ${item.subtitle ?? ""}`
            : moved
              ? t("calendar.movedFrom", { date: format(parseISO(item.suggestedDate), "MMM d") })
              : item.subtitle
      }
    >
      <Icon className="mt-0.5 h-3 w-3 flex-shrink-0" />
      <span className="flex-1 truncate">
        {item.title}
        {item.isCancelled && item.cancelReason && (
          <span className="ml-1 font-medium no-underline">· {item.cancelReason}</span>
        )}
      </span>
      {!readOnly && item.isGhost && !item.isCancelled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onConfirm(item);
          }}
          className="rounded p-0.5 text-primary hover:bg-primary/10"
          aria-label={t("calendar.acceptSuggested")}
        >
          <Check className="h-3 w-3" />
        </button>
      )}
      {!readOnly && !item.isCancelled && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRequestCancel(item);
          }}
          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("calendar.cancelSession")}
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {!readOnly && item.isCancelled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUncancel(item);
          }}
          className="rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          aria-label={t("calendar.restoreSession")}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete(item);
          }}
          className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("calendar.deleteSession")}
          title={t("calendar.deleteSession")}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function MonthNavButton({
  id,
  isDragging,
  ariaLabel,
  onClick,
  onHoverHold,
  onHoverLeave,
  children,
}: {
  id: string;
  isDragging: boolean;
  ariaLabel: string;
  onClick: () => void;
  onHoverHold: () => void;
  onHoverLeave: () => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !isDragging });
  useEffect(() => {
    if (isOver) onHoverHold();
    else onHoverLeave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOver]);
  return (
    <Button
      ref={setNodeRef as unknown as Ref<HTMLButtonElement>}
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        isDragging && "ring-1 ring-dashed ring-primary/40",
        isOver && "bg-primary/15 ring-primary text-primary",
      )}
    >
      {children}
    </Button>
  );
}

function UnavailabilityList({
  periods,
  items,
  ownerId,
  canManage,
  onEdit,
  onChanged,
}: {
  periods: Unavailability[];
  items: CalendarItem[];
  ownerId: string;
  canManage: boolean;
  onEdit: (p: Unavailability) => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDelete(p: Unavailability) {
    setBusyId(p.id);
    try {
      await deleteUnavailability(p.id);
      toast.success("Period removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePush(p: Unavailability) {
    setBusyId(p.id);
    try {
      const affected = items
        .filter((i) => i.effectiveDate >= p.startDate && i.effectiveDate <= p.endDate)
        .map((i) => ({ source: i.source, sourceId: i.sourceId, effectiveDate: i.effectiveDate }));
      if (affected.length === 0) {
        toast.info("No sessions inside this period");
      } else {
        const n = await pushSessionsPastPeriod({ ownerId, period: p, items: affected });
        toast.success(`Pushed ${n} session${n === 1 ? "" : "s"} past ${format(parseISO(p.endDate), "MMM d")}`);
        onChanged();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not push sessions");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-1.5">
      {periods.map((p) => {
        const label = p.reason === "injured" ? "Hurt" : p.reason === "sick" ? "Sick" : "Off";
        const dot =
          p.reason === "injured" ? "bg-rose-500" : p.reason === "sick" ? "bg-amber-500" : "bg-slate-500";
        return (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <span className={cn("h-2 w-2 rounded-full", dot)} />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </span>
            <span className="font-medium">
              {format(parseISO(p.startDate), "MMM d")} – {format(parseISO(p.endDate), "MMM d")}
            </span>
            {p.notes && <span className="truncate text-muted-foreground">· {p.notes}</span>}
            {canManage && (
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === p.id}
                  onClick={() => handlePush(p)}
                  title="Move any sessions inside this range to after the end date"
                >
                  <ArrowRight className="mr-1 h-3.5 w-3.5" /> Push sessions past
                </Button>
                <Button variant="ghost" size="sm" disabled={busyId === p.id} onClick={() => onEdit(p)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === p.id}
                  onClick={() => handleDelete(p)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
