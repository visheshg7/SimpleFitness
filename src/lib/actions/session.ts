"use server";

import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { exercises, sessionExercises, sessions, setLogs, templateExercises } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { isDateInLoggingWindow, kgFromUnit } from "@/lib/metrics";
import { parserSetSchema, setInputSchema, unitSchema } from "@/lib/validation";

const failure = (error: unknown) => ({ success: false as const, error: error instanceof Error && error.message !== "UNAUTHENTICATED" ? error.message : "That change could not be saved." });

async function seedSessionPlan(sessionId: string, templateId: string) {
  const db = getDb();
  const existingPlan = await db.select({ id: sessionExercises.id }).from(sessionExercises).where(eq(sessionExercises.sessionId, sessionId)).limit(1);
  if (!existingPlan[0]) {
    const templateRows = await db.select({ row: templateExercises, exercise: exercises }).from(templateExercises).innerJoin(exercises, eq(templateExercises.exerciseId, exercises.id)).where(and(eq(templateExercises.templateId, templateId), eq(exercises.archived, false))).orderBy(asc(templateExercises.orderIndex));
    if (templateRows.length) {
      await db.insert(sessionExercises).values(templateRows.map(({ row, exercise }) => ({
        sessionId,
        exerciseId: exercise.id,
        orderIndex: row.orderIndex,
        targetSets: row.targetSets,
        targetReps: row.targetReps,
      }))).onConflictDoNothing();
    }
  }

  const plan = await db.select().from(sessionExercises).where(eq(sessionExercises.sessionId, sessionId)).orderBy(asc(sessionExercises.orderIndex));
  for (const exercise of plan) {
    const initialSets = Array.from({ length: exercise.targetSets ?? 1 }, (_, index) => ({
      sessionId,
      exerciseId: exercise.exerciseId,
      setNumber: index + 1,
      completed: false,
    }));
    if (initialSets.length) await db.insert(setLogs).values(initialSets).onConflictDoNothing();
  }
}

export async function chooseTemplate(input: { templateId: string; sessionDate: string }) {
  try {
    const ownerId = await requireSession();
    if (!isDateInLoggingWindow(input.sessionDate)) throw new Error("Choose a date within the available logging window.");
    const db = getDb();
    const existing = await db.select().from(sessions).where(and(eq(sessions.ownerId, ownerId), eq(sessions.sessionDate, input.sessionDate))).limit(1);
    if (existing[0]) {
      if (existing[0].startedAt || existing[0].completedAt) throw new Error("A started workout keeps its plan. Finish it or edit the logged sets instead.");
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
    if (!isDateInLoggingWindow(input.sessionDate)) throw new Error("Choose a date within the available logging window.");
    const db = getDb();
    const existing = await db.select().from(sessions).where(and(eq(sessions.ownerId, ownerId), eq(sessions.sessionDate, input.sessionDate))).limit(1);
    let sessionId: string;
    if (existing[0]) {
      if (existing[0].completedAt) throw new Error("This workout is already complete.");
      if (existing[0].startedAt && existing[0].templateId !== input.templateId) throw new Error("This workout has already started with a different template.");
      await db.update(sessions).set({ templateId: input.templateId, startedAt: existing[0].startedAt ?? new Date(), updatedAt: new Date() }).where(eq(sessions.id, existing[0].id));
      sessionId = existing[0].id;
    } else {
      const session = (await db.insert(sessions).values({ ownerId, sessionDate: input.sessionDate, templateId: input.templateId, startedAt: new Date() }).returning())[0];
      if (!session) throw new Error("The workout could not be started.");
      sessionId = session.id;
    }
    await seedSessionPlan(sessionId, input.templateId);
    revalidatePath("/today");
    return { success: true as const, sessionId };
  } catch (error) { return failure(error); }
}

const sessionExerciseSchema = z.object({
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
});

const newExerciseQuickLogSchema = z.object({
  sessionId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  primaryMuscle: z.string().trim().min(1).max(60),
  sets: z.array(parserSetSchema.extend({ unit: unitSchema.optional() })).min(1).max(30),
  defaultUnit: unitSchema,
});

const batchSetSchema = z.object({
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1).max(30),
  weight: z.number().finite().min(0).max(2000).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
  unit: unitSchema,
  completed: z.boolean(),
});

async function ownedSession(sessionId: string, ownerId: string) {
  const session = await getDb().select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.ownerId, ownerId))).limit(1);
  if (!session[0]) throw new Error("Session not found.");
  return session[0];
}

