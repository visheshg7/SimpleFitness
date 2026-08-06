import { describe, expect, it } from "vitest";
import { buildMuscleHeatmap } from "./muscle-heatmap";

describe("buildMuscleHeatmap", () => {
  it("maps canonical app muscles to exact renderer regions", () => {
    const result = buildMuscleHeatmap({ Chest: 4, Biceps: 3, Abs: 2 });
    expect(result.regions).toEqual([
      { region: "chest", count: 4, intensity: 1 },
      { region: "biceps", count: 3, intensity: 0.75 },
      { region: "abs", count: 2, intensity: 0.5 },
    ]);
  });

  it("routes fallback app groups to their closest renderer region", () => {
    const result = buildMuscleHeatmap({
      "Front Delts": 2,
      "Side Delts": 1,
      "Rear Delts": 3,
      Lats: 4,
      "Mid-Back": 2,
      Abductors: 1,
    });
    const regions = Object.fromEntries(result.regions.map(({ region, count }) => [region, count]));
    expect(regions.deltoids).toBe(6);
    expect(regions["upper-back"]).toBe(6);
    expect(regions.gluteal).toBe(1);
  });

  it("sums shared regions before normalizing intensity", () => {
    const result = buildMuscleHeatmap({ Lats: 3, "Mid-Back": 3 });
    expect(result.regions).toEqual([{ region: "upper-back", count: 6, intensity: 1 }]);
  });

  it("normalizes intensity relative to the highest region", () => {
    const result = buildMuscleHeatmap({ Chest: 10, Biceps: 5, Abs: 2 });
    const regions = Object.fromEntries(result.regions.map(({ region, count, intensity }) => [region, { count, intensity }]));
    expect(regions.chest).toEqual({ count: 10, intensity: 1 });
    expect(regions.biceps).toEqual({ count: 5, intensity: 0.5 });
    expect(regions.abs).toEqual({ count: 2, intensity: 0.2 });
  });

  it("sorts legend rows by set count descending", () => {
    const result = buildMuscleHeatmap({ Abs: 1, Chest: 9, Biceps: 5 });
    expect(result.legend.map(({ muscle }) => muscle)).toEqual(["Chest", "Biceps", "Abs"]);
    expect(result.totalSets).toBe(15);
  });

  it("normalizes keys and omits unknown muscles", () => {
    const result = buildMuscleHeatmap({ "Totally Fake": 5, Chest: 2, "  rear delts  ": 1 });
    expect(result.legend.map(({ muscle }) => muscle)).toEqual(["Chest", "Rear Delts"]);
    expect(result.totalSets).toBe(3);
  });

  it("returns empty data for empty input and a zero maximum", () => {
    expect(buildMuscleHeatmap({})).toEqual({ legend: [], regions: [], totalSets: 0 });
    expect(buildMuscleHeatmap({ "Unknown Muscle": 3 })).toEqual({ legend: [], regions: [], totalSets: 0 });
  });

  it("keeps canonical legend rows separate while sharing region intensity", () => {
    const result = buildMuscleHeatmap({ Lats: 2, "Mid-Back": 2, "Front Delts": 1 });
    expect(result.legend.map(({ muscle, intensity }) => ({ muscle, intensity }))).toEqual([
      { muscle: "Lats", intensity: 1 },
      { muscle: "Mid-Back", intensity: 1 },
      { muscle: "Front Delts", intensity: 0.25 },
    ]);
  });
});
