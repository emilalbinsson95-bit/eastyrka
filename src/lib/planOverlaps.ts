import { plannedSessionDate } from "@/lib/planned-session-dates";

/**
 * Överlappande träningsplaner: två block (mesocykler) med pass inom samma
 * datumspann. Räknas på passens datum, inte veckostarter, eftersom D0-toppningar
 * kan börja vilken veckodag som helst.
 */
export interface OverlapWeekInput {
  mesocycle_id: string | null;
  mesocycle_name: string;
  status: string;
  week_start_date: string;
  sessions: Array<{ day_of_week: number | null; title?: string | null; exerciseCount: number }>;
}

export interface PlanSessionDate {
  date: string;
  published: boolean;
}

export interface PlanOverlap {
  a: { id: string; name: string };
  b: { id: string; name: string };
  from: string;
  to: string;
  /** Passdatum (båda blocken) inom överlappet. */
  dates: string[];
  /** Båda blocken har publicerade pass inom överlappet: atleten ser två planer. */
  bothPublished: boolean;
}

export function planSessionDates(weeks: OverlapWeekInput[]) {
  const plans = new Map<string, { name: string; dates: PlanSessionDate[] }>();
  for (const w of weeks) {
    if (!w.mesocycle_id) continue;
    const plan = plans.get(w.mesocycle_id) ?? { name: w.mesocycle_name, dates: [] };
    for (const s of w.sessions) {
      if (!(s.exerciseCount > 0)) continue;
      plan.dates.push({ date: plannedSessionDate(w.week_start_date, s, w.sessions), published: w.status === "published" });
    }
    plans.set(w.mesocycle_id, plan);
  }
  for (const p of plans.values()) p.dates.sort((x, y) => x.date.localeCompare(y.date));
  return plans;
}

export function findPlanOverlaps(weeks: OverlapWeekInput[], opts: { includeDraftOnly?: boolean } = {}): PlanOverlap[] {
  const plans = [...planSessionDates(weeks).entries()].filter(([, p]) => p.dates.length > 0);
  const out: PlanOverlap[] = [];
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      const [idA, a] = plans[i]!;
      const [idB, b] = plans[j]!;
      const from = [a.dates[0]!.date, b.dates[0]!.date].sort()[1]!;
      const to = [a.dates[a.dates.length - 1]!.date, b.dates[b.dates.length - 1]!.date].sort()[0]!;
      if (from > to) continue;
      const inA = a.dates.filter((d) => d.date >= from && d.date <= to);
      const inB = b.dates.filter((d) => d.date >= from && d.date <= to);
      const bothPublished = inA.some((d) => d.published) && inB.some((d) => d.published);
      const anyPublished = inA.some((d) => d.published) || inB.some((d) => d.published);
      if (!anyPublished && !opts.includeDraftOnly) continue;
      const [first, second] = a.dates[0]!.date <= b.dates[0]!.date ? [[idA, a], [idB, b]] as const : [[idB, b], [idA, a]] as const;
      out.push({
        a: { id: first[0], name: first[1].name },
        b: { id: second[0], name: second[1].name },
        from,
        to,
        dates: [...new Set([...inA, ...inB].map((d) => d.date))].sort(),
        bothPublished,
      });
    }
  }
  return out.sort((x, y) => Number(y.bothPublished) - Number(x.bothPublished) || x.from.localeCompare(y.from));
}
