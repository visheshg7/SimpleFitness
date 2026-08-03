"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { exercises, sessions, setLogs, templateExercises } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { kgFromUnit } from "@/lib/metrics";
import { setInputSchema } from "@/lib/validation";

const failure = (error: unknown) => ({ success: false as const, error: error instanceof Error && error.message !== "UNAUTHENTICATED" ? error.message : "That change could not be saved." });

export async function chooseTemplate(input: { templateId: string; sessionDate: string }) {
  try {
    const ownerId = await requireSession();
    const db = getDb();
    const existing = await db.select().from(sessions).where(and(eq(sessions.ownerId, ownerId), eq(sessions.sessionDate, input.sessionDate))).limit(1);
    if (existing[0]) {
      await db.update(sessions).set({ templateId: input.templateId, updatedAt: new Date() }).where(eq(sessions.id, existing[0].id));
    } else {
      await db.insert(sessions).values({ ownerId, sessionDate: input.sessionDate, templateId: input.templateId, startedAt: null });
    }
    revalidatePath("/today");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function startSession(input: { templateId: string; sessionDate: string }) {
  try {
    const ownerId = await requireSession();
    const db = getDb();
    const existing = await db.select().from(sessions).where(and(eq(sessions.ownerId, ownerId), eq(sessions.sessionDate, input.sessionDate))).limit(1);
    if (existing[0]) {
      await db.update(sessions).set({ templateId: input.templateId, startedAt: existing[0].startedAt ?? new Date(), updatedAt: new Date() }).where(eq(sessions.id, existing[0].id));
      const existingSets = await db.select({ id: setLogs.id }).from(setLogs).where(eq(setLogs.sessionId, existing[0].id)).limit(1);
      if (!existingSets[0]) {
        const templateRows = await db.select().from(templateExercises).where(eq(templateExercises.templateId, input.templateId)).orderBy(asc(templateExercises.orderIndex));
        const library = await db.select().from(exercises);
        const initialSets = templateRows.flatMap((row) => { const exercise = library.find((item) => item.id === row.exerciseId); return exercise ? Array.from({ length: row.targetSets ?? 1 }, (_, index) => ({ sessionId: existing[0].id, exerciseId: exercise.id, setNumber: index + 1, completed: false })) : []; });
        if (initialSets.length) await db.insert(setLogs).values(initialSets).onConflictDoNothing();
      }
    } else {
      const templateRows = await db.select().from(templateExercises).where(eq(templateExercises.templateId, input.templateId)).orderBy(asc(templateExercises.orderIndex));
      const session = (await db.insert(sessions).values({ ownerId, sessionDate: input.sessionDate, templateId: input.templateId, startedAt: new Date() }).returning())[0];
      if (session) {
        const library = await db.select().from(exercises);
        const initialSets = templateRows.flatMap((row) => { const exercise = library.find((item) => item.id === row.exerciseId); return exercise ? Array.from({ length: row.targetSets ?? 1 }, (_, index) => ({ sessionId: session.id, exerciseId: exercise.id, setNumber: index + 1, completed: false })) : []; });
        if (initialSets.length) await db.insert(setLogs).values(initialSets).onConflictDoNothing();
      }
    }
    revalidatePath("/today");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function saveSet(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = setInputSchema.parse(input);
    const db = getDb();
    const ownedSession = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, parsed.sessionId), eq(sessions.ownerId, ownerId))).limit(1);
    if (!ownedSession[0]) throw new Error("Session not found.");
    const exercise = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, parsed.exerciseId)).limit(1);
    if (!exercise[0]) throw new Error("Exercise not found.");
    await db.insert(setLogs).values({ sessionId: parsed.sessionId, exerciseId: parsed.exerciseId, setNumber: parsed.setNumber, weightKg: kgFromUnit(parsed.weight, parsed.unit), reps: parsed.reps ?? null, completed: parsed.completed, updatedAt: new Date() }).onConflictDoUpdate({ target: [setLogs.sessionId, setLogs.exerciseId, setLogs.setNumber], set: { weightKg: kgFromUnit(parsed.weight, parsed.unit), reps: parsed.reps ?? null, completed: parsed.completed, updatedAt: new Date() } });
    revalidatePath("/today");
    revalidatePath("/progress");
    revalidatePath("/history");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function finishSession(sessionId: string) {
  try {
    const ownerId = await requireSession();
    const db = getDb();
    await db.update(sessions).set({ completedAt: new Date(), startedAt: new Date(), updatedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.ownerId, ownerId)));
    revalidatePath("/today");
    revalidatePath("/progress");
    revalidatePath("/history");
    return { success: true as const };
  } catch (error) { return failure(error); }
}
