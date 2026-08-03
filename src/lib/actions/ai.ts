"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { exercises } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { AiError, parseWorkout } from "@/lib/ai";
import { rawTextSchema } from "@/lib/validation";

export async function parseWorkoutText(rawInput: string) {
  try {
    await requireSession();
    const library = await getDb().select({ name: exercises.name }).from(exercises).where(eq(exercises.archived, false));
    const data = await parseWorkout(rawTextSchema.parse(rawInput), library.map((item) => item.name));
    return { success: true as const, data };
  } catch (error) { return { success: false as const, error: error instanceof AiError || error instanceof Error ? error.message : "Workout parsing failed." }; }
}
