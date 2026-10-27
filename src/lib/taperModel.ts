// Tävlingsförankrad toppningsmodell ("Toppningsmodul – koncept för automatiserad
// taper med coachstyrning", Emil 2026-10-27). Appen räknar, flaggar och föreslår —
// coachen beslutar. Standardvärdena är startvärden från taper-forskningen
// (Travis 2021, Pritchard 2016/2019, Grgic & Mikulic 2017, Burke 2023,
// Seppänen & Häkkinen 2022, Winwood 2026), inte facit.
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { pctOf1RMInterp } from "./intensity";

export type TaperLiftKey = "squat" | "bench" | "deadlift";
export const TAPER_LIFTS: TaperLiftKey[] = ["squat", "bench", "deadlift"];
export const TAPER_LIFT_LABEL: Record<TaperLiftKey, string> = {
  squat: "Knäböj",
  bench: "Bänkpress",
  deadlift: "Marklyft",
};

/** Coachens elva reglage. Inom intervallet ändras värdet fritt; utanför krävs aktiv bekräftelse. */
export interface TaperSettings {
  /** Taperlängd i dagar (standard 9, intervall 7–14). */
  taperDays: number;
  /** Volymsänkning i tapern som andel (standard 0.5, intervall 0.3–0.6). */
  volumeCut: number;
  /** Stegtaper (standard) eller snabb exponentiell — aldrig gradvis linjär. */
  taperModel: "step" | "exp";
  /** Överbelastningsvecka direkt före taperstart (standard på). */
  overloadWeek: boolean;
  /** Intensitet i tapern: bibehållen (standard, minst 85 % på tunga set), något höjd, eller sänkt 25–30 % när återhämtningen går före (Bell 2025). */
  intensity: "keep" | "raise" | "lower";
  /** Sista tunga passet, dagar före D0 per lyft (standard mark 9, böj 8, bänk 5; ±1). */
  heavyDay: Record<TaperLiftKey, number>;
  /** Last på sista tunga passet som andel av e1RM (standard 0.9125, intervall 0.875–0.95). */
  heavyLoadPct: number;
  heavyRpe: number;
  backoffRpe: number;
  /** Sista passet per lyft, dagar före D0 (standard mark 7, böj 4, bänk 3; ±1). Lyftspecifika uppehåll enligt Bell 2025: mark 7–10, böj 4–7, bänk 2–4 (högst 3 för bänk enligt Travis 2022). */
  lastDay: Record<TaperLiftKey, number>;
  /** Totalt träningsuppehåll före D0 (standard 2, intervall 2–3). */
  restDays: number;
  /** Assistansövningar tas bort från detta antal dagar före D0 (standard 14, intervall 10–21). */
  accessoriesOutDay: number;
  /** Frekvens sista veckan: halverad (standard) eller oförändrad. */
  finalWeekFreq: "half" | "same";
}

export const DEFAULT_TAPER_SETTINGS: TaperSettings = {
  taperDays: 9,
  volumeCut: 0.5,
  taperModel: "step",
  overloadWeek: true,
  intensity: "keep",
  heavyDay: { squat: 8, bench: 5, deadlift: 9 },
  heavyLoadPct: 0.9125,
  heavyRpe: 8,
  backoffRpe: 7.5,
  lastDay: { squat: 4, bench: 3, deadlift: 7 },
  restDays: 2,
  accessoriesOutDay: 14,
  finalWeekFreq: "half",
};

/** Konstruktionsgränser kring det studierna rapporterar. */
export const TAPER_RANGES = {
  taperDays: { min: 7, max: 14 },
  volumeCut: { min: 0.3, max: 0.6 },
  heavyLoadPct: { min: 0.875, max: 0.95 },
  heavyRpe: { min: 7, max: 8.5 },
  restDays: { min: 2, max: 3 },
  accessoriesOutDay: { min: 10, max: 21 },
  heavyDay: { min: -1, max: 1 }, // avvikelse från standard, per lyft
  lastDay: { min: -1, max: 1 },
} as const;

export function resolveTaperSettings(partial?: Partial<TaperSettings>): TaperSettings {
  const p = partial ?? {};
  return {
    ...DEFAULT_TAPER_SETTINGS,
    ...p,
    heavyDay: { ...DEFAULT_TAPER_SETTINGS.heavyDay, ...(p.heavyDay ?? {}) },
    lastDay: { ...DEFAULT_TAPER_SETTINGS.lastDay, ...(p.lastDay ?? {}) },
  };
}

