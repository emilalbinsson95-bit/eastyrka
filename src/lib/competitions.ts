import { supabase } from "@/integrations/supabase/client";

export type Competition = {
  id: string;
  athleteId: string;
  name: string;
  date: string; // yyyy-MM-dd
  notes: string | null;
  createdBy: string | null;
};

function fmt(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Competitions for an athlete within a date range (inclusive). */
export async function fetchCompetitions(
  athleteId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<Competition[]> {
  const { data, error } = await supabase
    .from("competitions")
    .select("id, athlete_id, name, comp_date, notes, created_by")
    .eq("athlete_id", athleteId)
    .gte("comp_date", rangeStart)
    .lte("comp_date", rangeEnd)
    .order("comp_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    athleteId: r.athlete_id as string,
    name: r.name as string,
    date: fmt(r.comp_date as string),
    notes: (r.notes as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
  }));
}

export async function createCompetition(input: {
  athleteId: string;
  name: string;
  date: string;
  notes?: string | null;
  createdBy: string | null;
}) {
  const { error } = await supabase.from("competitions").insert({
    athlete_id: input.athleteId,
    name: input.name,
    comp_date: input.date,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function deleteCompetition(id: string) {
  const { error } = await supabase.from("competitions").delete().eq("id", id);
  if (error) throw error;
}
