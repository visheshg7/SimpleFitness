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
