import { Utensils } from "lucide-react";
import { getFatTarget, getProteinTargets } from "@/lib/metrics";
import { CountUp } from "@/components/motion-primitives";

export type DailyFuelData = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function DailyFuelCard({
  data,
  latestWeightKg,
  targetCalories,
  targetLabel,
  subtitle,
  emptyMessage,
  footer,
  onLogMeal,
  onOpenDetails,
  onBodyCheckIn,
}: {
  data: DailyFuelData | null;
  latestWeightKg?: number | null;
  targetCalories?: number | null;
  targetLabel?: string | null;
  subtitle?: string;
  emptyMessage: string;
  footer: string;
  onLogMeal?: () => void;
  onOpenDetails?: () => void;
  onBodyCheckIn?: () => void;
}) {
  const target = typeof targetCalories === "number" && targetCalories > 0 ? targetCalories : null;
  const progress = data && target !== null ? Math.min(100, (data.calories / target) * 100) : 0;
  const difference = data && target !== null ? Math.round(data.calories - target) : null;

  const proteinTargets = getProteinTargets(latestWeightKg ?? null);
  const fatTarget = getFatTarget(latestWeightKg ?? null);
  const hasWeight = proteinTargets !== null && fatTarget !== null;
  const totalKcalForShare = data ? macroTotal(data) : 0;

  const facts = data ? (
    <>
      <div className="macro-total">
        <strong>{data.calories ? <CountUp value={data.calories} /> : "—"}</strong>
        <span>kcal</span>
      </div>
      {target !== null && <FuelGuide difference={difference} label={targetLabel} progress={progress} targetCalories={target} />}
      <div className="macro-rings" aria-label="Macro targets">
        <MacroRingCard
          label="Protein"
          value={data.protein}
          subLabel={hasWeight ? `${proteinTargets!.low}–${proteinTargets!.high} g · 1.8–2.2 g/kg` : "No weight — target hidden"}
          rangeLabel={hasWeight ? `${Math.max(0, Math.round(proteinTargets!.low - data.protein))} g ${data.protein < proteinTargets!.low ? "to range" : data.protein > proteinTargets!.high ? "over" : "in range"}` : undefined}
          tone="protein"
          track={
            hasWeight ? (
              <RangeTrack
                current={data.protein}
                low={proteinTargets!.low}
                high={proteinTargets!.high}
                ariaLabel={`Protein ${Math.round(data.protein)} grams, target ${proteinTargets!.low} to ${proteinTargets!.high} grams`}
              />
            ) : (
              <MutedTrack share={totalKcalForShare ? (macroCalories("Protein", data.protein) / totalKcalForShare) * 100 : 0} tone="protein" />
            )
          }
        />
        <MacroRingCard
          label="Fat"
          value={data.fat}
          subLabel={hasWeight ? `${fatTarget} g · 0.5 g/kg` : "No weight — target hidden"}
          rangeLabel={
            hasWeight
              ? data.fat < fatTarget!
                ? `${Math.round(fatTarget! - data.fat)} g to go`
                : data.fat === fatTarget
                  ? "On target"
                  : `${Math.round(data.fat - fatTarget!)} g over`
              : undefined
          }
          tone="fat"
          track={
            hasWeight ? (
              <SingleTargetTrack current={data.fat} target={fatTarget!} ariaLabel={`Fat ${Math.round(data.fat)} grams, target ${fatTarget} grams`} />
            ) : (
              <MutedTrack share={totalKcalForShare ? (macroCalories("Fat", data.fat) / totalKcalForShare) * 100 : 0} tone="fat" />
            )
          }
        />
        <MacroRingCard
          label="Carbs"
          value={data.carbs}
          subLabel={totalKcalForShare ? `${Math.round((macroCalories("Carbs", data.carbs) / totalKcalForShare) * 100)}% of energy` : "No target"}
          tone="carbs"
          track={<MutedTrack share={totalKcalForShare ? (macroCalories("Carbs", data.carbs) / totalKcalForShare) * 100 : 0} tone="carbs" />}
        />
      </div>
      {!hasWeight && onBodyCheckIn && (
        <div className="fuel-weight-hint" role="note">
          <span>Add weight in Body check-in to see protein &amp; fat targets.</span>
          <button type="button" className="button small ghost" onClick={onBodyCheckIn}>
            Body check-in
          </button>
        </div>
      )}
      <span className="chart-note">{footer}</span>
    </>
  ) : (
    <>
      {target !== null && <FuelGuide label={targetLabel} progress={progress} targetCalories={target} />}
      <div className="macro-rings macro-rings-empty" aria-hidden="true">
        <MacroRingCard label="Protein" value={0} subLabel={hasWeight ? `${proteinTargets!.low}–${proteinTargets!.high} g target` : "Add weight to see target"} tone="protein" track={<EmptyTrack />} />
        <MacroRingCard label="Fat" value={0} subLabel={hasWeight ? `${fatTarget} g target` : "Add weight to see target"} tone="fat" track={<EmptyTrack />} />
        <MacroRingCard label="Carbs" value={0} subLabel="No target" tone="carbs" track={<EmptyTrack />} />
      </div>
      {!hasWeight && onBodyCheckIn && (
        <div className="fuel-weight-hint">
          <span>Add weight in Body check-in to see protein &amp; fat targets.</span>
          <button type="button" className="button small ghost" onClick={onBodyCheckIn}>
            Body check-in
          </button>
        </div>
      )}
      <div className="progress-empty daily-fuel-empty">
        {onOpenDetails ? (
          <button className="fuel-empty-copy" type="button" onClick={onOpenDetails}>
            {emptyMessage}
          </button>
        ) : (
          <p>{emptyMessage}</p>
        )}
        {onLogMeal && (
          <button className="button small citrus" onClick={onLogMeal}>
            Log a meal
          </button>
        )}
      </div>
    </>
  );

  const body =
    onOpenDetails && data ? (
      <div
        className="fuel-card-body"
        role="button"
        tabIndex={0}
        aria-label="Open meal details for this day"
        onClick={onOpenDetails}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenDetails();
          }
        }}
      >
        {facts}
      </div>
    ) : (
      facts
    );

  return (
    <section className="progress-card daily-fuel-card">
      <div className="progress-card-heading">
        <div>
          <h2>Daily fuel</h2>
          <p>{subtitle}</p>
        </div>
        <Utensils size={18} className="card-icon fuel-icon" />
      </div>
      {body}
    </section>
  );
}

