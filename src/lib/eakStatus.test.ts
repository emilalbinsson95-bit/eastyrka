import { describe, expect, it } from "vitest";
import { eakVolumeAdvice } from "./eakStatus";
import { DEFAULT_STRATEGY, STRATEGY_PRESETS, matchPreset, presetFormValues, strategyFromRow, strategyValuesToRow } from "./eakStrategy";

describe("EAk-förslag i generatorn", () => {
  it("bromsa ger ett set mindre även när förra blocket föreslog mer", () => {
    expect(eakVolumeAdvice(1, "red")).toEqual({ delta: -1, byEak: true });
    expect(eakVolumeAdvice(0, "red_strong").delta).toBe(-1);
  });
  it("bevaka eller brusigt block lägger aldrig till set", () => {
    expect(eakVolumeAdvice(1, "yellow").delta).toBe(0);
    expect(eakVolumeAdvice(1, "low_confidence").delta).toBe(0);
    expect(eakVolumeAdvice(-1, "yellow").delta).toBe(-1);
  });
  it("utan EAk eller vid redo för mer gäller förra blockets förslag", () => {
    expect(eakVolumeAdvice(1, "push")).toEqual({ delta: 1, byEak: false });
    expect(eakVolumeAdvice(1, null).delta).toBe(1);
  });
});

describe("färdiga EAk-nivåer", () => {
  it("standard sparar tomma fält och följer 5/10/104/106", () => {
    const row = strategyValuesToRow(presetFormValues("standard"));
    expect(Object.values(row).every((v) => v === null)).toBe(true);
    expect(matchPreset(strategyFromRow(row))).toBe("standard");
    expect(DEFAULT_STRATEGY).toMatchObject({ fallStage1Pct: 5, fallStage2Pct: 10, pushLowPct: 104, pushHighPct: 106 });
  });
  it("försiktig bromsar tidigare och offensiv föreslår mer tidigare", () => {
    const careful = strategyFromRow(strategyValuesToRow(presetFormValues("careful")));
    const offensive = strategyFromRow(strategyValuesToRow(presetFormValues("offensive")));
    expect(careful.fallStage1Pct).toBeLessThan(DEFAULT_STRATEGY.fallStage1Pct);
    expect(careful.pushLowPct).toBeGreaterThan(DEFAULT_STRATEGY.pushLowPct);
    expect(offensive.fallStage2Pct).toBeGreaterThan(DEFAULT_STRATEGY.fallStage2Pct);
    expect(offensive.pushLowPct).toBeLessThan(DEFAULT_STRATEGY.pushLowPct);
    expect(matchPreset(careful)).toBe("careful");
    expect(matchPreset(offensive)).toBe("offensive");
  });
  it("nivåerna rör inte gränserna för tapp inom passet", () => {
    for (const p of STRATEGY_PRESETS) {
      expect(p.values).not.toHaveProperty("inSessionDropStopPct");
      expect(p.values).not.toHaveProperty("inSessionDropOkPct");
    }
  });
  it("egna gränser räknas inte som en nivå", () => {
    expect(matchPreset({ fallStage1Pct: "6" })).toBeNull();
  });
});
