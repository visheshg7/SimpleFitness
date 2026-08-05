import { Utensils } from "lucide-react";

export type DailyFuelData = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function DailyFuelCard({ data, targetCalories, targetLabel, subtitle, emptyMessage, footer, onLogMeal }: { data: DailyFuelData | null; targetCalories?: number | null; targetLabel?: string | null; subtitle: string; emptyMessage: string; footer: string; onLogMeal?: () => void }) {
  const target = typeof targetCalories === "number" && targetCalories > 0 ? targetCalories : null;
  const progress = data && target !== null ? Math.min(100, (data.calories / target) * 100) : 0;
  const difference = data && target !== null ? Math.round(data.calories - target) : null;

  return <section className="progress-card macro-card daily-fuel-card">
    <div className="progress-card-heading"><div><h2>Daily fuel</h2><p>{subtitle}</p></div><Utensils size={18} className="card-icon fuel-icon" /></div>
    {data ? <>
      <div className="macro-total"><strong>{data.calories ? `${Math.round(data.calories).toLocaleString()}` : "—"}</strong><span>kcal</span></div>
      {target !== null && <FuelGuide difference={difference} label={targetLabel} progress={progress} targetCalories={target} />}
      <MacroRow label="Protein" value={data.protein} color="var(--lime)" total={macroTotal(data)} />
      <MacroRow label="Carbs" value={data.carbs} color="var(--fuel)" total={macroTotal(data)} />
      <MacroRow label="Fat" value={data.fat} color="var(--coral)" total={macroTotal(data)} />
      <span className="chart-note">{footer}</span>
    </> : <>{target !== null && <FuelGuide label={targetLabel} progress={progress} targetCalories={target} />}<div className="progress-empty daily-fuel-empty"><p>{emptyMessage}</p>{onLogMeal && <button className="button small citrus" onClick={onLogMeal}>Log a meal</button>}</div></>}
  </section>;
}

function FuelGuide({ difference, label, progress, targetCalories }: { difference?: number | null; label?: string | null; progress: number; targetCalories: number }) {
  const differenceLabel = difference === null || difference === undefined ? "Log meals to track your day" : difference === 0 ? "On target" : `${Math.abs(difference).toLocaleString()} kcal ${difference > 0 ? "over" : "to go"}`;
  return <div className="fuel-guide" aria-label={`Daily calorie goal ${targetCalories.toLocaleString()} kcal`}><div className="fuel-guide-heading"><span>Daily guide{label ? ` · ${label}` : ""}</span><strong>{targetCalories.toLocaleString()} kcal</strong></div><div className="fuel-guide-track"><span style={{ width: `${progress}%` }} /></div><span className="fuel-guide-note">{differenceLabel}</span></div>;
}

function MacroRow({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
  const share = total ? Math.min(100, (macroCalories(label, value) / total) * 100) : 0;
  return <div className="macro-row"><div><strong>{label}</strong><span>{Math.round(value)}g</span></div><div className="macro-track"><span style={{ width: `${share}%`, background: color }} /></div></div>;
}

function macroCalories(label: string, value: number) { return value * (label === "Fat" ? 9 : 4); }
function macroTotal(data: DailyFuelData) { return macroCalories("Protein", data.protein) + macroCalories("Carbs", data.carbs) + macroCalories("Fat", data.fat); }
