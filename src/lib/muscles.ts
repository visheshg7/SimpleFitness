export const MUSCLES = [
  "Chest",
  "Lats",
  "Traps",
  "Mid-Back",
  "Lower Back",
  "Front Delts",
  "Side Delts",
  "Rear Delts",
  "Biceps",
  "Triceps",
  "Forearms",
  "Abs",
  "Obliques",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Adductors",
  "Abductors",
  "Calves",
] as const;

export type Muscle = (typeof MUSCLES)[number];

const ALIASES: Record<string, Muscle> = {
  back: "Lats",
  "upper back": "Traps",
  shoulder: "Front Delts",
  shoulders: "Front Delts",
};

export function normalizeMuscle(value: string): Muscle | null {
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  const canonical = MUSCLES.find((muscle) => muscle.toLowerCase() === key);
  return canonical ?? ALIASES[key] ?? null;
}
