"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { exercises } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { AiError, askExerciseQuestion as askExerciseQuestionModel, generateExerciseGuidance as generateExerciseGuidanceModel, parseWorkout } from "@/lib/ai";
import { exerciseQuestionInputSchema, rawTextSchema } from "@/lib/validation";

export async function parseWorkoutText(rawInput: string) {
  try {
    await requireSession();
    const library = await getDb().select({ name: exercises.name }).from(exercises).where(eq(exercises.archived, false));
    const data = await parseWorkout(rawTextSchema.parse(rawInput), library.map((item) => item.name));
    return { success: true as const, data };
  } catch (error) { return { success: false as const, error: error instanceof AiError || error instanceof Error ? error.message : "Workout parsing failed." }; }
}

async function activeExercise(exerciseId: string) {
  const row = await getDb().select().from(exercises).where(and(eq(exercises.id, exerciseId), eq(exercises.archived, false))).limit(1);
  if (!row[0]) throw new Error("That exercise was not found in your library.");
  return row[0];
}

export async function generateExerciseGuidance(exerciseId: string) {
  try {
    await requireSession();
    const exercise = await activeExercise(exerciseId);
    const data = await generateExerciseGuidanceModel(exercise);
    return { success: true as const, data };
  } catch (error) { return { success: false as const, error: error instanceof AiError || error instanceof Error ? error.message : "Exercise guidance could not be generated." }; }
}

export async function askExerciseQuestion(input: unknown) {
  try {
    await requireSession();
    const parsed = exerciseQuestionInputSchema.parse(input);
    const exercise = await activeExercise(parsed.exerciseId);
    const data = await askExerciseQuestionModel(exercise, parsed.question);
    return { success: true as const, data };
  } catch (error) { return { success: false as const, error: error instanceof AiError || error instanceof Error ? error.message : "That question could not be answered right now." }; }
}
