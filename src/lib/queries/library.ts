import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bodyMetrics, exercises, templateExercises, users, workoutTemplates } from "@/db/schema";

export async function getLibraryData(ownerId: string) {
  const db = getDb();
  const [profile, templates, exerciseList, latestMetric] = await Promise.all([
    db.select().from(users).where(eq(users.id, ownerId)).limit(1),
    db.select().from(workoutTemplates).orderBy(asc(workoutTemplates.position)),
    db.select().from(exercises).orderBy(asc(exercises.archived), asc(exercises.name)),
    db.select({ weightKg: bodyMetrics.weightKg }).from(bodyMetrics).where(eq(bodyMetrics.ownerId, ownerId)).orderBy(desc(bodyMetrics.metricDate)).limit(1),
  ]);
  const assignments = await db.select({ assignment: templateExercises, exercise: exercises }).from(templateExercises).innerJoin(exercises, eq(templateExercises.exerciseId, exercises.id));
  return { profile: profile[0], latestWeightKg: latestMetric[0]?.weightKg ?? null, templates: templates.map((template) => ({ ...template, exercises: assignments.filter((row) => row.assignment.templateId === template.id).sort((a, b) => a.assignment.orderIndex - b.assignment.orderIndex) })), exercises: exerciseList };
}
