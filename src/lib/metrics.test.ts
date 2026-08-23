import { describe, expect, it } from "vitest";
import { activityMultiplier, aggregateMacros, calculateBmi, calculateBmr, calculateCalorieTargets, calculateStreak, calculateTdee, calculateVolume, calorieGoalLabel, estimateOneRepMax, firstName, getFatTarget, getMacroTargets, getProteinTargets, isDateInLoggingWindow, kgFromUnit, loggingWindow, nextTemplatePosition, shortWorkoutName, valueInUnit, weekCompletion } from "./metrics";

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

  it("calculates Mifflin-St Jeor BMR for men and women", () => {
    expect(calculateBmr(81, 180, 30, "male")).toBe(1790);
    expect(calculateBmr(70, 165, 40, "female")).toBe(1370);
  });

  it("scales BMR to TDEE by activity level", () => {
    expect(calculateTdee(1790, "moderate")).toBe(2775);
    expect(calculateTdee(1790, "sedentary")).toBe(2148);
    expect(calculateTdee(1790, null)).toBeNull();
  });

  it("exposes the standard activity multipliers", () => {
    expect(activityMultiplier("veryActive")).toBe(1.9);
    expect(activityMultiplier("moderate")).toBe(1.55);
    expect(activityMultiplier(null)).toBeNull();
  });

  it("builds selectable calorie targets from TDEE", () => {
    expect(calculateCalorieTargets(2560).map(({ value, label, calories }) => ({ value, label, calories }))).toEqual([
      { value: "cut", label: "Cut", calories: 2060 },
      { value: "maintain", label: "Maintain", calories: 2560 },
      { value: "bulk", label: "Bulk", calories: 2810 },
    ]);
    expect(calorieGoalLabel("bulk")).toBe("Bulk");
    expect(calorieGoalLabel(null)).toBeNull();
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

  it("keeps the logging window to seven days on either side", () => {
    const from = new Date("2026-08-03T12:00:00");
    const window = loggingWindow([], from);
    expect(window).toHaveLength(15);
    expect(window[0].date).toBe("2026-07-27");
    expect(window[7].date).toBe("2026-08-03");
    expect(window[14].date).toBe("2026-08-10");
    expect(isDateInLoggingWindow("2026-07-27", from)).toBe(true);
    expect(isDateInLoggingWindow("2026-08-10", from)).toBe(true);
    expect(isDateInLoggingWindow("2026-07-26", from)).toBe(false);
    expect(isDateInLoggingWindow("2026-08-11", from)).toBe(false);
  });

  it("counts only completed weighted volume", () => {
    expect(calculateVolume([{ weightKg: 50, reps: 8, completed: true }, { weightKg: 50, reps: null, completed: true }, { weightKg: 40, reps: 10, completed: false }])).toBe(400);
  });

  it("estimates 1RM with the Epley formula", () => {
    expect(estimateOneRepMax(80, 8)).toBeCloseTo(101.33, 1);
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(60, 0)).toBeNull();
  });

  it("aggregates daily macros and rotates templates", () => {
    expect(aggregateMacros([{ date: "2026-08-03", calories: 500, protein: 30, carbs: 50, fat: 10 }, { date: "2026-08-03", calories: 300, protein: 20, carbs: 20, fat: 5 }])["2026-08-03"]).toEqual({ date: "2026-08-03", calories: 800, protein: 50, carbs: 70, fat: 15 });
    expect(nextTemplatePosition([0, 1, 2], 1)).toBe(2);
    expect(nextTemplatePosition([0, 1, 2], 2)).toBe(0);
    expect(nextTemplatePosition([0, 1, 2], null)).toBe(0);
  });

  it("extracts first name with fallback", () => {
    expect(firstName("Adam Smith")).toBe("Adam");
    expect(firstName("  Alice   ")).toBe("Alice");
    expect(firstName("")).toBe("there");
    expect(firstName(null)).toBe("there");
    expect(firstName("   ")).toBe("there");
    expect(firstName(undefined)).toBe("there");
    expect(firstName("Training journal")).toBe("there");
    expect(firstName("Training")).toBe("there");
    expect(firstName("  TRAINING JOURNAL ")).toBe("there");
  });

  it("derives a short workout name for hero display", () => {
    expect(shortWorkoutName("Push")).toBe("Push");
    expect(shortWorkoutName("Day 1 - Push (Chest Focus)")).toBe("Push");
    expect(shortWorkoutName("Day 5 - Back Thickness (Back Priority)")).toBe("Back Thickness");
    expect(shortWorkoutName("Day 2 - Pull (Back Width Focus)")).toBe("Pull");
    expect(shortWorkoutName("Bench press (Chest)")).toBe("Bench press");
    expect(shortWorkoutName("  ")).toBe("");
    expect(shortWorkoutName("")).toBe("");
    expect(shortWorkoutName("A - B - Legs (Foundation)")).toBe("Legs");
  });

  it("derives protein and fat gram targets from body weight", () => {
    expect(getProteinTargets(70)).toEqual({ low: 126, high: 154 });
    expect(getFatTarget(70)).toBe(35);
    expect(getProteinTargets(72.5)).toEqual({ low: 130.5, high: 159.5 });
    expect(getFatTarget(72.5)).toBe(36.3);
    expect(getProteinTargets(null)).toBeNull();
    expect(getFatTarget(null)).toBeNull();
    expect(getProteinTargets(0)).toBeNull();
    expect(getFatTarget(0)).toBeNull();
    expect(getMacroTargets(70)).toEqual({ protein: { low: 126, high: 154 }, fat: 35 });
    expect(getMacroTargets(null)).toEqual({ protein: null, fat: null });
  });
});
