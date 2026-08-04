"use client";

import { useState } from "react";
import { Check, ChevronRight, Dumbbell, Scale, Sparkles, Utensils, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getProgressData } from "@/lib/queries/progress";
import { dateKey } from "@/lib/metrics";

type ProgressData = Awaited<ReturnType<typeof getProgressData>>;
type Metric = "weight" | "bmi" | "bodyFat";
type Range = "7D" | "30D" | "56D";
type Movement = ProgressData["exerciseProgression"][number];

const chartLime = "var(--lime)";
const chartFuel = "var(--fuel)";
const chartMuted = "var(--text-muted)";
const chartGrid = "var(--muted)";
const chartSurfaceStrong = "var(--surface-strong)";
const muscleColors = ["var(--lime)", "var(--fuel)", "var(--coral)", "var(--lime-deep)", "var(--success)", "var(--fuel-deep)"];

export function ProgressScreen({ data }: { data: ProgressData }) {
  const [metric, setMetric] = useState<Metric>("weight");
  const [range, setRange] = useState<Range>("30D");
  const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null);
  const rangeDays = range === "7D" ? 7 : range === "30D" ? 30 : 56;
  const workoutDates = data.completedDates.filter((date) => isWithinDays(date, rangeDays));
  const volumeRows = data.dailyVolume.filter((row) => isWithinDays(row.date, rangeDays));
  const rangeVolume = volumeRows.reduce((total, row) => total + row.value, 0);
  const previousVolume = data.dailyVolume.filter((row) => isWithinPreviousRange(row.date, rangeDays)).reduce((total, row) => total + row.value, 0);
  const volumeChange = previousVolume > 0 ? ((rangeVolume - previousVolume) / previousVolume) * 100 : null;
  const macroData = data.dailyMacros.filter((row) => isWithinDays(row.date, rangeDays));
  const averageCalories = average(macroData.map((row) => row.calories));
  const averageProtein = average(macroData.map((row) => row.protein));
  const bodyData = data.bodyMetrics.filter((row) => isWithinDays(row.metricDate, rangeDays)).map((row) => ({ date: row.metricDate, value: metricValue(row, metric) })).filter((row) => row.value !== null);
  const movementData = data.exerciseProgression.map((movement) => {
    const points = movement.points.filter((point) => isWithinDays(point.date, rangeDays));
    return { ...movement, points, currentWeightKg: points.at(-1)?.weightKg ?? 0, changeKg: points.length > 1 ? (points.at(-1)?.weightKg ?? 0) - points[0].weightKg : null };
  }).filter((movement) => movement.points.length);
  const muscles = Object.entries(data.muscleTotals).sort(([, a], [, b]) => b - a);
  const totalSets = muscles.reduce((total, [, count]) => total + count, 0);
  const volumeChartData = buildVolumeChartData(volumeRows, range);
  const latestMovement = movementData[0];
  const insight = getInsight({ hasData: data.hasData, workoutCount: workoutDates.length, latestMovement, rangeVolume, volumeChange });
  const latestBodyPoint = bodyData.at(-1);
  const bodyChange = bodyData.length > 1 ? (bodyData.at(-1)!.value! - bodyData[0].value!) : null;

  return <>
    <div className="progress-header">
      <div>
        <div className="eyebrow">Patterns, not pressure</div>
        <h1 className="page-title">Progress</h1>
        <p className="page-subtitle">A clearer view of the work you have kept visible.</p>
      </div>
      <div className="progress-range" aria-label="Progress range">
        {(["7D", "30D", "56D"] as const).map((option) => <button className={range === option ? "active" : ""} key={option} onClick={() => setRange(option)}>{option}</button>)}
      </div>
    </div>

    <div className="progress-insight"><span className="progress-insight-icon"><Sparkles size={17} /></span><p>{insight}</p></div>

    <div className="progress-stat-grid">
      <ProgressStat icon={<Dumbbell size={16} />} label="Workouts" value={String(workoutDates.length)} detail={`completed in ${rangeLabel(range)}`} tone="lime" />
      <ProgressStat icon={<ChevronRight size={16} />} label="Training load" value={rangeVolume ? `${Math.round(rangeVolume).toLocaleString()} kg` : "Building"} detail={volumeChange === null ? "weighted sets logged" : `${formatSignedPercent(volumeChange)} vs prior period`} tone="coral" />
      <ProgressStat icon={<Utensils size={16} />} label="Daily fuel" value={averageCalories ? `${Math.round(averageCalories).toLocaleString()} kcal` : "Not logged"} detail={averageProtein ? `${Math.round(averageProtein)}g protein average` : "confirmed meals will appear here"} tone="fuel" />
    </div>

    <section className="progress-card activity-card">
      <div className="progress-card-heading"><div><h2>Weekly activity</h2><p>Keep the rhythm visible, without chasing a perfect week.</p></div><span className="progress-card-meta">{data.streak} day streak</span></div>
      <div className="activity-days">{data.week.map((day) => <div className="activity-day" key={day.date}><span className={`activity-dot${day.complete ? " complete" : ""}${day.today ? " today" : ""}`}>{day.complete ? <Check size={15} /> : day.label}</span><span>{new Date(`${day.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}</span><small>{new Date(`${day.date}T12:00:00`).getDate()}</small></div>)}</div>
    </section>

    <section className="progress-card balance-card">
      <div className="progress-card-heading"><div><h2>Muscle focus</h2><p>Completed working sets across the last seven days.</p></div><span className="progress-card-meta">{totalSets ? `${totalSets} sets` : "No sets yet"}</span></div>
      {muscles.length ? <><div className="focus-bar">{muscles.map(([muscle, count], index) => <span key={muscle} style={{ width: `${(count / totalSets) * 100}%`, background: muscleColors[index % muscleColors.length] }} title={`${muscle}: ${count} sets`} />)}</div><div className="focus-legend">{muscles.slice(0, 6).map(([muscle, count], index) => <div key={muscle}><span style={{ background: muscleColors[index % muscleColors.length] }} /><strong>{muscle}</strong><small>{Math.round((count / totalSets) * 100)}% · {count} sets</small></div>)}</div></> : <div className="progress-empty">Complete a set to start seeing where your training attention goes.</div>}
    </section>

    <section className="progress-card chart-card">
      <div className="progress-card-heading"><div><h2>Training load</h2><p>Weekly volume from completed sets with weight and reps.</p></div><span className="progress-card-meta">{rangeLabel(range)}</span></div>
      {volumeChartData.length ? <div className="chart-wrap progress-chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={volumeChartData} barCategoryGap="22%"><CartesianGrid vertical={false} stroke={chartGrid} /><XAxis dataKey="label" tick={{ fill: chartMuted, fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: chartMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={40} /><Tooltip cursor={{ fill: chartSurfaceStrong }} contentStyle={tooltipStyle} /><Bar dataKey="total" fill={chartLime} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="progress-empty">Complete weighted sets to make training load visible here.</div>}
    </section>

    <section className="progress-section-heading"><div><div className="eyebrow">The details behind the pattern</div><h2>Strength progression</h2></div><span>Most recorded movements</span></section>
    {movementData.length ? <div className="movement-list">{movementData.slice(0, 3).map((movement) => <button className="movement-row" key={movement.name} onClick={() => setSelectedMovement(movement)}><div className="movement-copy"><strong>{movement.name}</strong><span>{movement.primaryMuscle} · {movement.points.at(-1)?.reps ?? "—"} reps at current best</span></div><Sparkline points={movement.points.map((point) => point.weightKg)} /><div className="movement-value"><strong>{formatKg(movement.currentWeightKg)}</strong><span>{movement.changeKg === null ? "Baseline" : formatSignedKg(movement.changeKg)}</span></div><ChevronRight size={17} className="movement-chevron" /></button>)}</div> : <div className="progress-empty movement-empty">Log the same movement more than once to reveal strength trends.</div>}

    <div className="progress-duo">
      <section className="progress-card body-card"><div className="progress-card-heading"><div><h2>Body trend</h2><p>Snapshots over {rangeLabel(range)}.</p></div><Scale size={18} className="card-icon" /></div><div className="metric-switcher">{(["weight", "bmi", "bodyFat"] as const).map((option) => <button className={metric === option ? "active" : ""} key={option} onClick={() => setMetric(option)}>{metricLabel(option)}</button>)}</div>{bodyData.length ? <><div className="body-current"><strong>{formatMetric(latestBodyPoint?.value, metric)}</strong><span>{latestBodyPoint ? formatDate(latestBodyPoint.date) : ""}</span></div><div className="chart-wrap body-chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={bodyData}><CartesianGrid vertical={false} stroke={chartGrid} /><XAxis dataKey="date" hide /><YAxis domain={["dataMin - 1", "dataMax + 1"]} hide /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatMetric(typeof value === "number" ? value : null, metric), metricLabel(metric)]} labelFormatter={(value) => formatDate(String(value))} /><Line type="monotone" dataKey="value" stroke={chartLime} strokeWidth={2.5} dot={{ r: 3, fill: chartFuel, stroke: chartLime }} connectNulls /></LineChart></ResponsiveContainer></div><span className="chart-note">{bodyChange === null ? "Baseline established" : `${bodyChange.toFixed(1)} ${metric === "weight" ? "kg" : metric === "bodyFat" ? "%" : "points"} across available snapshots`}</span></> : <div className="progress-empty">Use Today to record weight and optionally height or body fat.</div>}</section>
      <section className="progress-card macro-card"><div className="progress-card-heading"><div><h2>Daily fuel</h2><p>Average confirmed meal estimates.</p></div><Utensils size={18} className="card-icon fuel-icon" /></div>{macroData.length ? <><div className="macro-total"><strong>{averageCalories ? `${Math.round(averageCalories).toLocaleString()}` : "—"}</strong><span>kcal per logged day</span></div><MacroRow label="Protein" value={averageProtein} color="var(--lime)" total={macroTotal(averageProtein, average(macroData.map((row) => row.carbs)), average(macroData.map((row) => row.fat)))} /><MacroRow label="Carbs" value={average(macroData.map((row) => row.carbs))} color="var(--fuel)" total={macroTotal(averageProtein, average(macroData.map((row) => row.carbs)), average(macroData.map((row) => row.fat)))} /><MacroRow label="Fat" value={average(macroData.map((row) => row.fat))} color="var(--coral)" total={macroTotal(averageProtein, average(macroData.map((row) => row.carbs)), average(macroData.map((row) => row.fat)))} /><span className="chart-note">{macroData.length} logged {macroData.length === 1 ? "day" : "days"} · estimates are for direction, not precision</span></> : <div className="progress-empty">Confirmed meal estimates will appear here as your food log grows.</div>}</section>
    </div>

    {selectedMovement && <MovementSheet movement={selectedMovement} onClose={() => setSelectedMovement(null)} />}
  </>;
}

function ProgressStat({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "lime" | "coral" | "fuel" }) { return <div className={`progress-stat ${tone}`}><span className="progress-stat-icon">{icon}</span><span className="progress-stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>; }

function MacroRow({ label, value, color, total }: { label: string; value: number; color: string; total: number }) { const share = total ? Math.min(100, (macroCalories(label, value) / total) * 100) : 0; return <div className="macro-row"><div><strong>{label}</strong><span>{Math.round(value)}g</span></div><div className="macro-track"><span style={{ width: `${share}%`, background: color }} /></div></div>; }

function Sparkline({ points }: { points: number[] }) { const min = Math.min(...points); const max = Math.max(...points); const spread = max - min || 1; const coordinates = points.map((point, index) => `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100},${34 - ((point - min) / spread) * 27}`).join(" "); return <svg className="movement-sparkline" viewBox="0 0 100 40" aria-hidden="true"><polyline fill="none" stroke="var(--lime)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={coordinates} /></svg>; }

function MovementSheet({ movement, onClose }: { movement: Movement; onClose: () => void }) { return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="movement-title"><div className="sheet compact-sheet progress-movement-sheet"><div className="sheet-heading"><div><div className="eyebrow">Exercise breakdown</div><h2 className="sheet-title" id="movement-title">{movement.name}</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div><p className="sheet-intro">Heaviest completed set recorded for each workout in the selected period.</p><div className="movement-sheet-summary"><div><span>Current best</span><strong>{formatKg(movement.currentWeightKg)}</strong></div><div><span>Change</span><strong>{movement.changeKg === null ? "Baseline" : formatSignedKg(movement.changeKg)}</strong></div></div><div className="movement-history">{movement.points.map((point) => <div key={point.date}><span>{formatDate(point.date)}</span><strong>{formatKg(point.weightKg)}</strong><small>{point.reps} reps</small></div>)}</div><div className="sheet-actions"><button className="button" onClick={onClose}>Close</button></div></div></div>; }

function isWithinDays(value: string, days: number) { const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1)); return new Date(`${value}T12:00:00`) >= start; }
function isWithinPreviousRange(value: string, days: number) { const end = new Date(); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - days); const start = new Date(end); start.setDate(start.getDate() - days + 1); const date = new Date(`${value}T12:00:00`); return date >= start && date <= end; }
function rangeLabel(range: Range) { return range === "7D" ? "the last 7 days" : range === "30D" ? "the last 30 days" : "the last 8 weeks"; }
function average(values: number[]) { return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0; }
function formatSignedPercent(value: number) { return `${value > 0 ? "+" : ""}${Math.round(value)}%`; }
function formatSignedKg(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)} kg`; }
function formatKg(value: number | null | undefined) { return value === null || value === undefined ? "—" : `${value.toFixed(1)} kg`; }
function metricLabel(metric: Metric) { return metric === "bodyFat" ? "Body fat" : metric === "weight" ? "Weight" : "BMI"; }
function metricValue(row: ProgressData["bodyMetrics"][number], metric: Metric) { return metric === "weight" ? row.weightKg : metric === "bmi" ? row.bmi : row.bodyFatPercent; }
function formatMetric(value: number | null | undefined, metric: Metric) { if (value === null || value === undefined) return "—"; return `${value.toFixed(1)}${metric === "weight" ? " kg" : metric === "bodyFat" ? "%" : ""}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function buildVolumeChartData(rows: Array<{ date: string; value: number }>, range: Range) {
  if (range === "7D") return rows.map((row) => ({ label: formatDate(row.date), total: row.value }));
  const weeklyTotals = rows.reduce<Record<string, number>>((totals, row) => {
    const week = weekStartKey(row.date);
    totals[week] = (totals[week] ?? 0) + row.value;
    return totals;
  }, {});
  return Object.entries(weeklyTotals).sort(([first], [second]) => first.localeCompare(second)).map(([week, total]) => ({ label: formatDate(week), total }));
}
function weekStartKey(value: string) { const date = new Date(`${value}T12:00:00`); const day = date.getDay(); date.setDate(date.getDate() - (day === 0 ? 6 : day - 1)); return dateKey(date); }
function macroCalories(label: string, value: number) { return value * (label === "Fat" ? 9 : 4); }
function macroTotal(protein: number, carbs: number, fat: number) { return macroCalories("Protein", protein) + macroCalories("Carbs", carbs) + macroCalories("Fat", fat); }
function getInsight({ hasData, workoutCount, latestMovement, rangeVolume, volumeChange }: { hasData: boolean; workoutCount: number; latestMovement: Movement | undefined; rangeVolume: number; volumeChange: number | null }) { if (!hasData) return "Your progress story starts with the first log. Complete a workout, confirm a meal, or add a body check-in to make the pattern visible."; if (latestMovement?.changeKg && latestMovement.changeKg > 0) return `${latestMovement.name} is moving forward: your recorded best is up ${latestMovement.changeKg.toFixed(1)} kg across the selected period.`; if (volumeChange !== null && volumeChange > 0) return `You have moved ${Math.round(rangeVolume).toLocaleString()} kg in the selected period, up ${Math.round(volumeChange)}% from the one before it.`; if (workoutCount) return `${workoutCount} completed ${workoutCount === 1 ? "workout is" : "workouts are"} keeping your training story visible.`; return "A little more history will turn your logs into useful patterns."; }

const tooltipStyle = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 };
