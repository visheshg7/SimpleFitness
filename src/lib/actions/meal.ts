"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { mealLogs } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { AiError, parseMeal } from "@/lib/ai";
import { isDateInLoggingWindow } from "@/lib/metrics";
import { mealConfirmSchema, rawTextSchema } from "@/lib/validation";

export async function parseMealText(rawInput: string) {
  try {
    await requireSession();
    const parsed = await parseMeal(rawTextSchema.parse(rawInput));
    return { success: true as const, data: parsed };
  } catch (error) { return { success: false as const, error: error instanceof AiError || error instanceof Error ? error.message : "Meal parsing failed." }; }
}

export async function confirmMeal(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = mealConfirmSchema.parse(input);
    if (!isDateInLoggingWindow(parsed.mealDate)) throw new Error("Choose a date within the available logging window.");
    const db = getDb();
    await db.insert(mealLogs).values({ ownerId, eatenAt: new Date(`${parsed.mealDate}T12:00:00`), rawInput: parsed.rawInput, parsedItems: parsed.items, calories: parsed.calories, protein: parsed.protein, carbs: parsed.carbs, fat: parsed.fat });
    revalidatePath("/today"); revalidatePath("/progress"); revalidatePath("/history");
    return { success: true as const };
  } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : "Meal could not be saved." }; }
}

export async function deleteMeal(id: string) {
  try { const ownerId = await requireSession(); await getDb().delete(mealLogs).where(and(eq(mealLogs.id, id), eq(mealLogs.ownerId, ownerId))); revalidatePath("/history"); revalidatePath("/progress"); return { success: true as const }; } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : "Meal could not be deleted." }; }
}
