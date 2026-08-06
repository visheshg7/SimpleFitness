import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bodyMetrics, exercises, mealLogs, sessions, setLogs, users } from "@/db/schema";
import { aggregateMacros, calculateStreak, dateKey, daysAgoKey, weekCompletion } from "@/lib/metrics";
import { normalizeMuscle } from "@/lib/muscles";

export async function getProgressData(ownerId: string) {
  const db = getDb();
  const since = daysAgoKey(55);
  const [profile, completed, workoutSets, meals, body] = await Promise.all([
    db.select({ calorieGoal: users.calorieGoal, dailyCalorieGoal: users.dailyCalorieGoal }).from(users).where(eq(users.id, ownerId)).limit(1),
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
  const muscleTotals = workoutSets.filter((row) => row.session.sessionDate >= daysAgoKey(6)).reduce<Record<string, number>>((totals, row) => { if (row.set.completed) { const muscle = normalizeMuscle(row.exercise.primaryMuscle) ?? row.exercise.primaryMuscle; totals[muscle] = (totals[muscle] ?? 0) + 1; } return totals; }, {});
  const dailyMacros = Object.values(aggregateMacros(meals.map((meal) => ({ date: dateKey(new Date(meal.eatenAt)), calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat })))).sort((a, b) => a.date.localeCompare(b.date));
  const dailyVolume = Object.entries(workoutSets.reduce<Record<string, number>>((totals, row) => {
    if (row.set.completed && row.set.weightKg !== null && row.set.reps !== null) {
      totals[row.session.sessionDate] = (totals[row.session.sessionDate] ?? 0) + row.set.weightKg * row.set.reps;
    }
    return totals;
  }, {})).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  const exerciseHistory = Object.values(workoutSets.reduce<Record<string, { name: string; primaryMuscle: string; byDate: Record<string, { weightKg: number; reps: number }> }>>((groups, row) => {
    if (!row.set.completed || row.set.weightKg === null || row.set.reps === null) return groups;
    const current = groups[row.exercise.id] ?? { name: row.exercise.name, primaryMuscle: row.exercise.primaryMuscle, byDate: {} };
    const previous = current.byDate[row.session.sessionDate];
    if (!previous || row.set.weightKg > previous.weightKg) current.byDate[row.session.sessionDate] = { weightKg: row.set.weightKg, reps: row.set.reps };
    groups[row.exercise.id] = current;
    return groups;
  }, {}));
  const exerciseProgression = exerciseHistory.map((exercise) => {
    const points = Object.entries(exercise.byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, point]) => ({ date, ...point }));
    return { name: exercise.name, primaryMuscle: exercise.primaryMuscle, points, currentWeightKg: points.at(-1)?.weightKg ?? 0, changeKg: points.length > 1 ? (points.at(-1)?.weightKg ?? 0) - points[0].weightKg : null };
  }).sort((a, b) => b.points.length - a.points.length || b.currentWeightKg - a.currentWeightKg).slice(0, 5);
  return { streak: calculateStreak(allDates), week: weekCompletion(allDates), completedDates: completed.map((row) => row.sessionDate), volume, currentWeekVolume, previousWeekVolume, muscleTotals, dailyVolume, exerciseProgression, bodyMetrics: body, dailyMacros, calorieGoal: profile[0]?.calorieGoal ?? null, dailyCalorieGoal: profile[0]?.dailyCalorieGoal ?? null, hasData: completed.length > 0 || meals.length > 0 || body.length > 0 };
}
