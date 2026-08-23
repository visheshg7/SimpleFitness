"use server";

import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { exercises, trackedExercises } from "@/db/schema";
import { requireSession } from "@/lib/auth";

const trackedSchema = z.object({
  exerciseIds: z.array(z.string().uuid()).min(3).max(6),
});

export async function saveTrackedExercises(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = trackedSchema.parse(input);
    const exerciseIds = [...new Set(parsed.exerciseIds)];
    if (exerciseIds.length < 3) throw new Error("Choose at least 3 exercises to track.");
    const db = getDb();
    const existing = await db.select({ id: exercises.id }).from(exercises).where(inArray(exercises.id, exerciseIds));
    if (existing.length !== exerciseIds.length) throw new Error("One or more exercises could not be found.");
    await db.transaction(async (tx) => {
      await tx.delete(trackedExercises).where(eq(trackedExercises.ownerId, ownerId));
      await tx.insert(trackedExercises).values(exerciseIds.map((exerciseId, position) => ({ ownerId, exerciseId, position })));
    });
    revalidatePath("/progress");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: error instanceof Error && error.message !== "UNAUTHENTICATED" ? error.message : "Tracked exercises could not be saved." };
  }
}
