import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bodyMetrics, exercises, mealLogs, sessions, setLogs, trackedExercises, users } from "@/db/schema";
import { aggregateMacros, calculateStreak, dateKey, estimateOneRepMax } from "@/lib/metrics";
import { normalizeMuscle } from "@/lib/muscles";

export async function getProgressData(ownerId: string) {
  const db = getDb();
  const [profile, completed, workoutSets, meals, body, tracked] = await Promise.all([
    db.select({ calorieGoal: users.calorieGoal, dailyCalorieGoal: users.dailyCalorieGoal, sex: users.sex }).from(users).where(eq(users.id, ownerId)).limit(1),
    db.select({ sessionDate: sessions.sessionDate }).from(sessions).where(and(eq(sessions.ownerId, ownerId), isNotNull(sessions.completedAt))).orderBy(asc(sessions.sessionDate)),
    db.select({ set: setLogs, exercise: exercises, session: sessions }).from(setLogs).innerJoin(exercises, eq(setLogs.exerciseId, exercises.id)).innerJoin(sessions, eq(setLogs.sessionId, sessions.id)).where(and(eq(sessions.ownerId, ownerId), isNotNull(sessions.completedAt))),
    db.select().from(mealLogs).where(eq(mealLogs.ownerId, ownerId)).orderBy(mealLogs.eatenAt),
    db.select().from(bodyMetrics).where(eq(bodyMetrics.ownerId, ownerId)).orderBy(bodyMetrics.metricDate),
    db.select({ exerciseId: trackedExercises.exerciseId }).from(trackedExercises).where(eq(trackedExercises.ownerId, ownerId)).orderBy(asc(trackedExercises.position)),
  ]);
  const completedDates = completed.map((row) => row.sessionDate);
  const setCountsByDate = workoutSets.reduce<Record<string, number>>((totals, row) => {
    if (row.set.completed) totals[row.session.sessionDate] = (totals[row.session.sessionDate] ?? 0) + 1;
    return totals;
  }, {});
  const muscleSetCounts = workoutSets.reduce<Record<string, Record<string, number>>>((totals, row) => {
    if (!row.set.completed) return totals;
    const muscle = normalizeMuscle(row.exercise.primaryMuscle);
    if (!muscle) return totals;
    const date = row.session.sessionDate;
    totals[date] = totals[date] ?? {};
    totals[date][muscle] = (totals[date][muscle] ?? 0) + 1;
    return totals;
  }, {});
  const muscleSetCountsByDate = Object.entries(muscleSetCounts).flatMap(([date, byMuscle]) => Object.entries(byMuscle).map(([muscle, count]) => ({ date, muscle, count }))).sort((a, b) => a.date.localeCompare(b.date) || a.muscle.localeCompare(b.muscle));
  const dailyMacros = Object.values(aggregateMacros(meals.map((meal) => ({ date: dateKey(new Date(meal.eatenAt)), calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat })))).sort((a, b) => a.date.localeCompare(b.date));
  const exerciseGroups = new Map<string, { id: string; name: string; primaryMuscle: string; byDate: Map<string, { weightKg: number; reps: number; e1rm: number }> }>();
  for (const row of workoutSets) {
    if (!row.set.completed || row.set.weightKg === null || row.set.reps === null) continue;
    const e1rm = estimateOneRepMax(row.set.weightKg, row.set.reps);
    if (e1rm === null) continue;
    const group = exerciseGroups.get(row.exercise.id) ?? { id: row.exercise.id, name: row.exercise.name, primaryMuscle: row.exercise.primaryMuscle, byDate: new Map() };
    const previous = group.byDate.get(row.session.sessionDate);
    if (!previous || e1rm > previous.e1rm) group.byDate.set(row.session.sessionDate, { weightKg: row.set.weightKg, reps: row.set.reps, e1rm });
    exerciseGroups.set(row.exercise.id, group);
  }
  const exerciseHistory = [...exerciseGroups.values()].map((group) => {
    const points = [...group.byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, point]) => ({ date, ...point }));
    let bestE1rm = 0;
    let prCount = 0;
    for (const point of points) {
      if (point.e1rm > bestE1rm + 0.005) {
        if (bestE1rm > 0) prCount += 1;
        bestE1rm = point.e1rm;
      }
    }
    return { id: group.id, name: group.name, primaryMuscle: group.primaryMuscle, points, prCount };
  }).sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));
  const savedTrackedIds = tracked.map((row) => row.exerciseId);
  const trackedExerciseIds = savedTrackedIds.length ? savedTrackedIds : exerciseHistory.slice(0, 4).map((exercise) => exercise.id);
  return { streak: calculateStreak(completedDates), completedDates, setCountsByDate, muscleSetCountsByDate, exerciseHistory, trackedExerciseIds, trackedSource: savedTrackedIds.length ? ("saved" as const) : ("suggested" as const), bodyMetrics: body, dailyMacros, calorieGoal: profile[0]?.calorieGoal ?? null, dailyCalorieGoal: profile[0]?.dailyCalorieGoal ?? null, bodyGender: profile[0]?.sex ?? "male", hasData: completed.length > 0 || meals.length > 0 || body.length > 0 };
}
