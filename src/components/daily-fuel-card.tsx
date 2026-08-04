import { Utensils } from "lucide-react";

export type DailyFuelData = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function DailyFuelCard({ data, subtitle, emptyMessage, footer, onLogMeal }: { data: DailyFuelData | null; subtitle: string; emptyMessage: string; footer: string; onLogMeal?: () => void }) {
  return <section className="progress-card macro-card daily-fuel-card">
    <div className="progress-card-heading"><div><h2>Daily fuel</h2><p>{subtitle}</p></div><Utensils size={18} className="card-icon fuel-icon" /></div>
    {data ? <>
      <div className="macro-total"><strong>{data.calories ? `${Math.round(data.calories).toLocaleString()}` : "—"}</strong><span>kcal</span></div>
      <MacroRow label="Protein" value={data.protein} color="var(--lime)" total={macroTotal(data)} />
      <MacroRow label="Carbs" value={data.carbs} color="var(--fuel)" total={macroTotal(data)} />
      <MacroRow label="Fat" value={data.fat} color="var(--coral)" total={macroTotal(data)} />
      <span className="chart-note">{footer}</span>
    </> : <div className="progress-empty daily-fuel-empty"><p>{emptyMessage}</p>{onLogMeal && <button className="button small citrus" onClick={onLogMeal}>Log a meal</button>}</div>}
  </section>;
}

function MacroRow({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
  const share = total ? Math.min(100, (macroCalories(label, value) / total) * 100) : 0;
  return <div className="macro-row"><div><strong>{label}</strong><span>{Math.round(value)}g</span></div><div className="macro-track"><span style={{ width: `${share}%`, background: color }} /></div></div>;
}

function macroCalories(label: string, value: number) { return value * (label === "Fat" ? 9 : 4); }
function macroTotal(data: DailyFuelData) { return macroCalories("Protein", data.protein) + macroCalories("Carbs", data.carbs) + macroCalories("Fat", data.fat); }
