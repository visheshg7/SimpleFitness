"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Dumbbell, Scale, SlidersHorizontal, Sparkles, TrendingUp, Utensils, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DailyFuelCard } from "@/components/daily-fuel-card";
import { MuscleHeatmap } from "@/components/muscle-heatmap";
import { buildMuscleHeatmap } from "@/lib/muscle-heatmap";
import { getProgressData } from "@/lib/queries/progress";
import { saveTrackedExercises } from "@/lib/actions/progress";
import { calorieGoalLabel, dateKey, daysAgoKey } from "@/lib/metrics";

type ProgressData = Awaited<ReturnType<typeof getProgressData>>;
type Metric = "weight" | "bmi" | "bodyFat";
type Range = "7D" | "4W" | "12W" | "6M" | "1Y" | "All";
type ExerciseHistory = ProgressData["exerciseHistory"][number];

const RANGES: readonly Range[] = ["7D", "4W", "12W", "6M", "1Y", "All"];
const chartAccent = "var(--accent)";
const chartWarm = "var(--warm)";
const chartGrid = "var(--line)";

export function ProgressScreen({ data }: { data: ProgressData }) {
  const [metric, setMetric] = useState<Metric>("weight");
  const [range, setRange] = useState<Range>("12W");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimisticTracked, setOptimisticTracked] = useState<string[] | null>(null);
  const trackedExerciseIds = optimisticTracked ?? data.trackedExerciseIds;
  // Drop the optimistic list once the revalidated server data confirms it.
  const [prevTracked, setPrevTracked] = useState(data.trackedExerciseIds);
  if (prevTracked !== data.trackedExerciseIds) {
    setPrevTracked(data.trackedExerciseIds);
    setOptimisticTracked(null);
  }

  const todayKey = dateKey(new Date());
  const startKey = range === "All" ? (data.completedDates[0] ?? todayKey) : daysAgoKey(rangeDays(range) - 1);
  const workoutDates = data.completedDates.filter((date) => date >= startKey);
  const macroData = data.dailyMacros.filter((row) => row.date >= startKey);
  const averageCalories = average(macroData.map((row) => row.calories));
  const averageProtein = average(macroData.map((row) => row.protein));
  const bodyData = data.bodyMetrics.filter((row) => row.metricDate >= startKey).map((row) => ({ date: row.metricDate, value: metricValue(row, metric) })).filter((row) => row.value !== null);
  const weightRows = data.bodyMetrics.filter((row) => row.metricDate >= startKey && row.weightKg !== null);
  const latestWeight = weightRows.at(-1)?.weightKg ?? null;
  const weightChange = weightRows.length > 1 ? (weightRows.at(-1)!.weightKg! - weightRows[0].weightKg!) : null;
  const muscleHeatmap = useMemo(() => {
    const totals = data.muscleSetCountsByDate.filter((row) => row.date >= startKey).reduce<Record<string, number>>((acc, row) => { acc[row.muscle] = (acc[row.muscle] ?? 0) + row.count; return acc; }, {});
    return buildMuscleHeatmap(totals);
  }, [data, startKey]);
  const calendar = useMemo(() => buildCalendar({ startKey, todayKey, range, setCountsByDate: data.setCountsByDate }), [data.setCountsByDate, range, startKey, todayKey]);
  const activeWeeks = calendar.filter((week) => week.cells.some((cell) => cell.inRange && cell.level > 0)).length;
  const daysInRange = range === "All" ? Math.max(1, daysBetween(startKey, todayKey) + 1) : rangeDays(range);
  const perWeek = workoutDates.length / Math.max(1, daysInRange / 7);
  const strengthCards = trackedExerciseIds.map((id) => data.exerciseHistory.find((exercise) => exercise.id === id)).filter((exercise): exercise is ExerciseHistory => Boolean(exercise)).map((exercise) => {
    const points = exercise.points.filter((point) => point.date >= startKey);
    const first = points[0];
    const last = points.at(-1);
    const changePct = first && last && points.length > 1 && first.e1rm > 0 ? ((last.e1rm - first.e1rm) / first.e1rm) * 100 : null;
    let best = 0;
    let prsInRange = 0;
    for (const point of exercise.points) {
      if (point.date >= startKey && point.e1rm > best + 0.005) { if (best > 0) prsInRange += 1; best = point.e1rm; }
      else if (point.e1rm > best) best = point.e1rm;
    }
    return { exercise, points, first, last, changePct, prsInRange };
  });
  const totalPrs = strengthCards.reduce((total, card) => total + card.prsInRange, 0);
  const changeValues = strengthCards.map((card) => card.changePct).filter((change): change is number => change !== null);
  const avgChange = changeValues.length ? changeValues.reduce((total, change) => total + change, 0) / changeValues.length : null;
  const bestChange = strengthCards.map((card) => card.changePct).filter((change): change is number => change !== null && change > 0).sort((a, b) => b - a)[0] ?? null;
  const bestChangeName = strengthCards.find((card) => card.changePct !== null && card.changePct > 0)?.exercise.name ?? null;
  const periodDays = range === "All" ? daysBetween(startKey, todayKey) + 1 : rangeDays(range);
  const insight = getInsight({ hasData: data.hasData, workoutCount: workoutDates.length, perWeek, bestChange: bestChange !== null && bestChangeName ? { name: bestChangeName, changePct: bestChange } : null, rangeText: rangeLabel(range) });
  const latestBodyPoint = bodyData.at(-1);
  const bodyChange = bodyData.length > 1 ? (bodyData.at(-1)!.value! - bodyData[0].value!) : null;

  function openPicker() { setPickerError(null); setPickerOpen(true); }
  function savePicked(exerciseIds: string[]) {
    setPickerOpen(false);
    setOptimisticTracked(exerciseIds);
    startTransition(async () => {
      const result = await saveTrackedExercises({ exerciseIds });
      if (!result.success) {
        setOptimisticTracked(null);
        setPickerError(result.error);
      }
    });
  }

  return <>
    <div className="progress-header">
      <div>
        <div className="eyebrow">Patterns, not pressure</div>
        <h1 className="page-title">Progress</h1>
        <p className="page-subtitle">A clearer view of the work you have kept visible.</p>
      </div>
      <div className="progress-range" aria-label="Progress range">
        {RANGES.map((option) => <button className={range === option ? "active" : ""} key={option} onClick={() => setRange(option)}>{option}</button>)}
      </div>
    </div>

    <div className="progress-insight"><span className="progress-insight-icon"><Sparkles size={17} /></span><p>{insight}</p></div>

    <div className="progress-stat-grid">
      <ProgressStat icon={<Dumbbell size={16} />} label="Consistency" value={String(workoutDates.length)} detail={`${perWeek.toFixed(1)} per week · ${activeWeeks} active ${activeWeeks === 1 ? "week" : "weeks"}`} tone="lime" />
      <ProgressStat icon={<TrendingUp size={16} />} label="Strength" value={strengthStatValue(totalPrs, avgChange, strengthCards.length)} detail={strengthStatDetail(totalPrs, avgChange, strengthCards.length)} tone="strength" />
      <ProgressStat icon={<Scale size={16} />} label="Body" value={latestWeight === null ? "Not logged" : `${latestWeight.toFixed(1)} kg`} detail={latestWeight === null ? "record weight in Today to start" : weightChange === null ? `first weigh-in · ${weightRows.length} ${weightRows.length === 1 ? "entry" : "entries"}` : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} kg · ${weightRows.length} weigh-ins`} tone="body" />
      <ProgressStat icon={<Utensils size={16} />} label="Daily fuel" value={averageCalories ? `${Math.round(averageCalories).toLocaleString()} kcal` : "Not logged"} detail={macroData.length ? `${macroData.length} of ${periodDays} days logged · ${Math.round(averageProtein)}g protein` : "confirmed meals will appear here"} tone="fuel" />
    </div>

    <section className="progress-card activity-card">
      <div className="progress-card-heading"><div><h2>Activity</h2><p>Completed sets by day across {rangeLabel(range)}. Darker cells mean more work.</p></div><span className="progress-card-meta">{range === "All" || range === "1Y" ? "last 12 months shown" : rangeLabel(range)}</span></div>
      {data.completedDates.length ? <ActivityCalendar weeks={calendar} /> : <div className="progress-empty">Complete a workout to make your activity pattern visible here.</div>}
      {data.completedDates.length ? <div className="calendar-summary"><span><strong>{workoutDates.length}</strong> workouts</span><span><strong>{activeWeeks}</strong> active {activeWeeks === 1 ? "week" : "weeks"}</span><span><strong>{perWeek.toFixed(1)}</strong> per week</span><span><strong>{data.streak}</strong> day streak</span></div> : null}
    </section>

    <section className="progress-card muscle-heatmap-card">
      <div className="progress-card-heading"><div><h2>Muscle heatmap</h2><p>Completed primary-muscle sets across {rangeLabel(range)}.</p></div><span className="progress-card-meta">{muscleHeatmap.totalSets ? `${muscleHeatmap.totalSets} sets` : "No sets yet"}</span></div>
      <MuscleHeatmap bodyGender={data.bodyGender} heatmap={muscleHeatmap} />
    </section>

    <section className="progress-section-heading">
      <div><div className="eyebrow">The lifts that matter</div><h2>Strength progression</h2></div>
      <div className="strength-heading-actions"><span>{data.trackedSource === "suggested" ? "Suggested from your most recorded lifts" : `${strengthCards.length} tracked ${strengthCards.length === 1 ? "lift" : "lifts"}`}</span>{data.exerciseHistory.length ? <button className="progress-manage" type="button" onClick={openPicker}><SlidersHorizontal size={14} /> Manage lifts</button> : null}</div>
    </section>
    {strengthCards.length ? <div className="strength-grid">{strengthCards.map((card) => <StrengthCard key={card.exercise.id} name={card.exercise.name} muscle={card.exercise.primaryMuscle} points={card.points} last={card.last} changePct={card.changePct} prsInRange={card.prsInRange} rangeText={rangeLabel(range)} />)}</div> : <div className="progress-empty movement-empty">{data.exerciseHistory.length ? "Choose lifts to track, or log the same movement more than once to reveal strength trends." : "Log the same movement more than once to reveal strength trends."}</div>}

    <div className="progress-duo">
      <section className="progress-card body-card"><div className="progress-card-heading"><div><h2>Body trend</h2><p>Snapshots over {rangeLabel(range)}.</p></div><Scale size={18} className="card-icon" /></div><div className="metric-switcher">{(["weight", "bmi", "bodyFat"] as const).map((option) => <button className={metric === option ? "active" : ""} key={option} onClick={() => setMetric(option)}>{metricLabel(option)}</button>)}</div>{bodyData.length ? <><div className="body-current"><strong>{formatMetric(latestBodyPoint?.value, metric)}</strong><span>{latestBodyPoint ? formatDate(latestBodyPoint.date) : ""}</span></div><div className="chart-wrap body-chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={bodyData}><CartesianGrid vertical={false} stroke={chartGrid} /><XAxis dataKey="date" hide /><YAxis domain={["dataMin - 1", "dataMax + 1"]} hide /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatMetric(typeof value === "number" ? value : null, metric), metricLabel(metric)]} labelFormatter={(value) => formatDate(String(value))} /><Line type="monotone" dataKey="value" stroke={chartAccent} strokeWidth={2.5} dot={{ r: 3, fill: chartWarm, stroke: chartAccent }} connectNulls /></LineChart></ResponsiveContainer></div><span className="chart-note">{bodyChange === null ? "Baseline established" : `${bodyChange.toFixed(1)} ${metric === "weight" ? "kg" : metric === "bodyFat" ? "%" : "points"} across available snapshots`}</span></> : <div className="progress-empty">Use Today to record weight and optionally height or body fat.</div>}</section>
      <DailyFuelCard data={macroData.length ? { calories: averageCalories, protein: averageProtein, carbs: average(macroData.map((row) => row.carbs)), fat: average(macroData.map((row) => row.fat)) } : null} targetCalories={data.dailyCalorieGoal} targetLabel={calorieGoalLabel(data.calorieGoal)} subtitle="Average confirmed meal estimates." emptyMessage="Confirmed meal estimates will appear here as your food log grows." footer={`${macroData.length} logged ${macroData.length === 1 ? "day" : "days"} · estimates are for direction, not precision`} />
    </div>

    {pickerOpen && <TrackPicker exercises={data.exerciseHistory} trackedIds={data.trackedExerciseIds} error={pickerError} pending={pending} onCancel={() => setPickerOpen(false)} onSave={savePicked} />}
  </>;
}

function ProgressStat({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "lime" | "strength" | "body" | "fuel" }) { return <div className={`progress-stat ${tone}`}><span className="progress-stat-icon">{icon}</span><span className="progress-stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>; }

function strengthStatValue(totalPrs: number, avgChange: number | null, tracked: number) {
  if (!tracked) return "Not yet";
  if (totalPrs > 0) return String(totalPrs);
  if (avgChange !== null) return formatSignedPercent(avgChange);
  return "Baseline";
}

function strengthStatDetail(totalPrs: number, avgChange: number | null, tracked: number) {
  if (!tracked) return "complete weighted sets to begin";
  if (totalPrs > 0) return `new ${totalPrs === 1 ? "record" : "records"} · ${tracked} tracked ${tracked === 1 ? "lift" : "lifts"}`;
  if (avgChange !== null) return `average e1RM change · ${tracked} tracked ${tracked === 1 ? "lift" : "lifts"}`;
  return `${tracked} tracked ${tracked === 1 ? "lift" : "lifts"} waiting for a second session`;
}

function StrengthCard({ name, muscle, points, last, changePct, prsInRange, rangeText }: { name: string; muscle: string; points: Array<{ date: string; weightKg: number; reps: number; e1rm: number }>; last: { date: string; weightKg: number; reps: number; e1rm: number } | undefined; changePct: number | null; prsInRange: number; rangeText: string }) {
  return <article className="progress-card strength-card">
    <div className="strength-card-head"><strong>{name}</strong><span>{muscle}</span></div>
    {points.length > 1 ? <Sparkline points={points.map((point) => point.e1rm)} /> : <div className="strength-card-empty">One session in {rangeText}</div>}
    <div className="strength-card-value"><strong>{last ? `${Math.round(last.e1rm).toLocaleString()} kg` : "—"}</strong><span>est. 1RM</span></div>
    <div className="strength-card-meta"><span>{changePct === null ? "Baseline" : formatSignedPercent(changePct)}</span><span>{prsInRange ? `${prsInRange} ${prsInRange === 1 ? "PR" : "PRs"}` : "No PRs"}</span></div>
    <div className="strength-card-foot"><span>{last ? `Last ${formatDate(last.date)}` : "Not in this period"}</span><span>{last ? `${formatKg(last.weightKg)} × ${last.reps}` : ""}</span></div>
  </article>;
}

function TrackPicker({ exercises, trackedIds, error, pending, onCancel, onSave }: { exercises: ExerciseHistory[]; trackedIds: string[]; error: string | null; pending: boolean; onCancel: () => void; onSave: (exerciseIds: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>(trackedIds);
  function toggle(id: string) { setSelected((current) => current.includes(id) ? (current.length > 3 ? current.filter((value) => value !== id) : current) : (current.length < 6 ? [...current, id] : current)); }
  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="track-picker-title"><div className="sheet compact-sheet progress-picker-sheet"><div className="sheet-heading"><div><div className="eyebrow">Track your lifts</div><h2 className="sheet-title" id="track-picker-title">Strength progression</h2></div><button className="sheet-close" onClick={onCancel} aria-label="Close"><X size={20} /></button></div><p className="sheet-intro">Choose 3–6 exercises to follow. Their estimated 1RM trend drives your strength summary and cards.</p><div className="track-picker-hint">{selected.length} of 6 selected</div><div className="track-picker-list">{exercises.map((exercise) => { const checked = selected.includes(exercise.id); const disabled = !checked && selected.length >= 6; return <label className={`track-picker-row${checked ? " checked" : ""}${disabled ? " disabled" : ""}`} key={exercise.id}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(exercise.id)} /><span className="track-picker-copy"><strong>{exercise.name}</strong><small>{exercise.primaryMuscle} · {exercise.points.length} {exercise.points.length === 1 ? "session" : "sessions"}</small></span>{checked && <Check size={15} className="track-picker-check" />}</label>; })}</div>{error && <div className="panel-error">{error}</div>}<div className="sheet-actions"><button className="button ghost" onClick={onCancel}>Cancel</button><button className="button" disabled={pending || selected.length < 3} onClick={() => onSave(exercises.map((exercise) => exercise.id).filter((id) => selected.includes(id)))}>Save</button></div></div></div>;
}

function Sparkline({ points }: { points: number[] }) { const min = Math.min(...points); const max = Math.max(...points); const spread = max - min || 1; const coordinates = points.map((point, index) => `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100},${34 - ((point - min) / spread) * 27}`).join(" "); return <svg className="movement-sparkline" viewBox="0 0 100 40" aria-hidden="true"><polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={coordinates} /></svg>; }

function ActivityCalendar({ weeks }: { weeks: CalendarWeek[] }) {
  const gridRows: CalendarCell[][] = Array.from({ length: 7 }, () => []);
  for (const week of weeks) week.cells.forEach((cell, index) => gridRows[index].push(cell));
  const cells = gridRows.flat();
  return <div className="activity-scroll"><div className="activity-calendar">
    <div className="calendar-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 11px)`, columnGap: 3 }}>{weeks.map((week, index) => week.label ? <span key={index} style={{ gridColumnStart: index + 1 }}>{week.label}</span> : null)}</div>
    <div className="activity-calendar-body">
      <div className="calendar-days">{["Mon", "", "Wed", "", "Fri", "", ""].map((label, index) => <span key={index}>{label}</span>)}</div>
      <div className="calendar-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 11px)`, gridAutoRows: 11, gap: 3 }}>{cells.map((cell) => <div key={cell.date} className={`calendar-cell level-${cell.level}${cell.today ? " today" : ""}`} title={cell.inRange ? `${formatDate(cell.date)} · ${cell.sets ? `${cell.sets} ${cell.sets === 1 ? "set" : "sets"}` : "no workout"}` : undefined} />)}</div>
    </div>
    <div className="calendar-legend"><span>Less</span>{[0, 1, 2, 3, 4].map((level) => <span key={level} className={`calendar-cell level-${level} legend-cell`} />)}<span>More</span></div>
  </div></div>;
}

