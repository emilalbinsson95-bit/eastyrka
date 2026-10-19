import { describe, expect, it } from "vitest";
import { compLiftKey, isCompLift } from "./liftIdentity";

describe("lift identity", () => {
  it("classifies the true competition lifts", () => {
    expect(compLiftKey("Back squat")).toBe("squat");
    expect(compLiftKey("Bench press")).toBe("bench");
    expect(compLiftKey("Deadlift")).toBe("deadlift");
    expect(compLiftKey("Sumo deadlift")).toBe("deadlift");
    expect(compLiftKey("Conventional deadlift")).toBe("deadlift");
  });

  it("counts stance/grip labels and over-warm/opener singles as the comp lift", () => {
    expect(isCompLift("Back squat", "Competition stance")).toBe(true);
    expect(isCompLift("Bench press", "Competition grip & pause")).toBe(true);
    expect(isCompLift("Deadlift", "Sumo stance")).toBe(true);
    expect(isCompLift("Back squat", "Over-warm single")).toBe(true);
    expect(isCompLift("Bench press", "Opener single")).toBe(true);
    expect(isCompLift("Back squat")).toBe(true);
  });

  it("never counts pause/tempo/pin/deficit/block variants as the comp lift", () => {
    expect(isCompLift("Back squat", "Pause squat")).toBe(false);
    expect(isCompLift("Back squat", "Tempo")).toBe(false);
    expect(isCompLift("Back squat", "Pin squat")).toBe(false);
    expect(isCompLift("Deadlift", "Deficit")).toBe(false);
    expect(isCompLift("Deadlift", "Block pull")).toBe(false);
    expect(isCompLift("Bench press", "Spoto press")).toBe(false);
    expect(isCompLift("Bench press", "Larsen press")).toBe(false);
    expect(isCompLift("Bench press", "Touch-and-go")).toBe(false);
    expect(isCompLift("Bench press", "Close grip")).toBe(false);
    expect(isCompLift("Bench press", "Board press")).toBe(false);
    expect(isCompLift("Bench press", "Floor press")).toBe(false);
    expect(isCompLift("Back squat", "High bar")).toBe(false);
  });

  it("never classifies accessories as comp lifts", () => {
    expect(compLiftKey("Front squat")).toBeNull();
    expect(compLiftKey("Incline bench press")).toBeNull();
    expect(compLiftKey("Romanian deadlift")).toBeNull();
  });
});
