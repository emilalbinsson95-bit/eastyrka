import { describe, expect, it } from "vitest";
import { applyBuilders, builderTarget, builderTargetMet, builderTrend, lastTimeText } from "./builderExercises";
import { getTemplate } from "./strengthTemplates";
import { resizeTemplateWeeks } from "./blockLength";
import { applyVolumeGuards } from "./volumeGuards";
import { plannedWeekMetrics } from "./liftMetrics";
import { protocolGroup } from "./setProtocols";

const legPress = { exercise: "Leg Press", perWeek: 1 as const, sets: 3, repMin: 8, repMax: 12, mode: "add" as const, stepKg: 5 };
const standard = () => {
  const t = getTemplate("standard-pl")!;
  return resizeTemplateWeeks(t.buildWeeks(t.daysPerWeek), 3, true);
};
const strip = (weeks: ReturnType<typeof standard>) =>
  weeks.map((w) => w.sessions.map((s) => s.exercises.filter((e) => !e.builder_lift)));

describe("byggövning i generatorn", () => {
  it("benpress för knäböj 1 gång/vecka, 3 × 8–12, Lägg till: en rad per arbetsvecka efter böjarbetet, ingen i avlastning", () => {
    const base = standard();
    const { weeks } = applyBuilders(base, { squat: legPress });
    for (const w of weeks) {
      const rows = w.sessions.flatMap((s) => s.exercises.filter((e) => e.builder_lift));
      if (w.kind === "working") {
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ exercise: "Leg Press", target_sets: 3, target_reps: 8, target_reps_max: 12, target_rpe: 8, builder_lift: "squat", weight_step_kg: 5 });
        const s = w.sessions.find((x) => x.exercises.some((e) => e.builder_lift))!;
        const at = s.exercises.findIndex((e) => e.builder_lift);
        const lastSquat = s.exercises.reduce((acc, e, i) => (!e.builder_lift && /squat/i.test(e.exercise) && !/leg press/i.test(e.exercise) ? i : acc), -1);
        expect(at).toBe(lastSquat + 1);
      } else {
        expect(rows).toHaveLength(0);
      }
    }
  });
  it("alla övriga rader är identiska med ett block utan byggövning", () => {
    const base = standard();
    expect(strip(applyBuilders(base, { squat: legPress }).weeks)).toEqual(strip(base));
  });
  it("2 gånger per vecka ger två pass när lyftet tränas minst två gånger", () => {
    const { weeks } = applyBuilders(standard(), { squat: { ...legPress, perWeek: 2 } });
    const w = weeks.find((x) => x.kind === "working")!;
    expect(w.sessions.filter((s) => s.exercises.some((e) => e.builder_lift)).length).toBe(2);
  });
  it("räknas inte i lyftets set eller mängd och behåller dubbel progression", () => {
    const { weeks } = applyBuilders(standard(), { squat: { ...legPress, exercise: "Hack Squat" } });
    const row = weeks[0].sessions.flatMap((s) => s.exercises).find((e) => e.builder_lift)!;
    expect(protocolGroup(row)).toBeNull();
    const guarded = applyVolumeGuards(weeks);
    const without = applyVolumeGuards(standard());
    expect(strip(guarded)).toEqual(strip(without));
    const m = plannedWeekMetrics(weeks, { "Back squat": 200 });
    const m0 = plannedWeekMetrics(standard(), { "Back squat": 200 });
    expect(m[0].metrics.squat).toEqual(m0[0].metrics.squat);
  });
  it("Ersätt tar lika många set från lättaste huvud-/variantrad, aldrig från mätsetet eller under golvet", () => {
    const week = { week_index: 1, label: "V1", kind: "working" as const, sessions: [
      { day_of_week: 1, title: "A", exercises: [
        { exercise: "Back squat", target_sets: 4, target_reps: 5, target_rpe: 7, intensity_metric: "rpe" as const },
        { exercise: "Pause squat", target_sets: 5, target_reps: 4, target_rpe: 6.5, intensity_metric: "rpe" as const },
        { exercise: "Back squat", variation: "Over-warm single", target_sets: 1, target_reps: 1, target_rpe: 8, intensity_metric: "rpe" as const },
      ] },
      { day_of_week: 3, title: "B", exercises: [
        { exercise: "Back squat", target_sets: 4, target_reps: 6, target_rpe: 6, intensity_metric: "rpe" as const },
        { exercise: "Tempo squat", target_sets: 4, target_reps: 6, target_rpe: 6, intensity_metric: "rpe" as const },
      ] },
    ] };
    const { weeks, warnings } = applyBuilders([week], { squat: { ...legPress, mode: "replace" } });
    expect(warnings).toEqual([]);
    const [a, b] = weeks[0].sessions;
    expect(a.exercises[0].target_sets).toBe(4); // mätset (första tävlingsraden) orört
    expect(b.exercises[0].target_sets).toBe(4); // mätset i pass B orört
    expect(a.exercises.find((e) => e.variation === "Over-warm single")!.target_sets).toBe(1);
    const before = 4 + 5 + 1 + 4 + 4, after = weeks[0].sessions.flatMap((s) => s.exercises).filter((e) => !e.builder_lift).reduce((n, e) => n + e.target_sets, 0);
    expect(before - after).toBe(3);
    expect(b.exercises.find((e) => e.exercise === "Tempo squat")!.target_sets).toBe(2); // lättaste raden först
    const blocked = applyBuilders([week], { squat: { ...legPress, mode: "replace" } }, { floor: { squat: 17 } });
    expect(blocked.weeks[0].sessions.flatMap((s) => s.exercises).filter((e) => !e.builder_lift).map((e) => e.target_sets)).toEqual([4, 5, 1, 4, 4]);
    expect(blocked.warnings.join(" ")).toMatch(/lades till i stället/);
  });
});