export async function addExerciseToSession(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = sessionExerciseSchema.parse(input);
    const db = getDb();
    const session = await ownedSession(parsed.sessionId, ownerId);
    if (session.templateId) await seedSessionPlan(parsed.sessionId, session.templateId);
    const exercise = await db.select({ id: exercises.id }).from(exercises).where(and(eq(exercises.id, parsed.exerciseId), eq(exercises.archived, false))).limit(1);
    if (!exercise[0]) throw new Error("Choose an active exercise from your library.");
    const existing = await db.select({ id: sessionExercises.id }).from(sessionExercises).where(and(eq(sessionExercises.sessionId, parsed.sessionId), eq(sessionExercises.exerciseId, parsed.exerciseId))).limit(1);
    if (!existing[0]) {
      const last = await db.select({ orderIndex: sessionExercises.orderIndex }).from(sessionExercises).where(eq(sessionExercises.sessionId, parsed.sessionId)).orderBy(sql`${sessionExercises.orderIndex} desc`).limit(1);
      await db.insert(sessionExercises).values({ sessionId: parsed.sessionId, exerciseId: parsed.exerciseId, orderIndex: (last[0]?.orderIndex ?? -1) + 1, targetSets: 3, targetReps: 8 });
      await db.insert(setLogs).values(Array.from({ length: 3 }, (_, index) => ({ sessionId: parsed.sessionId, exerciseId: parsed.exerciseId, setNumber: index + 1, completed: false }))).onConflictDoNothing();
    }
    revalidatePath("/today");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function removeExerciseFromSession(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = sessionExerciseSchema.parse(input);
    const db = getDb();
    const session = await ownedSession(parsed.sessionId, ownerId);
    if (session.completedAt) throw new Error("Completed workouts keep their original exercise plan.");
    const planned = await db.select({ id: sessionExercises.id }).from(sessionExercises).where(and(eq(sessionExercises.sessionId, parsed.sessionId), eq(sessionExercises.exerciseId, parsed.exerciseId))).limit(1);
    if (!planned[0]) throw new Error("That exercise is not part of this workout.");
    await db.delete(setLogs).where(and(eq(setLogs.sessionId, parsed.sessionId), eq(setLogs.exerciseId, parsed.exerciseId)));
    await db.delete(sessionExercises).where(eq(sessionExercises.id, planned[0].id));
    revalidatePath("/today");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function resetExerciseSets(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = sessionExerciseSchema.parse(input);
    const db = getDb();
    const session = await ownedSession(parsed.sessionId, ownerId);
    if (!session.startedAt) throw new Error("Start the workout before resetting sets.");
    const planned = await db.select({ id: sessionExercises.id }).from(sessionExercises).where(and(eq(sessionExercises.sessionId, parsed.sessionId), eq(sessionExercises.exerciseId, parsed.exerciseId))).limit(1);
    if (!planned[0]) throw new Error("That exercise is not part of this workout.");
    await db.update(setLogs).set({ weightKg: null, reps: null, completed: false, updatedAt: new Date() }).where(and(eq(setLogs.sessionId, parsed.sessionId), eq(setLogs.exerciseId, parsed.exerciseId)));
    revalidatePath("/today");
    revalidatePath("/progress");
    revalidatePath("/history");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function replaceSessionExercise(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = z.object({
      sessionExerciseId: z.string().uuid().optional(),
      sessionId: z.string().uuid().optional(),
      oldExerciseId: z.string().uuid().optional(),
      exerciseId: z.string().uuid(),
    }).refine((value) => Boolean(value.sessionExerciseId || (value.sessionId && value.oldExerciseId)), {
      message: "Workout exercise details are required.",
    }).parse(input);
    const db = getDb();
    let plan = parsed.sessionExerciseId
      ? await db.select({ item: sessionExercises, session: sessions }).from(sessionExercises).innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id)).where(and(eq(sessionExercises.id, parsed.sessionExerciseId), eq(sessions.ownerId, ownerId))).limit(1)
      : [];
    if (!plan[0] && parsed.sessionId && parsed.oldExerciseId) {
      const session = await ownedSession(parsed.sessionId, ownerId);
      if (!session.templateId) throw new Error("This workout does not have a template to adjust.");
      await seedSessionPlan(session.id, session.templateId);
      plan = await db.select({ item: sessionExercises, session: sessions }).from(sessionExercises).innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id)).where(and(eq(sessionExercises.sessionId, session.id), eq(sessionExercises.exerciseId, parsed.oldExerciseId))).limit(1);
    }
    if (!plan[0]) throw new Error("That workout exercise was not found.");
    if (plan[0].session.completedAt) throw new Error("Completed workouts keep their original exercise plan.");
    if (plan[0].item.exerciseId === parsed.exerciseId) return { success: true as const };
    const replacement = await db.select({ id: exercises.id }).from(exercises).where(and(eq(exercises.id, parsed.exerciseId), eq(exercises.archived, false))).limit(1);
    if (!replacement[0]) throw new Error("Choose an active exercise from your library.");
    const alreadyPlanned = await db.select({ id: sessionExercises.id }).from(sessionExercises).where(and(eq(sessionExercises.sessionId, plan[0].item.sessionId), eq(sessionExercises.exerciseId, parsed.exerciseId))).limit(1);
    if (alreadyPlanned[0]) throw new Error("That exercise is already in this workout.");
    const logged = await db.select({ id: setLogs.id }).from(setLogs).where(and(eq(setLogs.sessionId, plan[0].item.sessionId), eq(setLogs.exerciseId, plan[0].item.exerciseId), or(eq(setLogs.completed, true), isNotNull(setLogs.weightKg), isNotNull(setLogs.reps)))).limit(1);
    if (logged[0]) throw new Error("This exercise already has logged work. Add the alternative below it so your record stays accurate.");
    await db.delete(setLogs).where(and(eq(setLogs.sessionId, plan[0].item.sessionId), eq(setLogs.exerciseId, plan[0].item.exerciseId)));
    await db.update(sessionExercises).set({ exerciseId: parsed.exerciseId }).where(eq(sessionExercises.id, plan[0].item.id));
    const initialSets = Array.from({ length: plan[0].item.targetSets ?? 1 }, (_, index) => ({ sessionId: plan[0].item.sessionId, exerciseId: parsed.exerciseId, setNumber: index + 1, completed: false }));
    if (initialSets.length) await db.insert(setLogs).values(initialSets).onConflictDoNothing();
    revalidatePath("/today");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

