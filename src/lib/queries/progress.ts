import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bodyMetrics, exercises, mealLogs, sessions, setLogs } from "@/db/schema";
import { aggregateMacros, calculateStreak, dateKey, daysAgoKey, weekCompletion } from "@/lib/metrics";

export async function getProgressData(ownerId: string) {
  const db = getDb();
  const since = daysAgoKey(55);
  const [completed, workoutSets, meals, body] = await Promise.all([
    db.select({ sessionDate: sessions.sessionDate }).from(sessions).where(and(eq(sessions.ownerId, ownerId), isNotNull(sessions.completedAt), gte(sessions.sessionDate, since))).orderBy(desc(sessions.sessionDate)),
    db.select({ set: setLogs, exercise: exercises, session: sessions }).from(setLogs).innerJoin(exercises, eq(setLogs.exerciseId, exercises.id)).innerJoin(sessions, eq(setLogs.sessionId, sessions.id)).where(and(eq(sessions.ownerId, ownerId), isNotNull(sessions.completedAt), gte(sessions.sessionDate, since))),
    db.select().from(mealLogs).where(and(eq(mealLogs.ownerId, ownerId), gte(mealLogs.eatenAt, new Date(`${since}T00:00:00`)))).orderBy(mealLogs.eatenAt),
    db.select().from(bodyMetrics).where(and(eq(bodyMetrics.ownerId, ownerId), gte(bodyMetrics.metricDate, since))).orderBy(bodyMetrics.metricDate),
  ]);
  const allDates = (await db.select({ sessionDate: sessions.sessionDate }).from(sessions).where(and(eq(sessions.ownerId, ownerId), isNotNull(sessions.completedAt)))).map((row) => row.sessionDate);
  const volume = workoutSets.reduce((total, row) => total + (row.set.completed && row.set.weightKg && row.set.reps ? row.set.weightKg * row.set.reps : 0), 0);
  const currentWeekStart = new Date();
  const day = currentWeekStart.getDay();
  currentWeekStart.setDate(currentWeekStart.getDate() - (day === 0 ? 6 : day - 1));
  currentWeekStart.setHours(0, 0, 0, 0);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const currentWeekVolume = workoutSets.filter((row) => new Date(`${row.session.sessionDate}T12:00:00`) >= currentWeekStart).reduce((total, row) => total + (row.set.completed && row.set.weightKg && row.set.reps ? row.set.weightKg * row.set.reps : 0), 0);
  const previousWeekVolume = workoutSets.filter((row) => { const date = new Date(`${row.session.sessionDate}T12:00:00`); return date >= previousWeekStart && date < currentWeekStart; }).reduce((total, row) => total + (row.set.completed && row.set.weightKg && row.set.reps ? row.set.weightKg * row.set.reps : 0), 0);
  const muscleTotals = workoutSets.filter((row) => row.session.sessionDate >= daysAgoKey(6)).reduce<Record<string, number>>((totals, row) => { if (row.set.completed) totals[row.exercise.primaryMuscle] = (totals[row.exercise.primaryMuscle] ?? 0) + 1; return totals; }, {});
  const dailyMacros = Object.values(aggregateMacros(meals.map((meal) => ({ date: dateKey(new Date(meal.eatenAt)), calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat })))).sort((a, b) => a.date.localeCompare(b.date));
  const weeklyVolume = Array.from({ length: 8 }, (_, index) => {
    const end = new Date();
    end.setDate(end.getDate() - (7 - index) * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const byMuscle = workoutSets.filter((row) => { const date = new Date(`${row.session.sessionDate}T12:00:00`); return date >= start && date <= end && row.set.completed; }).reduce<Record<string, number>>((totals, row) => { totals[row.exercise.primaryMuscle] = (totals[row.exercise.primaryMuscle] ?? 0) + ((row.set.weightKg ?? 0) * (row.set.reps ?? 0)); return totals; }, {});
    return { week: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }), ...byMuscle };
  });
  return { streak: calculateStreak(allDates), week: weekCompletion(allDates), volume, currentWeekVolume, previousWeekVolume, muscleTotals, weeklyVolume, bodyMetrics: body, dailyMacros, hasData: completed.length > 0 || meals.length > 0 || body.length > 0 };
}