type CalendarCell = { date: string; level: number; sets: number; inRange: boolean; today: boolean };
type CalendarWeek = { label: string | null; cells: CalendarCell[] };

function buildCalendar({ startKey, todayKey, range, setCountsByDate }: { startKey: string; todayKey: string; range: Range; setCountsByDate: Record<string, number> }) {
  const start = new Date(`${startKey}T12:00:00`);
  const day = start.getDay();
  const monday = new Date(start);
  monday.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  const maxWeeks = range === "1Y" || range === "All" ? 53 : Math.max(1, Math.ceil(rangeDays(range) / 7));
  const weeks: CalendarWeek[] = [];
  let previousMonth = -1;
  for (let weekIndex = 0; weekIndex < maxWeeks; weekIndex += 1) {
    const weekMonday = new Date(monday);
    weekMonday.setDate(monday.getDate() + weekIndex * 7);
    const month = weekMonday.getMonth();
    const label = month !== previousMonth ? weekMonday.toLocaleDateString("en-US", { month: "short" }) : null;
    previousMonth = month;
    const cells: CalendarCell[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = new Date(weekMonday);
      date.setDate(weekMonday.getDate() + dayIndex);
      const key = dateKey(date);
      const inRange = key >= startKey && key <= todayKey;
      const sets = inRange ? (setCountsByDate[key] ?? 0) : 0;
      cells.push({ date: key, level: levelFor(sets), sets, inRange, today: key === todayKey });
    }
    weeks.push({ label, cells });
  }
  return weeks;
}