const quickLogSchema = z.object({
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  sets: z.array(parserSetSchema.extend({ unit: unitSchema.optional() })).min(1).max(30),
  defaultUnit: unitSchema,
});

export async function logQuickSets(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = quickLogSchema.parse(input);
    const db = getDb();
    const session = await ownedSession(parsed.sessionId, ownerId);
    if (session.completedAt) throw new Error("Completed workouts cannot add new exercises.");
    if (!session.startedAt) throw new Error("Start the workout before adding sets.");
    const added = await addExerciseToSession({ sessionId: parsed.sessionId, exerciseId: parsed.exerciseId });
    if (!added.success) throw new Error(added.error);
    const existing = await db.select().from(setLogs).where(and(eq(setLogs.sessionId, parsed.sessionId), eq(setLogs.exerciseId, parsed.exerciseId))).orderBy(asc(setLogs.setNumber));
    const openSets = existing.filter((set) => !set.completed && set.weightKg === null && set.reps === null);
    let nextSetNumber = Math.max(0, ...existing.map((set) => set.setNumber)) + 1;
    for (const parsedSet of parsed.sets) {
      const target = openSets.shift();
      const setNumber = target?.setNumber ?? nextSetNumber++;
      await db.insert(setLogs).values({
        sessionId: parsed.sessionId,
        exerciseId: parsed.exerciseId,
        setNumber,
        weightKg: kgFromUnit(parsedSet.weight, parsedSet.unit ?? parsed.defaultUnit),
        reps: parsedSet.reps,
        completed: true,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [setLogs.sessionId, setLogs.exerciseId, setLogs.setNumber],
        set: { weightKg: kgFromUnit(parsedSet.weight, parsedSet.unit ?? parsed.defaultUnit), reps: parsedSet.reps, completed: true, updatedAt: new Date() },
      });
    }
    revalidatePath("/today");
    revalidatePath("/progress");
    revalidatePath("/history");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function createExerciseAndLogQuickSets(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = newExerciseQuickLogSchema.parse(input);
    const db = getDb();
    const session = await ownedSession(parsed.sessionId, ownerId);
    if (!session.startedAt) throw new Error("Start the workout before adding sets.");

    const existing = await db.select({ id: exercises.id, archived: exercises.archived }).from(exercises).where(eq(exercises.name, parsed.name)).limit(1);
    if (existing[0]?.archived) throw new Error("An archived exercise already uses that name. Restore it in Library or choose another name.");
    const inserted = existing[0] ? [] : await db.insert(exercises).values({ name: parsed.name, primaryMuscle: parsed.primaryMuscle, defaultUnit: parsed.defaultUnit, secondaryMuscles: [] }).onConflictDoNothing({ target: exercises.name }).returning({ id: exercises.id });
    const exerciseId = existing[0]?.id ?? inserted[0]?.id ?? (await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.name, parsed.name)).limit(1))[0]?.id;
    if (!exerciseId) throw new Error("The new exercise could not be created.");

    const logged = await logQuickSets({ sessionId: parsed.sessionId, exerciseId, defaultUnit: parsed.defaultUnit, sets: parsed.sets });
    if (!logged.success) throw new Error(logged.error ?? "The new exercise sets could not be saved.");
    revalidatePath("/library");
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
    const reps = parsed.reps === 0 ? null : parsed.reps ?? null;
    await db.insert(setLogs).values({ sessionId: parsed.sessionId, exerciseId: parsed.exerciseId, setNumber: parsed.setNumber, weightKg: kgFromUnit(parsed.weight, parsed.unit), reps, completed: parsed.completed && reps !== null, updatedAt: new Date() }).onConflictDoUpdate({ target: [setLogs.sessionId, setLogs.exerciseId, setLogs.setNumber], set: { weightKg: kgFromUnit(parsed.weight, parsed.unit), reps, completed: parsed.completed && reps !== null, updatedAt: new Date() } });
    revalidatePath("/today");
    revalidatePath("/progress");
    revalidatePath("/history");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function saveSets(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = z.object({ sessionId: z.string().uuid(), sets: z.array(batchSetSchema).max(500) }).parse(input);
    const db = getDb();
    const session = await ownedSession(parsed.sessionId, ownerId);
    if (!session.startedAt) throw new Error("Start the workout before saving sets.");
    if (!parsed.sets.length) return { success: true as const };
    const exerciseIds = Array.from(new Set(parsed.sets.map((set) => set.exerciseId)));
    const ownedExercises = await db.select({ id: exercises.id }).from(exercises).where(inArray(exercises.id, exerciseIds));
    if (ownedExercises.length !== exerciseIds.length) throw new Error("One or more exercises could not be found.");
    await db.insert(setLogs).values(parsed.sets.map((set) => {
      const reps = set.reps === 0 ? null : set.reps;
      return { sessionId: parsed.sessionId, exerciseId: set.exerciseId, setNumber: set.setNumber, weightKg: kgFromUnit(set.weight, set.unit), reps, completed: set.completed && reps !== null, updatedAt: new Date() };
    })).onConflictDoUpdate({
      target: [setLogs.sessionId, setLogs.exerciseId, setLogs.setNumber],
      set: { weightKg: sql`excluded.weight_kg`, reps: sql`excluded.reps`, completed: sql`excluded.completed`, updatedAt: new Date() },
    });
    revalidatePath("/today");
    revalidatePath("/progress");
    revalidatePath("/history");
    return { success: true as const };
  } catch (error) { return failure(error); }
}

export async function deleteSet(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = z.object({
      sessionId: z.string().uuid(),
      exerciseId: z.string().uuid(),
      setNumber: z.number().int().min(1).max(30),
    }).parse(input);
    const db = getDb();
    const session = await ownedSession(parsed.sessionId, ownerId);
    if (session.completedAt === null && !session.startedAt) throw new Error("Start the workout before deleting sets.");
    await db.delete(setLogs).where(and(eq(setLogs.sessionId, parsed.sessionId), eq(setLogs.exerciseId, parsed.exerciseId), eq(setLogs.setNumber, parsed.setNumber)));
    const followingSets = await db.select({ setNumber: setLogs.setNumber }).from(setLogs).where(and(eq(setLogs.sessionId, parsed.sessionId), eq(setLogs.exerciseId, parsed.exerciseId), sql`${setLogs.setNumber} > ${parsed.setNumber}`)).orderBy(asc(setLogs.setNumber));
    for (const set of followingSets) {
      await db.update(setLogs).set({ setNumber: set.setNumber - 1, updatedAt: new Date() }).where(and(eq(setLogs.sessionId, parsed.sessionId), eq(setLogs.exerciseId, parsed.exerciseId), eq(setLogs.setNumber, set.setNumber)));
    }
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