/** Värden utanför intervallet kräver aktiv bekräftelse av coachen (skäl sparas). */
export function taperSettingsOutOfRange(s: TaperSettings): string[] {
  const out: string[] = [];
  const R = TAPER_RANGES;
  if (s.taperDays < R.taperDays.min || s.taperDays > R.taperDays.max) out.push("taperDays");
  if (s.volumeCut < R.volumeCut.min || s.volumeCut > R.volumeCut.max) out.push("volumeCut");
  if (s.heavyLoadPct < R.heavyLoadPct.min || s.heavyLoadPct > R.heavyLoadPct.max) out.push("heavyLoadPct");
  if (s.heavyRpe < 7 || s.heavyRpe > 8.5) out.push("heavyRpe");
  if (s.backoffRpe < 7 || s.backoffRpe > 8.5) out.push("backoffRpe");
  if (s.restDays < R.restDays.min || s.restDays > R.restDays.max) out.push("restDays");
  if (s.accessoriesOutDay < R.accessoriesOutDay.min || s.accessoriesOutDay > R.accessoriesOutDay.max) out.push("accessoriesOutDay");
  for (const k of TAPER_LIFTS) {
    if (Math.abs(s.heavyDay[k] - DEFAULT_TAPER_SETTINGS.heavyDay[k]) > 1) out.push(`heavyDay.${k}`);
    if (Math.abs(s.lastDay[k] - DEFAULT_TAPER_SETTINGS.lastDay[k]) > 1) out.push(`lastDay.${k}`);
  }
  return out;
}

export interface TaperLiftInput {
  /** Atletens eget övningsnamn för lyftet. */
  name: string;
  e1rm: number | null;
  weeklySets: number;
  setsPerExposure: number;
  exposuresPerWeek: number;
  trained: boolean;
}

export interface TaperAccessoryInput {
  exercise: string;
  variation?: string;
  weeklySets: number;
  reps: number;
}

export interface TaperExercise {
  exercise: string;
  variation?: string;
  sets: number;
  reps: number;
  /** Andel av e1RM när lasten är procentstyrd. */
  pctOfE1rm?: number;
  rpe?: number;
  isTechnique?: boolean;
  /** Last i kg, avrundad till 2,5 kg. Null utan e1RM-underlag. */
  kg?: number | null;
  notes?: string;
}

/**
 * Träningsdagar räknade bakåt från D0 (dagar före tävling, modulo 7), så att
 * regeldagarna (mark D−7, bänk D−5/D−3 m.fl.) hamnar på riktiga träningsdagar
 * oavsett vilken veckodag tävlingen är. D−1/D−2 är alltid vila.
 */
const D0_PATTERNS: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 3, 5],
  4: [0, 1, 3, 5],
  5: [0, 1, 2, 3, 5],
  6: [0, 1, 2, 3, 4, 5],
};
export function d0TrainingWeekdays(competitionDate: string, daysPerWeek: number): number[] {
  const offsets = D0_PATTERNS[daysPerWeek] ?? D0_PATTERNS[4];
  return [...new Set(offsets.map((m) => {
    const d = addDays(parseISO(competitionDate), -(m === 0 ? 7 : m)).getDay();
    return d === 0 ? 7 : d;
  }))].sort((a, b) => a - b);
}

/** Variationer av tävlingslyften (smalgrepp, touch-and-go, paus …). */
const VARIANT_RE = /squat|bench|deadlift|knäböj|bänk|marklyft/i;
/** Tung underkroppsassistans — tas bort från assistansdagen. */
const HEAVY_LOWER_RE = /nordic|leg curl|hamstring|lunge|split|leg press|rdl|romanian|good ?morning|hip thrust|step.?up|hack/i;
/** Lätta övningar med låg trötthet som kan ligga kvar längre in i toppningen. */
const LOW_FATIGUE_RE = /face ?pull|rear.?delt|row|curl|pushdown|tricep|skull|lateral|fly|plank|pallof|core|ab |abs|crunch|calf|band|pull.?apart|back extension|dead ?bug|bird ?dog/i;
const isVariant = (a: TaperAccessoryInput) => VARIANT_RE.test(a.exercise) && !HEAVY_LOWER_RE.test(a.exercise);
const isLowFatigue = (a: TaperAccessoryInput) => !VARIANT_RE.test(a.exercise) && !HEAVY_LOWER_RE.test(a.exercise) && LOW_FATIGUE_RE.test(a.exercise);