function levelFor(sets: number) { if (sets <= 0) return 0; if (sets <= 2) return 1; if (sets <= 5) return 2; if (sets <= 9) return 3; return 4; }

function rangeDays(range: Range) { return range === "7D" ? 7 : range === "4W" ? 28 : range === "12W" ? 84 : range === "6M" ? 182 : range === "1Y" ? 365 : Number.POSITIVE_INFINITY; }
function rangeLabel(range: Range) { return range === "7D" ? "the last 7 days" : range === "4W" ? "the last 4 weeks" : range === "12W" ? "the last 12 weeks" : range === "6M" ? "the last 6 months" : range === "1Y" ? "the last year" : "all time"; }
function daysBetween(from: string, to: string) { return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000); }
function average(values: number[]) { return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0; }
function formatSignedPercent(value: number) { return `${value > 0 ? "+" : ""}${Math.round(value)}%`; }
function formatKg(value: number | null | undefined) { return value === null || value === undefined ? "—" : `${value.toFixed(1)} kg`; }
function metricLabel(metric: Metric) { return metric === "bodyFat" ? "Body fat" : metric === "weight" ? "Weight" : "BMI"; }
function metricValue(row: ProgressData["bodyMetrics"][number], metric: Metric) { return metric === "weight" ? row.weightKg : metric === "bmi" ? row.bmi : row.bodyFatPercent; }
function formatMetric(value: number | null | undefined, metric: Metric) { if (value === null || value === undefined) return "—"; return `${value.toFixed(1)}${metric === "weight" ? " kg" : metric === "bodyFat" ? "%" : ""}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function getInsight({ hasData, workoutCount, perWeek, bestChange, rangeText }: { hasData: boolean; workoutCount: number; perWeek: number; bestChange: { name: string; changePct: number } | null; rangeText: string }) { if (!hasData) return "Your progress story starts with the first log. Complete a workout, confirm a meal, or add a body check-in to make the pattern visible."; if (bestChange) return `${bestChange.name} is trending up: estimated 1RM is up ${Math.round(bestChange.changePct)}% across ${rangeText}.`; if (workoutCount) return `${workoutCount} completed ${workoutCount === 1 ? "workout keeps" : "workouts keep"} your training story visible, averaging ${perWeek.toFixed(1)} per week.`; return "A little more history will turn your logs into useful patterns."; }

const tooltipStyle = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 };
