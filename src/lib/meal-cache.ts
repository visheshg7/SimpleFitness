import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mealLogs } from "@/db/schema";
import { normalizeMealText, type ReusableMeal } from "./meal-text";

export { normalizeMealText, matchReusableMeals, type ReusableMeal } from "./meal-text";

export async function getReusableMeals(ownerId: string) {
  const recent = await getDb()
    .select()
    .from(mealLogs)
    .where(eq(mealLogs.ownerId, ownerId))
    .orderBy(desc(mealLogs.eatenAt))
    .limit(100);

  const grouped = new Map<string, ReusableMeal>();
  for (const meal of recent) {
    const key = normalizeMealText(meal.rawInput);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        rawInput: meal.rawInput,
        parsedItems: meal.parsedItems,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        count: 1,
      });
    } else {
      existing.count += 1;
    }
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}