describe("byggövning i Idag", () => {
  const prev = [{ weight_kg: 140, reps: 12 }, { weight_kg: 140, reps: 11 }, { weight_kg: 140, reps: 10 }];
  it("efter 140 kg × 12, 11, 10 är målet 34 reps på 140 kg", () => {
    expect(lastTimeText(prev)).toBe("140 kg × 12, 11, 10 (33 reps)");
    const t = builderTarget(prev, 8, 12, 5, 3);
    expect(t).toMatchObject({ kind: "add-reps", weightKg: 140, totalReps: 34 });
  });
  it("efter 140 kg × 12, 12, 12 är målet 145 kg × minst 8 per set", () => {
    const t = builderTarget(prev.map((s) => ({ ...s, reps: 12 })), 8, 12, 5, 3);
    expect(t).toMatchObject({ kind: "add-weight", weightKg: 145, repsPerSet: 8 });
  });
  it("utan historik: välj en vikt du klarar 10 reps på med 2 kvar", () => {
    expect(builderTarget([], 8, 12, 5).text).toBe("Välj en vikt du klarar 10 reps på med 2 kvar.");
  });
  it("bekräftelse när målet nås", () => {
    const t = builderTarget(prev, 8, 12, 5, 3);
    expect(builderTargetMet(t, [{ weight_kg: 140, reps: 12 }, { weight_kg: 140, reps: 12 }, { weight_kg: 140, reps: 10 }], 3)).toBe(true);
    expect(builderTargetMet(t, prev, 3)).toBe(false);
  });
});

describe("byggövning i Analys", () => {
  const s = (date: string, w: number, reps: number[]) => ({ date, sets: reps.map((r) => ({ weight_kg: w, reps: r })) });
  it("ökar när vikten eller totala reps ökat mot tre pass tidigare", () => {
    const t = builderTrend([s("2026-10-01", 140, [10, 9, 8]), s("2026-10-05", 140, [11, 10, 9]), s("2026-10-08", 140, [12, 11, 10]), s("2026-10-12", 140, [12, 12, 11])]);
    expect(t.status).toBe("up");
    expect(t.stalled).toBe(false);
  });
  it("tre pass i rad utan ökning ger förslag", () => {
    const t = builderTrend([s("2026-10-01", 140, [12, 11, 10]), s("2026-10-05", 140, [12, 11, 10]), s("2026-10-08", 140, [12, 10, 10]), s("2026-10-12", 140, [11, 10, 10])]);
    expect(t.stalled).toBe(true);
    expect(t.status).toBe("down");
  });
  it("visar högst sex pass och förändring sedan det första", () => {
    const all = Array.from({ length: 8 }, (_, i) => s(`2026-10-${String(i + 1).padStart(2, "0")}`, 100 + i * 5, [10]));
    const t = builderTrend(all);
    expect(t.sessions).toHaveLength(6);
    expect(t.sessions[0].best.weight_kg).toBe(110);
    expect(t.changePct).toBeCloseTo(22.7, 1);
  });
});
