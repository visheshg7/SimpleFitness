import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { exercises, templateExercises, users, workoutTemplates } from "@/db/schema";

export async function getLibraryData(ownerId: string) {
  const db = getDb();
  const [profile, templates, exerciseList] = await Promise.all([
    db.select().from(users).where(eq(users.id, ownerId)).limit(1),
    db.select().from(workoutTemplates).orderBy(asc(workoutTemplates.position)),
    db.select().from(exercises).orderBy(asc(exercises.archived), asc(exercises.name)),
  ]);
  const assignments = await db.select({ assignment: templateExercises, exercise: exercises }).from(templateExercises).innerJoin(exercises, eq(templateExercises.exerciseId, exercises.id));
  return { profile: profile[0], templates: templates.map((template) => ({ ...template, exercises: assignments.filter((row) => row.assignment.templateId === template.id).sort((a, b) => a.assignment.orderIndex - b.assignment.orderIndex) })), exercises: exerciseList };
}
