import { describe, expect, it } from "vitest";
import { aggregateMacros, calculateBmi, calculateStreak, calculateVolume, kgFromUnit, nextTemplatePosition, valueInUnit, weekCompletion } from "./metrics";

describe("canonical units", () => {
  it("converts pounds at the UI boundary", () => {
    expect(kgFromUnit(220, "lb")).toBeCloseTo(99.79, 1);
    expect(valueInUnit(100, "lb")).toBeCloseTo(220.46, 1);
  });
});

describe("training metrics", () => {
  it("calculates BMI only when height exists", () => {
    expect(calculateBmi(81, 180)).toBe(25);
    expect(calculateBmi(81, null)).toBeNull();
  });

  it("keeps a streak through consecutive days and gaps", () => {
    expect(calculateStreak(["2026-08-01", "2026-08-02", "2026-08-03"], new Date("2026-08-03T12:00:00"))).toBe(3);
    expect(calculateStreak(["2026-07-30", "2026-08-03"], new Date("2026-08-03T12:00:00"))).toBe(1);
    expect(calculateStreak([], new Date("2026-08-03T12:00:00"))).toBe(0);
  });

  it("builds a Monday-first week strip", () => {
    const week = weekCompletion(["2026-08-03"], new Date("2026-08-03T12:00:00"));
    expect(week[0].date).toBe("2026-08-03");
    expect(week[0].complete).toBe(true);
    expect(week).toHaveLength(7);
  });

  it("counts only completed weighted volume", () => {
    expect(calculateVolume([{ weightKg: 50, reps: 8, completed: true }, { weightKg: 50, reps: null, completed: true }, { weightKg: 40, reps: 10, completed: false }])).toBe(400);
  });

  it("aggregates daily macros and rotates templates", () => {
    expect(aggregateMacros([{ date: "2026-08-03", calories: 500, protein: 30, carbs: 50, fat: 10 }, { date: "2026-08-03", calories: 300, protein: 20, carbs: 20, fat: 5 }])["2026-08-03"]).toEqual({ date: "2026-08-03", calories: 800, protein: 50, carbs: 70, fat: 15 });
    expect(nextTemplatePosition([0, 1, 2], 1)).toBe(2);
    expect(nextTemplatePosition([0, 1, 2], 2)).toBe(0);
    expect(nextTemplatePosition([0, 1, 2], null)).toBe(0);
  });
});
