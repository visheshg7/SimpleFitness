export type ReusableMeal = {
  rawInput: string;
  parsedItems: Array<{ name: string; quantity?: string; calories?: number; protein?: number; carbs?: number; fat?: number }>;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  count: number;
};

export function normalizeMealText(input: string) {
  return input.toLowerCase().replace(/[.,;:!?]/g, " ").replace(/\s+/g, " ").trim();
}

export function matchReusableMeals(meals: ReusableMeal[], query: string) {
  const normalized = normalizeMealText(query);
  if (!normalized) return [];
  return meals
    .filter((meal) => normalizeMealText(meal.rawInput).includes(normalized))
    .sort((a, b) => b.count - a.count);
}
