import { addDays, format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { plannedSessionDate } from "@/lib/planned-session-dates";

export type CalendarSource = "planned" | "endurance" | "rehab" | "adhoc_strength";

export type CalendarItem = {
  key: string;                // unique per source+id
  source: CalendarSource;
  sourceId: string;
  ownerId: string;            // athlete or patient
  title: string;
  subtitle?: string;
  /** ISO yyyy-MM-dd date the coach/physio suggested (or for self-planned, the source's own date). */
  suggestedDate: string;
  /** Override row, if any. */
  override?: {
    id: string;
    scheduledDate: string;
    confirmedAt: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
  };
  /** Final date to render the card on. */
  effectiveDate: string;
  /** True if the card is still a coach/physio suggestion that hasn't been confirmed/moved. */
  isGhost: boolean;
  /** True if the athlete/patient cancelled this session. */
  isCancelled: boolean;
  cancelReason?: string | null;
  /** Link to detail page (optional). */
  href?: string;
};

export function monthGridDays(monthDate: Date): Date[] {
  const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

function fmt(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

/** Fetch every calendar item visible for a given owner (athlete or patient). */
export async function fetchCalendarItems(ownerId: string, monthDate: Date): Promise<CalendarItem[]> {
  const days = monthGridDays(monthDate);
  const rangeStart = fmt(days[0]);
  const rangeEnd = fmt(days[days.length - 1]);

  // 1. Strength planned sessions via week_plans
  const { data: weekPlans } = await supabase
    .from("week_plans")
    .select("id, week_start_date, status, planned_sessions(id, day_of_week, title)")
    .eq("athlete_id", ownerId)
    .eq("status", "published")
    .gte("week_start_date", fmt(addDays(parseISO(rangeStart), -7)))
    .lte("week_start_date", rangeEnd);

  const plannedItems: CalendarItem[] = [];
  for (const wp of weekPlans ?? []) {
    const sessions = (wp.planned_sessions ?? []) as { id: string; day_of_week: number; title: string | null }[];
    for (const ps of sessions) {
      const suggested = plannedSessionDate(wp.week_start_date as string, ps, sessions);
      plannedItems.push({
        key: `planned:${ps.id}`,
        source: "planned",
        sourceId: ps.id,
        ownerId,
        title: ps.title || "Strength session",
        subtitle: "Strength",
        suggestedDate: suggested,
        effectiveDate: suggested,
        isGhost: true,
        isCancelled: false,
      });
    }
  }

  // 2. Endurance sessions (exclude drafts — they're created on "Add session"
  //    click but only become real once the athlete saves something)
  const { data: endSessions } = await supabase
    .from("endurance_sessions")
    .select("id, date, title, discipline, coach_id, athlete_id, status")
    .eq("athlete_id", ownerId)
    .neq("status", "draft")
    .gte("date", rangeStart)
    .lte("date", rangeEnd);

  const enduranceItems: CalendarItem[] = (endSessions ?? []).map((s) => {
    const suggested = fmt(s.date as string);
    return {
      key: `endurance:${s.id}`,
      source: "endurance" as const,
      sourceId: s.id,
      ownerId,
      title: s.title || `${s.discipline ?? "Endurance"} session`,
      subtitle: s.discipline ? String(s.discipline) : "Endurance",
      suggestedDate: suggested,
      effectiveDate: suggested,
      // Self-planned (no coach) endurance starts confirmed; coach-deployed is a ghost.
      isGhost: !!s.coach_id,
      isCancelled: false,
    };
  });

  // 3. Rehab sessions
  const { data: rehab } = await supabase
    .from("rehab_sessions")
    .select("id, session_date, title, physio_id, patient_id")
    .eq("patient_id", ownerId)
    .gte("session_date", rangeStart)
    .lte("session_date", rangeEnd);

  const rehabItems: CalendarItem[] = (rehab ?? []).map((s) => {
    const suggested = fmt(s.session_date as string);
    return {
      key: `rehab:${s.id}`,
      source: "rehab" as const,
      sourceId: s.id,
      ownerId,
      title: s.title || "Rehab session",
      subtitle: "Rehab",
      suggestedDate: suggested,
      effectiveDate: suggested,
      isGhost: !!s.physio_id,
      isCancelled: false,
    };
  });

  // 4. Ad-hoc strength sessions (athlete-logged training_logs without a planned session)
  const { data: adhocLogs } = await supabase
    .from("training_logs")
    .select("date, exercise")
    .eq("athlete_id", ownerId)
    .is("planned_exercise_id", null)
    .gte("date", rangeStart)
    .lte("date", rangeEnd);

  const adhocByDate = new Map<string, Set<string>>();
  for (const r of adhocLogs ?? []) {
    const d = fmt(r.date as string);
    if (!adhocByDate.has(d)) adhocByDate.set(d, new Set());
    adhocByDate.get(d)!.add(String(r.exercise));
  }
  const adhocItems: CalendarItem[] = Array.from(adhocByDate.entries()).map(([date, exSet]) => ({
    key: `adhoc_strength:${date}`,
    source: "adhoc_strength" as const,
    sourceId: date, // sourceId = date for ad-hoc strength (no parent row)
    ownerId,
    title: exSet.size === 1
      ? Array.from(exSet)[0]
      : `Strength · ${exSet.size} exercises`,
    subtitle: "Strength",
    suggestedDate: date,
    effectiveDate: date,
    isGhost: false,
    isCancelled: false,
  }));

  const items = [...plannedItems, ...enduranceItems, ...rehabItems, ...adhocItems];
  // Only items with uuid sourceIds can have schedule overrides (ad-hoc strength uses date as sourceId)
  const sourceIds = items.filter((i) => i.source !== "adhoc_strength").map((i) => i.sourceId);
  if (sourceIds.length > 0) {
    const { data: overrides } = await supabase
      .from("session_schedule_overrides")
      .select("id, source_type, source_id, scheduled_date, confirmed_at, cancelled_at, cancel_reason")
      .eq("owner_id", ownerId)
      .in("source_id", sourceIds);

    type Ov = { id: string; scheduledDate: string; confirmedAt: string | null; cancelledAt: string | null; cancelReason: string | null };
    const byKey = new Map<string, Ov>();
    for (const o of overrides ?? []) {
      byKey.set(`${o.source_type}:${o.source_id}`, {
        id: o.id as string,
        scheduledDate: fmt(o.scheduled_date as string),
        confirmedAt: (o.confirmed_at as string | null) ?? null,
        cancelledAt: (o.cancelled_at as string | null) ?? null,
        cancelReason: (o.cancel_reason as string | null) ?? null,
      });
    }

    for (const it of items) {
      const ov = byKey.get(it.key);
      if (ov) {
        it.override = ov;
        if (ov.confirmedAt) {
          it.effectiveDate = ov.scheduledDate;
          it.isGhost = false;
        }
        if (ov.cancelledAt) {
          it.isCancelled = true;
          it.cancelReason = ov.cancelReason;
          it.isGhost = false;
          if (ov.scheduledDate) it.effectiveDate = ov.scheduledDate;
        }
      }
    }
  }

  return items;
}

export type ReadinessDot = { date: string; daily_form: number };

export async function fetchReadinessDots(ownerId: string, monthDate: Date): Promise<ReadinessDot[]> {
  const days = monthGridDays(monthDate);
  const { data } = await supabase
    .from("readiness_surveys")
    .select("date, daily_form")
    .eq("athlete_id", ownerId)
    .gte("date", fmt(days[0]))
    .lte("date", fmt(days[days.length - 1]));
  return (data ?? []).map((r) => ({ date: fmt(r.date as string), daily_form: r.daily_form as number }));
}

/** Upsert an override row for the owner. Confirms it (so it becomes solid). */
export async function setOverride(args: {
  ownerId: string;
  source: CalendarSource;
  sourceId: string;
  date: string;
}) {
  const { ownerId, source, sourceId, date } = args;
  const { error } = await supabase
    .from("session_schedule_overrides")
    .upsert(
      {
        owner_id: ownerId,
        source_type: source,
        source_id: sourceId,
        scheduled_date: date,
        confirmed_at: new Date().toISOString(),
        cancelled_at: null,
        cancel_reason: null,
      },
      { onConflict: "source_type,source_id" },
    );
  if (error) throw error;
}

/** Mark a session as cancelled by the owner (athlete/patient), with a reason. */
export async function cancelSession(args: {
  ownerId: string;
  source: CalendarSource;
  sourceId: string;
  suggestedDate: string;
  reason: string;
}) {
  const { ownerId, source, sourceId, suggestedDate, reason } = args;
  const { error } = await supabase
    .from("session_schedule_overrides")
    .upsert(
      {
        owner_id: ownerId,
        source_type: source,
        source_id: sourceId,
        scheduled_date: suggestedDate,
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason,
      },
      { onConflict: "source_type,source_id" },
    );
  if (error) throw error;
}

/** Undo a cancellation. */
export async function uncancelSession(args: {
  source: CalendarSource;
  sourceId: string;
}) {
  const { error } = await supabase
    .from("session_schedule_overrides")
    .update({ cancelled_at: null, cancel_reason: null })
    .eq("source_type", args.source)
    .eq("source_id", args.sourceId);
  if (error) throw error;
}

export async function clearOverride(args: { source: CalendarSource; sourceId: string }) {
  const { error } = await supabase
    .from("session_schedule_overrides")
    .delete()
    .eq("source_type", args.source)
    .eq("source_id", args.sourceId);
  if (error) throw error;
}

/**
 * Hard-delete a session from the calendar. Coach/physio only.
 * Removes the source row (planned_session / endurance_session / rehab_session /
 * training_logs for ad-hoc strength) plus any schedule override pointing at it.
 */
export async function deleteSessionHard(args: {
  ownerId: string;
  source: CalendarSource;
  sourceId: string;
}) {
  const { ownerId, source, sourceId } = args;

  // 1. Drop any schedule override (best-effort; no rows is OK)
  if (source !== "adhoc_strength") {
    await supabase
      .from("session_schedule_overrides")
      .delete()
      .eq("source_type", source)
      .eq("source_id", sourceId);
  } else {
    await supabase
      .from("session_schedule_overrides")
      .delete()
      .eq("owner_id", ownerId)
      .eq("source_type", source)
      .eq("source_id", sourceId);
  }

  // 2. Drop the source row
  if (source === "planned") {
    const { error } = await supabase.from("planned_sessions").delete().eq("id", sourceId);
    if (error) throw error;
  } else if (source === "endurance") {
    const { error } = await supabase.from("endurance_sessions").delete().eq("id", sourceId);
    if (error) throw error;
  } else if (source === "rehab") {
    const { error } = await supabase.from("rehab_sessions").delete().eq("id", sourceId);
    if (error) throw error;
  } else if (source === "adhoc_strength") {
    // sourceId == date; drop all ad-hoc logs for that athlete on that day
    const { error } = await supabase
      .from("training_logs")
      .delete()
      .eq("athlete_id", ownerId)
      .eq("date", sourceId)
      .is("planned_exercise_id", null);
    if (error) throw error;
  }
}
