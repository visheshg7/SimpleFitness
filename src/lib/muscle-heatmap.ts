import { normalizeMuscle, type Muscle as AppMuscle } from "@/lib/muscles";
import type { Muscle as RendererMuscle } from "@/lib/musclemap";

export const APP_TO_RENDERER: Record<AppMuscle, RendererMuscle> = {
  Chest: "chest",
  Lats: "upper-back",
  "Mid-Back": "upper-back",
  Traps: "trapezius",
  "Lower Back": "lower-back",
  "Front Delts": "deltoids",
  "Side Delts": "deltoids",
  "Rear Delts": "deltoids",
  Biceps: "biceps",
  Triceps: "triceps",
  Forearms: "forearm",
  Abs: "abs",
  Obliques: "obliques",
  Quads: "quadriceps",
  Hamstrings: "hamstring",
  Glutes: "gluteal",
  Abductors: "gluteal",
  Adductors: "adductors",
  Calves: "calves",
};

export interface MuscleLegendRow {
  muscle: AppMuscle;
  count: number;
  intensity: number;
}

export interface MuscleRegionRow {
  region: RendererMuscle;
  count: number;
  intensity: number;
}

export interface MuscleHeatmap {
  legend: MuscleLegendRow[];
  regions: MuscleRegionRow[];
  totalSets: number;
}

export function buildMuscleHeatmap(counts: Record<string, number>): MuscleHeatmap {
  const canonical: Partial<Record<AppMuscle, number>> = {};
  for (const [key, count] of Object.entries(counts)) {
    const muscle = normalizeMuscle(key);
    if (!muscle) continue;
    canonical[muscle] = (canonical[muscle] ?? 0) + count;
  }

  const regionCounts = new Map<RendererMuscle, number>();
  for (const [muscle, count] of Object.entries(canonical) as Array<[AppMuscle, number]>) {
    const region = APP_TO_RENDERER[muscle];
    if (!region) continue;
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + count);
  }

  const maxRegionCount = Math.max(0, ...regionCounts.values());
  if (maxRegionCount === 0) {
    return { legend: [], regions: [], totalSets: 0 };
  }

  const regions = [...regionCounts.entries()]
    .map(([region, count]) => ({ region, count, intensity: count / maxRegionCount }))
    .sort((a, b) => b.count - a.count);

  const legend = (Object.entries(canonical) as Array<[AppMuscle, number]>)
    .map(([muscle, count]) => ({
      muscle,
      count,
      intensity: (regionCounts.get(APP_TO_RENDERER[muscle]) ?? 0) / maxRegionCount,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    legend,
    regions,
    totalSets: Object.values(canonical).reduce((total, count) => total + count, 0),
  };
}
