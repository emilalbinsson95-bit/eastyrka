import { addDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { setOverride, type CalendarSource } from "@/lib/calendar";

export type UnavailabilityReason = "sick" | "injured" | "other";

export type Unavailability = {
  id: string;
  athleteId: string;
  startDate: string; // yyyy-MM-dd
  endDate: string;   // yyyy-MM-dd
  reason: UnavailabilityReason;
  notes: string | null;
  createdBy: string | null;
};

function fmt(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

/** All unavailability rows for an athlete overlapping a given month window (with a wide buffer). */
export async function fetchUnavailability(
  athleteId: string,
  monthDate: Date,
): Promise<Unavailability[]> {
  // Wide range so bands crossing month edges render correctly.
  const start = fmt(addDays(monthDate, -60));
  const end = fmt(addDays(monthDate, 90));
  const { data, error } = await supabase
    .from("athlete_unavailability")
    .select("id, athlete_id, start_date, end_date, reason, notes, created_by")
    .eq("athlete_id", athleteId)
    .lte("start_date", end)
    .gte("end_date", start)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    athleteId: r.athlete_id as string,
    startDate: fmt(r.start_date as string),
    endDate: fmt(r.end_date as string),
    reason: r.reason as UnavailabilityReason,
    notes: (r.notes as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
  }));
}

export async function createUnavailability(input: {
  athleteId: string;
  startDate: string;
  endDate: string;
  reason: UnavailabilityReason;
  notes?: string | null;
  createdBy: string | null;
}) {
  const { error } = await supabase.from("athlete_unavailability").insert({
    athlete_id: input.athleteId,
    start_date: input.startDate,
    end_date: input.endDate,
    reason: input.reason,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function updateUnavailability(id: string, patch: Partial<{
  startDate: string;
  endDate: string;
  reason: UnavailabilityReason;
  notes: string | null;
}>) {
  const dbPatch: Record<string, unknown> = {};
  if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate;
  if (patch.endDate !== undefined) dbPatch.end_date = patch.endDate;
  if (patch.reason !== undefined) dbPatch.reason = patch.reason;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;
  const { error } = await supabase.from("athlete_unavailability").update(dbPatch).eq("id", id);
  if (error) throw error;
}

export async function deleteUnavailability(id: string) {
  const { error } = await supabase.from("athlete_unavailability").delete().eq("id", id);
  if (error) throw error;
}

/** Returns unavailability containing the given ISO date (yyyy-MM-dd), if any. */
export function unavailabilityCovering(list: Unavailability[], iso: string): Unavailability | undefined {
  return list.find((u) => u.startDate <= iso && iso <= u.endDate);
}

/** True if the period starts on this date. */
export function isPeriodStart(u: Unavailability, iso: string): boolean {
  return u.startDate === iso;
}

/**
 * Push every calendar item that falls inside a completed unavailability window
 * to sequential days starting `end_date + 2` (reserving `end_date + 1` for the
 * return-to-load session). No-op for ad-hoc strength (no source row).
 */
export async function pushSessionsPastPeriod(args: {
  ownerId: string;
  period: Unavailability;
  items: { source: CalendarSource; sourceId: string; effectiveDate: string }[];
}) {
  const affected = args.items
    .filter((i) => i.source !== "adhoc_strength")
    .filter((i) => i.effectiveDate >= args.period.startDate && i.effectiveDate <= args.period.endDate)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  const startDate = parseISO(args.period.endDate);
  let offset = 2;
  for (const it of affected) {
    const target = fmt(addDays(startDate, offset));
    await setOverride({ ownerId: args.ownerId, source: it.source, sourceId: it.sourceId, date: target });
    offset += 1;
  }
  return affected.length;
}
