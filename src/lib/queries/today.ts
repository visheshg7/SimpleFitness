import { and, asc, desc, eq, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { exercises, setLogs, sessions, templateExercises, users, workoutTemplates } from "@/db/schema";
import { calculateStreak, dateKey, nextTemplatePosition, weekCompletion } from "@/lib/metrics";

export async function getTodayData(ownerId: string, today = dateKey(new Date())) {
  const db = getDb();
  const [owner, templates, todaySession, completedSessions, library] = await Promise.all([
    db.select().from(users).where(eq(users.id, ownerId)).limit(1),
    db.select().from(workoutTemplates).orderBy(asc(workoutTemplates.position)),
    db.select().from(sessions).where(and(eq(sessions.ownerId, ownerId), eq(sessions.sessionDate, today))).limit(1),
    db.select({ sessionDate: sessions.sessionDate, templateId: sessions.templateId }).from(sessions).where(and(eq(sessions.ownerId, ownerId), isNotNull(sessions.completedAt))).orderBy(desc(sessions.sessionDate)).limit(120),
    db.select().from(exercises).where(eq(exercises.archived, false)).orderBy(asc(exercises.name)),
  ]);
  const profile = owner[0];
  if (!profile) throw new Error("Owner record was not found. Run the seed command first.");

  const lastTemplatePosition = templates.find((template) => template.id === completedSessions[0]?.templateId)?.position ?? null;
  const suggestedPosition = nextTemplatePosition(templates.map((template) => template.position), lastTemplatePosition);
  const activeSession = todaySession[0] ?? null;
  const selectedTemplateId = activeSession?.templateId ?? templates.find((template) => template.position === suggestedPosition)?.id ?? templates[0]?.id ?? null;

  const templateRows = selectedTemplateId
    ? await db.select({ templateExercise: templateExercises, exercise: exercises }).from(templateExercises).innerJoin(exercises, eq(templateExercises.exerciseId, exercises.id)).where(eq(templateExercises.templateId, selectedTemplateId)).orderBy(asc(templateExercises.orderIndex))
    : [];

  const currentSets = activeSession
    ? await db.select().from(setLogs).where(eq(setLogs.sessionId, activeSession.id)).orderBy(asc(setLogs.exerciseId), asc(setLogs.setNumber))
    : [];
  const previousSets = await db.select({ set: setLogs, session: sessions }).from(setLogs).innerJoin(sessions, eq(setLogs.sessionId, sessions.id)).where(and(eq(sessions.ownerId, ownerId), lt(sessions.sessionDate, today), isNotNull(sessions.completedAt))).orderBy(desc(sessions.sessionDate), asc(setLogs.setNumber));

  const exercisesForToday = templateRows.map(({ templateExercise, exercise }) => {
    const sets = currentSets.filter((set) => set.exerciseId === exercise.id);
    const previous = previousSets.filter(({ set }) => set.exerciseId === exercise.id);
    const previousSessionId = previous[0]?.session.id;
    return {
      id: exercise.id,
      name: exercise.name,
      primaryMuscle: exercise.primaryMuscle,
      targetSets: templateExercise.targetSets,
      targetReps: templateExercise.targetReps,
      sets,
      lastSession: previousSessionId ? previous.filter(({ session }) => session.id === previousSessionId).map(({ set }) => set) : [],
    };
  });

  const dates = completedSessions.map((session) => session.sessionDate);
  return {
    profile,
    templates,
    today,
    session: activeSession,
    selectedTemplateId,
    exercises: exercisesForToday,
    library,
    streak: calculateStreak(dates),
    week: weekCompletion(dates),
  };
}
