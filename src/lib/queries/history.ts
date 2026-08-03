import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bodyMetrics, exercises, mealLogs, sessions, setLogs, workoutTemplates } from "@/db/schema";

export type HistoryFilter = "all" | "workout" | "meal" | "body";

export async function getHistoryData(ownerId: string, filter: HistoryFilter = "all") {
  const db = getDb();
  const [workouts, meals, body] = await Promise.all([
    filter === "all" || filter === "workout" ? db.select({ session: sessions, template: workoutTemplates }).from(sessions).leftJoin(workoutTemplates, eq(sessions.templateId, workoutTemplates.id)).where(and(eq(sessions.ownerId, ownerId), isNotNull(sessions.completedAt))).orderBy(desc(sessions.sessionDate)).limit(100) : Promise.resolve([]),
    filter === "all" || filter === "meal" ? db.select().from(mealLogs).where(eq(mealLogs.ownerId, ownerId)).orderBy(desc(mealLogs.eatenAt)).limit(100) : Promise.resolve([]),
    filter === "all" || filter === "body" ? db.select().from(bodyMetrics).where(eq(bodyMetrics.ownerId, ownerId)).orderBy(desc(bodyMetrics.metricDate)).limit(100) : Promise.resolve([]),
  ]);
  const workoutIds = workouts.map((row) => row.session.id);
  const workoutSets = workoutIds.length ? await db.select({ set: setLogs, exercise: exercises }).from(setLogs).innerJoin(exercises, eq(setLogs.exerciseId, exercises.id)).where(inArray(setLogs.sessionId, workoutIds)).orderBy(setLogs.setNumber) : [];
  return [
    ...workouts.map(({ session, template }) => ({ id: session.id, type: "workout" as const, date: session.sessionDate, title: template?.name ?? "Workout", subtitle: `${workoutSets.filter((row) => row.set.sessionId === session.id).length} sets`, value: "", details: workoutSets.filter((row) => row.set.sessionId === session.id).map((row) => ({ exercise: row.exercise.name, weightKg: row.set.weightKg, reps: row.set.reps, completed: row.set.completed })) })),
    ...meals.map((meal) => ({ id: meal.id, type: "meal" as const, date: meal.eatenAt.toISOString(), title: meal.rawInput, subtitle: `${Math.round(meal.calories ?? 0)} kcal · ${Math.round(meal.protein ?? 0)}g protein`, value: `${Math.round(meal.calories ?? 0)} kcal` })),
    ...body.map((metric) => ({ id: metric.id, type: "body" as const, date: metric.metricDate, title: "Body check-in", subtitle: `${metric.weightKg.toFixed(1)} kg${metric.bodyFatPercent ? ` · ${metric.bodyFatPercent}% body fat` : ""}`, value: metric.bmi ? `BMI ${metric.bmi.toFixed(1)}` : "" })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function getWorkoutDetail(ownerId: string, sessionId: string) {
  const db = getDb();
  const [session] = await db.select({ session: sessions, template: workoutTemplates }).from(sessions).leftJoin(workoutTemplates, eq(sessions.templateId, workoutTemplates.id)).where(and(eq(sessions.id, sessionId), eq(sessions.ownerId, ownerId))).limit(1);
  if (!session) return null;
  const sets = await db.select({ set: setLogs, exercise: exercises }).from(setLogs).innerJoin(exercises, eq(setLogs.exerciseId, exercises.id)).where(eq(setLogs.sessionId, sessionId)).orderBy(setLogs.exerciseId, setLogs.setNumber);
  return { ...session, sets };
}