export type TaperPhase = "volymtopp" | "intensifiering" | "overbelastning" | "taper" | "vila" | "tavling";

export interface TaperSession {
  /** ISO-datum, alltid en av atletens träningsdagar (utom tävlingsdagen). */
  date: string;
  phase: TaperPhase;
  title: string;
  exercises: TaperExercise[];
}

export interface TaperPlan {
  competitionDate: string;
  settings: TaperSettings;
  sessions: TaperSession[];
  /** Hårda varningar som alltid visas, oavsett vem som ställt in reglagen. */
  warnings: string[];
  phases: Array<{ phase: TaperPhase; label: string; start: string; end: string }>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Laster avrundas till 2,5 kg. */
export const round25 = (kg: number) => Math.round(kg / 2.5) * 2.5;

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const daysBefore = (d0: string, n: number) => iso(addDays(parseISO(d0), -n));

/** ISO-veckodag 1 (mån) – 7 (sön). */
const weekday = (date: string) => {
  const d = parseISO(date).getDay();
  return d === 0 ? 7 : d;
};

/**
 * En regeldag som inte är träningsdag flyttas till närmaste träningsdag FÖRE,
 * aldrig efter, så att återhämtningen inte kortas.
 */
export function snapToTrainingDay(target: string, trainingWeekdays: number[]): string {
  for (let back = 0; back < 7; back++) {
    const candidate = daysBefore(target, back);
    if (trainingWeekdays.includes(weekday(candidate))) return candidate;
  }
  return target;
}

/** Startmallar från Travis 2021 (enkät, 364 lyftare): tunga passet per lyft. */
const HEAVY_SCHEME: Record<TaperLiftKey, { sets: number; reps: number }> = {
  deadlift: { sets: 3, reps: 1 },
  squat: { sets: 3, reps: 2 },
  bench: { sets: 3, reps: 3 },
};

/** Sista lätta passet: 70–75 % för mark, 75–80 % för böj och bänk. */
const LIGHT_PCT: Record<TaperLiftKey, number> = { deadlift: 0.725, squat: 0.775, bench: 0.775 };

export function buildTaperPlan(input: {
  competitionDate: string;
  /** Atletens träningsdagar som ISO-veckodagar (1=mån … 7=sön). */
  trainingWeekdays: number[];
  lifts: Record<TaperLiftKey, TaperLiftInput>;
  accessories?: TaperAccessoryInput[];
  settings?: Partial<TaperSettings>;
  startDate?: string;
  endDate?: string;
  singlesEnabled?: boolean;
}): TaperPlan {
  const s = resolveTaperSettings(input.settings);
  const d0 = input.competitionDate;
  const weekdays = [...new Set(input.trainingWeekdays)].sort((a, b) => a - b);
  const active = TAPER_LIFTS.filter((k) => input.lifts[k].trained);
  const lift = (k: TaperLiftKey) => input.lifts[k];

  const phases: TaperPlan["phases"] = [
    { phase: "volymtopp", label: "Volymtopp", start: daysBefore(d0, 42), end: daysBefore(d0, 22) },
    { phase: "intensifiering", label: "Intensifiering", start: daysBefore(d0, 21), end: daysBefore(d0, s.taperDays + 1) },
    { phase: "taper", label: "Stegtaper", start: daysBefore(d0, s.taperDays), end: daysBefore(d0, s.restDays + 1) },
    { phase: "vila", label: "Vila", start: daysBefore(d0, s.restDays), end: daysBefore(d0, 1) },
    { phase: "tavling", label: "Tävling", start: d0, end: d0 },
  ];

  const phaseOf = (date: string): TaperPhase => {
    const n = differenceInCalendarDays(parseISO(d0), parseISO(date));
    if (n <= 0) return "tavling";
    if (n <= s.restDays) return "vila";
    if (n <= s.taperDays) return "taper";
    if (n <= 21) return "intensifiering";
    return "volymtopp";
  };

  // Alla träningsdagar i fönstret D-42 … D-1.
  const trainingDates: string[] = [];
  for (let n = 42; n >= 1; n--) {
    const date = daysBefore(d0, n);
    if ((!input.startDate || date >= input.startDate) && (!input.endDate || date <= input.endDate) && weekdays.includes(weekday(date))) trainingDates.push(date);
  }

  const byDate = new Map<string, TaperSession>();
  const sessionAt = (date: string, title: string): TaperSession => {
    const existing = byDate.get(date);
    if (existing) return existing; // Krockar: två lyft samma dag slås ihop till ett pass.
    const session: TaperSession = { date, phase: phaseOf(date), title, exercises: [] };
    byDate.set(date, session);
    return session;
  };

  // Bibehållen intensitet = minst 85 % av 1RM på de tunga seten; sänkt 25–30 %
  // (Bell 2025) används när återhämtningen går före.
  const pctFor = (base: number) =>
    s.intensity === "raise" ? Math.min(0.975, base + 0.025) : s.intensity === "lower" ? base * 0.72 : base;
  const taperWorkPct = s.intensity === "raise" ? 0.875 : s.intensity === "lower" ? 0.7 : 0.85;
  const kgFor = (k: TaperLiftKey, pct: number): number | null => {
    const e = lift(k).e1rm;
    return e != null && e > 0 ? round25(e * pct) : null;
  };

  // --- Regeldagar: sista tunga passet och sista passet per lyft ---
  const ruleDays = new Set<string>();
  for (const k of active) {
    const heavy = snapToTrainingDay(daysBefore(d0, s.heavyDay[k]), weekdays);
    const last = snapToTrainingDay(daysBefore(d0, s.lastDay[k]), weekdays);
    ruleDays.add(heavy);
    ruleDays.add(last);
    if (!trainingDates.includes(heavy) || !trainingDates.includes(last)) continue;
    const heavyRpe = clamp(s.heavyRpe, 7, 8.5);
    const backoffRpe = clamp(s.backoffRpe, 7, 8.5);
    const heavyReps=k==="deadlift"&&!input.singlesEnabled?2:HEAVY_SCHEME[k].reps;
    const heavyPct = pctOf1RMInterp(k === "deadlift" ? heavyRpe : backoffRpe, heavyReps) / 100;
    if (input.singlesEnabled && k !== "deadlift") {
      const pct = pctOf1RMInterp(heavyRpe, 1) / 100;
      sessionAt(heavy, `Sista tunga passet — ${TAPER_LIFT_LABEL[k]}`).exercises.push({ exercise: lift(k).name, sets: 1, reps: 1, rpe: heavyRpe, pctOfE1rm: pct, kg: kgFor(k, pct), notes: "Coachvald singel, ersätter ett arbetsset." });
    }
    sessionAt(heavy, `Sista tunga passet — ${TAPER_LIFT_LABEL[k]}`).exercises.push({
      exercise: lift(k).name,
      sets: Math.max(2, Math.min(HEAVY_SCHEME[k].sets, Math.round(lift(k).setsPerExposure)) - (input.singlesEnabled && k !== "deadlift" ? 1 : 0)),
      reps: heavyReps,
      rpe: k === "deadlift" ? heavyRpe : backoffRpe,
      pctOfE1rm: heavyPct,
      kg: kgFor(k, heavyPct),
      notes: `Sista tunga ${TAPER_LIFT_LABEL[k].toLowerCase()}et före tävlingen, ${Math.round(heavyPct * 1000) / 10} % av e1RM.`,
    });
    sessionAt(last, `Sista passet — ${TAPER_LIFT_LABEL[k]}`).exercises.push({
      exercise: lift(k).name,
      sets: 2,
      reps: 2,
      pctOfE1rm: LIGHT_PCT[k],
      isTechnique: true,
      kg: kgFor(k, LIGHT_PCT[k]),
      notes: "Lätt rörelsekänsla — samma uppställning och kommandon som på plattformen.",
    });
  }

  // --- Tapervolym: referensvolym minus vald sänkning, fördelad på taperns pass ---
  const accessoriesOut = daysBefore(d0, s.accessoriesOutDay);
  const taperDates = trainingDates.filter((d) => phaseOf(d) === "taper");
  const taperSlots = s.finalWeekFreq === "half"
    ? taperDates.filter((_, i) => i % 2 === 0) // frekvensen halveras de sista sju dagarna
    : taperDates;
  for (const k of active) {
    const info = lift(k);
    const ref = info.weeklySets > 0 ? info.weeklySets : info.setsPerExposure * Math.max(1, info.exposuresPerWeek);
    const taperSetBudget = Math.max(0, Math.round(ref * (1 - s.volumeCut) * (s.taperDays / 7)));
    const placed = [...byDate.values()]
      .filter((ses) => ses.phase === "taper")
      .flatMap((ses) => ses.exercises)
      .filter((e) => e.exercise === info.name)
      .reduce((n, e) => n + e.sets, 0);
    let remaining = Math.max(0, taperSetBudget - placed);
    // Helst egna taperdagar; finns inga lediga läggs fyllnadsseten på
    // regeldagarnas pass så att volymsänkningen ändå blir rätt.
    const openSlots = taperSlots.filter((d) => !ruleDays.has(d));
    const slots = (openSlots.length > 0 ? openSlots : taperSlots).filter(d => d < snapToTrainingDay(daysBefore(d0, s.lastDay[k]), weekdays));
    for (const d of slots) {
      if (remaining <= 0) break;
      const sets = Math.min(remaining, Math.max(2, Math.round(info.setsPerExposure * (1 - s.volumeCut))));
      remaining -= sets;
      sessionAt(d, "Taperpass").exercises.push({
        exercise: info.name,
        sets,
        reps: 2,
        pctOfE1rm: taperWorkPct,
        kg: kgFor(k, taperWorkPct),
        notes: "Taper: volymen nere, intensiteten kvar. Korta, snabba set.",
      });
    }
  }

  // --- Volymtopp, intensifiering och överbelastning: atletens eget mönster ---
  // Exponeringarna sprids jämnt över hela perioden före tapern (inte per
  // kalendervecka), så att samma lyft inte hamnar två dagar i rad och så att
  // lyften fördelas på olika dagar. Lasten styrs av RPE via RTS-tabellen.
  const overloadStart = s.overloadWeek ? daysBefore(d0, s.taperDays + 7) : null;
  const preDates = trainingDates.filter((d) => {
    const p = phaseOf(d);
    return p === "volymtopp" || p === "intensifiering";
  });
  for (const d of preDates) {
    const isOverload = overloadStart != null && d >= overloadStart;
    const ses = sessionAt(d, isOverload ? "Överbelastningsvecka" : phaseOf(d) === "intensifiering" ? "Intensifiering" : "Volymtopp");
    if (isOverload) { ses.phase = "overbelastning"; if (ses.title === "Taperpass") ses.title = "Överbelastningsvecka"; }
  }
  if (preDates.length > 0) {
    const firstDay = [input.startDate, daysBefore(d0, 42)].filter(Boolean).sort().reverse()[0] as string;
    const lastPreDay = daysBefore(d0, s.taperDays + 1);
    const preSpan = Math.max(1, differenceInCalendarDays(parseISO(lastPreDay), parseISO(firstDay)) + 1);
    const OFFSET: Record<TaperLiftKey, number> = { squat: 0, bench: 1 / 3, deadlift: 2 / 3 };
    for (const k of active) {
      const info = lift(k);
      const heavyDate = snapToTrainingDay(daysBefore(d0, s.heavyDay[k]), weekdays);
      const dates = preDates.filter((d) => d < heavyDate);
      if (dates.length === 0) continue;
      const perWeek = Math.max(1, Math.round(info.exposuresPerWeek || 1));
      const count = Math.min(dates.length, Math.max(1, Math.round(perWeek * preSpan / 7)));
      const chosen = new Set<number>();
      for (let i = 0; i < count; i++) {
        let idx = Math.min(dates.length - 1, Math.floor((i + OFFSET[k]) * dates.length / count));
        while (chosen.has(idx) && idx < dates.length - 1) idx++;
        while (chosen.has(idx) && idx > 0) idx--;
        chosen.add(idx);
      }
      [...chosen].sort((a, b) => a - b).forEach((idx, n) => {
        const d = dates[idx];
        const ses = byDate.get(d)!;
        const isOverload = ses.phase === "overbelastning";
        const intens = phaseOf(d) === "intensifiering" || isOverload;
        // Första exponeringen varje vecka är den tunga; övriga är lättare volym.
        const primary = n % perWeek === 0;
        const reps = intens ? (primary ? 3 : 4) : 5;
        const rpe = intens ? (primary ? 8 : isOverload ? 7.5 : 7) : primary ? 7.5 : 7;
        const pct = pctOf1RMInterp(rpe, reps) / 100;
        const sets = Math.max(2, Math.round(info.setsPerExposure || 3)) + (isOverload && primary ? 1 : 0);
        ses.exercises.unshift({
          exercise: info.name,
          sets,
          reps,
          rpe,
          pctOfE1rm: pct,
          kg: kgFor(k, pct),
          notes: isOverload
            ? "Överbelastningsvecka: tillfälligt EAk-tapp är planerat och räknas inte som en dålig dag."
            : primary ? "Tyngsta passet för lyftet den här veckan." : "Lättare volympass.",
        });
      });
    }
  }

  // --- Inga tomma eller tunna pass ---
  // Inget pass ska bli "åka till gymmet för några set bänk och hem igen".
  // Före tapern: atletens egna variationer och assistans (sänkt dos efter
  // assistansdagen). I tapern: lätt teknik på lyften före deras sista
  // exponering och lätta övningar med låg trötthet fram till D−5.
  const accessories = input.accessories ?? [];
  const keyOf = (e: { exercise: string; variation?: string }) => `${e.exercise.toLowerCase()}|${(e.variation ?? "").toLowerCase()}`;
  let rotation = 0;
  for (const ses of [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    const n = differenceInCalendarDays(parseISO(d0), parseISO(ses.date));
    const isTaper = ses.phase === "taper";
    const isPre = ses.phase === "volymtopp" || ses.phase === "intensifiering" || ses.phase === "overbelastning";
    if (!isTaper && !isPre) continue;
    const target = isTaper ? 7 : 10;
    let total = ses.exercises.reduce((sum, e) => sum + e.sets, 0);
    const present = new Set(ses.exercises.map(keyOf));
    const presentLifts = new Set(ses.exercises.map((e) => e.exercise));
    const techniqueFill = () => {
      for (const k of active) {
        if (total >= target) break;
        if (presentLifts.has(lift(k).name)) continue;
        if (ses.date >= snapToTrainingDay(daysBefore(d0, s.lastDay[k]), weekdays)) continue;
        ses.exercises.push({
          exercise: lift(k).name,
          sets: 2,
          reps: isTaper ? 2 : 3,
          pctOfE1rm: LIGHT_PCT[k],
          isTechnique: true,
          kg: kgFor(k, LIGHT_PCT[k]),
          notes: "Lätt teknikarbete — håller rörelsen färsk utan att trötta.",
        });
        presentLifts.add(lift(k).name);
        total += 2;
      }
    };
    if (isTaper) techniqueFill();
    const eligible = accessories.filter((a) => {
      if (isTaper) return n >= 5 && isLowFatigue(a);
      if (ses.date < accessoriesOut) return true;
      return isVariant(a) || isLowFatigue(a);
    });
    let added = 0;
    const maxAdded = isTaper ? 2 : 3;
    for (let i = 0; i < eligible.length && total < target && added < maxAdded; i++) {
      const a = eligible[(rotation + i) % eligible.length];
      if (present.has(keyOf(a))) continue;
      const full = !isTaper && ses.date < accessoriesOut;
      const sets = full ? Math.min(3, Math.max(2, Math.round(a.weeklySets / 2))) : 2;
      ses.exercises.push({
        exercise: a.exercise,
        ...(a.variation ? { variation: a.variation } : {}),
        sets,
        reps: a.reps,
        rpe: full ? 7.5 : 7,
        notes: full
          ? "Underhållsdos — aldrig till failure."
          : isVariant(a)
            ? "Variation i sänkt dos inför tävlingen — snabba, rena reps."
            : "Lätt underhåll — långt från failure, ska inte trötta.",
      });
      present.add(keyOf(a));
      total += sets;
      added += 1;
    }
    rotation += 1;
    if (!isTaper) techniqueFill();
  }

  const sessions = [...byDate.values()]
    .filter((ses) => ses.exercises.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Hårda varningar, alltid aktiva ---
  const warnings: string[] = [];
  const benchDates = sessions.filter((ses) => ses.exercises.some((e) => e.exercise === lift("bench").name)).map((ses) => ses.date);
  const lastBench = benchDates[benchDates.length - 1];
  if (lift("bench").trained && lastBench && differenceInCalendarDays(parseISO(d0), parseISO(lastBench)) > 3) {
    warnings.push("Mer än 3 dagars uppehåll med bänk före tävlingen — bänkstyrkan sjönk efter 4–5 dagar i Travis 2022 och Burke 2023.");
  }
  let prev: string | null = null;
  for (const ses of sessions) {
    if (prev && differenceInCalendarDays(parseISO(ses.date), parseISO(prev)) >= 7) {
      warnings.push(`En vecka eller mer utan träning (${prev} → ${ses.date}) — elitlyftare beskrev det som en misslyckad taper i Pritchard 2016.`);
    }
    prev = ses.date;
  }
  if (prev && differenceInCalendarDays(parseISO(d0), parseISO(prev)) >= 7) {
    warnings.push("En vecka eller mer utan träning före tävlingen — elitlyftare beskrev det som en misslyckad taper i Pritchard 2016.");
  }

  return { competitionDate: d0, settings: s, sessions, warnings, phases };
}