function FuelGuide({ difference, label, progress, targetCalories }: { difference?: number | null; label?: string | null; progress: number; targetCalories: number }) {
  const differenceLabel =
    difference === null || difference === undefined ? "Log meals to track your day" : difference === 0 ? "On target" : `${Math.abs(difference).toLocaleString()} kcal ${difference > 0 ? "over" : "to go"}`;
  return (
    <div className="fuel-guide" aria-label={`Daily calorie goal ${targetCalories.toLocaleString()} kcal`}>
      <div className="fuel-guide-heading">
        <span>Daily guide{label ? ` · ${label}` : ""}</span>
        <strong>{targetCalories.toLocaleString()} kcal</strong>
      </div>
      <div className="fuel-guide-track">
        <span style={{ width: `${progress}%` }} />
      </div>
      <span className="fuel-guide-note">{differenceLabel}</span>
    </div>
  );
}

function MacroRingCard({
  label,
  value,
  subLabel,
  rangeLabel,
  tone,
  track,
}: {
  label: string;
  value: number;
  subLabel: string;
  rangeLabel?: string;
  tone: "protein" | "carbs" | "fat";
  track: React.ReactNode;
}) {
  return (
    <div className={`macro-ring-card macro-ring-${tone}`}>
      <div className="macro-ring-head">
        <strong>{label}</strong>
        <span className="macro-ring-value">
          <CountUp value={value} format={(latest) => String(Math.round(latest))} />
          <small>g</small>
        </span>
      </div>
      <div className="macro-ring-sub">{subLabel}</div>
      {track}
      {rangeLabel && <span className="macro-ring-status">{rangeLabel}</span>}
    </div>
  );
}

function RangeTrack({ current, low, high, ariaLabel }: { current: number; low: number; high: number; ariaLabel: string }) {
  const scale = Math.max(high * 1.25, current + 12, 10);
  const lowPct = (low / scale) * 100;
  const highPct = (high / scale) * 100;
  const currentPct = Math.min(100, (current / scale) * 100);
  const inRange = current >= low && current <= high;
  const over = current > high;
  const color = inRange ? "var(--success)" : over ? "var(--coral)" : "var(--macro-protein)";
  const trackClass = `macro-ring-track${inRange ? " in-range" : ""}${over ? " over" : ""}`;
  return (
    <div className={trackClass} role="progressbar" aria-valuenow={Math.round(current)} aria-valuemin={0} aria-valuemax={Math.round(high)} aria-label={ariaLabel}>
      <div className="macro-ring-track-bg" />
      <div className="macro-ring-range" style={{ left: `${lowPct}%`, width: `${Math.max(2, highPct - lowPct)}%` }} />
      <div className="macro-ring-fill" style={{ width: `${currentPct}%`, background: color }} />
      <span className="macro-ring-tick low" style={{ left: `${lowPct}%` }} aria-hidden="true" />
      <span className="macro-ring-tick high" style={{ left: `${highPct}%` }} aria-hidden="true" />
    </div>
  );
}

function SingleTargetTrack({ current, target, ariaLabel }: { current: number; target: number; ariaLabel: string }) {
  const scale = Math.max(target * 1.5, current + 8, 10);
  const targetPct = (target / scale) * 100;
  const currentPct = Math.min(100, (current / scale) * 100);
  const over = current > target;
  const atTarget = Math.abs(current - target) < 0.5;
  const color = atTarget ? "var(--success)" : over ? "var(--coral)" : "var(--macro-fat)";
  return (
    <div className={`macro-ring-track${over ? " over" : ""}${atTarget ? " in-range" : ""}`} role="progressbar" aria-valuenow={Math.round(current)} aria-valuemin={0} aria-valuemax={Math.round(target)} aria-label={ariaLabel}>
      <div className="macro-ring-track-bg" />
      <div className="macro-ring-fill" style={{ width: `${currentPct}%`, background: color }} />
      <span className="macro-ring-target" style={{ left: `${Math.min(98, targetPct)}%` }} aria-hidden="true" />
    </div>
  );
}

function MutedTrack({ share, tone }: { share: number; tone: string }) {
  const color = tone === "protein" ? "var(--macro-protein)" : tone === "fat" ? "var(--macro-fat)" : "var(--macro-carbs)";
  return (
    <div className="macro-ring-track muted" aria-hidden="true">
      <div className="macro-ring-track-bg" />
      <div className="macro-ring-fill" style={{ width: `${Math.min(100, share)}%`, background: color, opacity: 0.9 }} />
    </div>
  );
}

function EmptyTrack() {
  return (
    <div className="macro-ring-track muted empty" aria-hidden="true">
      <div className="macro-ring-track-bg" />
    </div>
  );
}

function macroCalories(label: string, value: number) {
  return value * (label === "Fat" ? 9 : 4);
}
function macroTotal(data: DailyFuelData) {
  return macroCalories("Protein", data.protein) + macroCalories("Carbs", data.carbs) + macroCalories("Fat", data.fat);
}
