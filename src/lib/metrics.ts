export function kgFromUnit(value: number | null | undefined, unit: "kg" | "lb") {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return unit === "lb" ? value * 0.45359237 : value;
}

export function valueInUnit(valueKg: number | null | undefined, unit: "kg" | "lb") {
  if (valueKg === null || valueKg === undefined || Number.isNaN(valueKg)) return null;
  return unit === "lb" ? valueKg / 0.45359237 : valueKg;
}

export function calculateBmi(weightKg: number, heightCm: number | null | undefined) {
  if (!heightCm || heightCm <= 0) return null;
  return Math.round((weightKg / ((heightCm / 100) ** 2)) * 10) / 10;
}

export const activityLevels = [
  { value: "sedentary", label: "Sedentary", hint: "little or no exercise", multiplier: 1.2 },
  { value: "light", label: "Lightly active", hint: "light exercise 1-3 days a week", multiplier: 1.375 },
  { value: "moderate", label: "Moderately active", hint: "moderate exercise 3-5 days a week", multiplier: 1.55 },
  { value: "active", label: "Very active", hint: "hard exercise 6-7 days a week", multiplier: 1.725 },
  { value: "veryActive", label: "Extra active", hint: "hard exercise plus a physical job", multiplier: 1.9 },
] as const;

export type ActivityLevel = (typeof activityLevels)[number]["value"];

export function activityMultiplier(level: ActivityLevel | null | undefined) {
  return activityLevels.find((option) => option.value === level)?.multiplier ?? null;
}

export function calculateBmr(weightKg: number, heightCm: number, age: number, sex: "male" | "female") {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "male" ? base + 5 : base - 161);
}

export function calculateTdee(bmr: number, level: ActivityLevel | null | undefined) {
  const multiplier = activityMultiplier(level);
  if (multiplier === null) return null;
  return Math.round(bmr * multiplier);
}

export const calorieGoals = [
  { value: "cut", label: "Cut", adjustment: -500 },
  { value: "maintain", label: "Maintain", adjustment: 0 },
  { value: "bulk", label: "Bulk", adjustment: 250 },
] as const;

export type CalorieGoal = (typeof calorieGoals)[number]["value"];

export function calculateCalorieTargets(tdee: number) {
  return calorieGoals.map((goal) => ({
    ...goal,
    calories: Math.max(0, Math.round(tdee + goal.adjustment)),
  }));
}

export function calorieGoalLabel(goal: CalorieGoal | null | undefined) {
  return calorieGoals.find((option) => option.value === goal)?.label ?? null;
}

export function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysAgoKey(days: number, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return dateKey(date);
}

export function isDateInLoggingWindow(value: string, from = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const target = new Date(`${value}T12:00:00`);
  if (Number.isNaN(target.getTime()) || dateKey(target) !== value) return false;
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - 7);
  const end = new Date(from);
  end.setHours(12, 0, 0, 0);
  end.setDate(end.getDate() + 7);
  return target >= start && target <= end;
}

export function calculateStreak(completedDates: string[], today = new Date()) {
  const dates = new Set(completedDates);
  let cursor = dateKey(today);
  if (!dates.has(cursor)) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    cursor = dateKey(yesterday);
    if (!dates.has(cursor)) return 0;
  }
  let streak = 0;
  const current = new Date(`${cursor}T12:00:00`);
  while (dates.has(dateKey(current))) {
    streak += 1;
    current.setDate(current.getDate() - 1);
  }
  return streak;
}

export function weekCompletion(completedDates: string[], from = new Date()) {
  const dates = new Set(completedDates);
  const result: Array<{ label: string; date: string; complete: boolean; today: boolean }> = [];
  const start = new Date(from);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  for (let index = 0; index < 7; index += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    result.push({ label: current.toLocaleDateString("en-US", { weekday: "narrow" }), date: dateKey(current), complete: dates.has(dateKey(current)), today: dateKey(current) === dateKey(from) });
  }
  return result;
}

export function loggingWindow(completedDates: string[], from = new Date()) {
  const dates = new Set(completedDates);
  const result: Array<{ label: string; dateLabel: string; date: string; complete: boolean; today: boolean }> = [];
  const start = new Date(from);
  start.setDate(start.getDate() - 7);
  for (let index = 0; index < 15; index += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const date = dateKey(current);
    result.push({
      label: current.toLocaleDateString("en-US", { weekday: "short" }),
      dateLabel: current.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      date,
      complete: dates.has(date),
      today: date === dateKey(from),
    });
  }
  return result;
}

export function calculateVolume(sets: Array<{ weightKg: number | null; reps: number | null; completed: boolean }>) {
  return sets.reduce((total, set) => total + (set.completed && set.weightKg && set.reps ? set.weightKg * set.reps : 0), 0);
}

export function estimateOneRepMax(weightKg: number, reps: number) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg <= 0 || reps <= 0) return null;
  if (reps === 1) return Math.round(weightKg * 100) / 100;
  const estimate = weightKg * (1 + reps / 30);
  return Math.round(estimate * 100) / 100;
}

export function aggregateMacros(rows: Array<{ date: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }>) {
  return rows.reduce<Record<string, { date: string; calories: number; protein: number; carbs: number; fat: number }>>((totals, row) => {
    const current = totals[row.date] ?? { date: row.date, calories: 0, protein: 0, carbs: 0, fat: 0 };
    current.calories += row.calories ?? 0;
    current.protein += row.protein ?? 0;
    current.carbs += row.carbs ?? 0;
    current.fat += row.fat ?? 0;
    totals[row.date] = current;
    return totals;
  }, {});
}

export function nextTemplatePosition(templatePositions: number[], lastPosition: number | null) {
  if (!templatePositions.length) return null;
  if (lastPosition === null || lastPosition === undefined) return templatePositions[0];
  return templatePositions.find((position) => position > lastPosition) ?? templatePositions[0];
}

export function firstName(displayName: string | null | undefined): string {
  if (!displayName) return "there";
  const trimmed = displayName.trim();
  if (!trimmed) return "there";
  const lower = trimmed.toLowerCase();
  if (lower === "training journal" || lower === "training") return "there";
  const token = trimmed.split(/\s+/)[0];
  return token ? token : "there";
}

export function shortWorkoutName(templateName: string): string {
  if (!templateName) return "";
  const trimmed = templateName.trim();
  if (!trimmed) return "";
  const afterDash = trimmed.includes(" - ") ? trimmed.slice(trimmed.lastIndexOf(" - ") + 3) : trimmed;
  return afterDash.replace(/\s*\(.*\)\s*$/, "").trim();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getProteinTargets(weightKg: number | null | undefined): { low: number; high: number } | null {
  if (weightKg === null || weightKg === undefined || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  return { low: round1(weightKg * 1.8), high: round1(weightKg * 2.2) };
}

export function getFatTarget(weightKg: number | null | undefined): number | null {
  if (weightKg === null || weightKg === undefined || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  return round1(weightKg * 0.5);
}

export function getMacroTargets(weightKg: number | null | undefined): { protein: { low: number; high: number } | null; fat: number | null } {
  return { protein: getProteinTargets(weightKg), fat: getFatTarget(weightKg) };
}
