"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState, useTransition } from "react";
import { ArrowRightLeft, Check, ChevronLeft, ChevronRight, ClipboardList, Dumbbell, Mic, Pencil, PersonStanding, Plus, RotateCcw, Trash2, UtensilsCrossed, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { DailyFuelCard } from "@/components/daily-fuel-card";
import { MuscleSelect } from "@/components/muscle-select";
import { saveBodyMetric } from "@/lib/actions/body";
import { parseWorkoutText } from "@/lib/actions/ai";
import { confirmMeal, parseMealText } from "@/lib/actions/meal";
import { addExerciseToSession, cancelSession, chooseTemplate, createExerciseAndLogQuickSets, deleteSet, finishSession, logQuickSets, removeExerciseFromSession, replaceSessionExercise, resetExerciseSets, saveSet, saveSets, startSession } from "@/lib/actions/session";
import { getTodayData } from "@/lib/queries/today";
import { calculateBmi, calorieGoalLabel, kgFromUnit, valueInUnit } from "@/lib/metrics";
import type { MealParse, WorkoutParse } from "@/lib/validation";
import { useSpeechInput } from "./speech-input";

type TodayData = Awaited<ReturnType<typeof getTodayData>>;
type ExerciseData = TodayData["exercises"][number];
type LocalSet = {
  id?: string;
  setNumber: number;
  weight: string;
  reps: string;
  completed: boolean;
  saved?: boolean;
};
type ActionResult = { success: boolean; error?: string };
type ExerciseRowHandle = { flushDrafts: () => Promise<ActionResult> };

function sameLocalSet(a: LocalSet, b: LocalSet) {
  return a.id === b.id && a.setNumber === b.setNumber && a.weight === b.weight && a.reps === b.reps && a.completed === b.completed && a.saved === b.saved;
}

export function TodayScreen({ data }: { data: TodayData }) {
  const router = useRouter();
  const [mealOpen, setMealOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [swapExercise, setSwapExercise] = useState<ExerciseData | null>(null);
  const [actionError, setActionError] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedDayRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const exerciseRefs = useRef<Record<string, ExerciseRowHandle | null>>({});
  const selectedTemplate = data.templates.find((template) => template.id === data.selectedTemplateId);
  const isStarted = Boolean(data.session?.startedAt);
  const isComplete = Boolean(data.session?.completedAt);
  const completedSets = data.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.completed).length, 0);
  const totalSets = data.exercises.reduce((total, exercise) => total + (exercise.sets.length || exercise.targetSets || 0), 0);

  useEffect(() => {
    selectedDayRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [data.today]);

  function refreshAfter(action: () => Promise<ActionResult>) {
    setActionError("");
    startTransition(async () => {
      const result = await action();
      if (result.success) router.refresh();
      else setActionError(result.error ?? "That change could not be saved.");
    });
  }

  function finishWorkout() {
    setActionError("");
    startTransition(async () => {
      const draftResults = await Promise.all(Object.values(exerciseRefs.current).filter((ref): ref is ExerciseRowHandle => Boolean(ref)).map((ref) => ref.flushDrafts()));
      const draftError = draftResults.find((result) => !result.success);
      if (draftError) {
        setActionError(draftError.error ?? "The set drafts could not be saved.");
        return;
      }
      const result = await finishSession(data.session!.id);
      if (result.success) router.refresh();
      else setActionError(result.error ?? "The workout could not be completed.");
    });
  }

  function cancelWorkout() {
    if (!data.session || !window.confirm("Cancel this workout? Its logged sets will be discarded.")) return;
    refreshAfter(() => cancelSession(data.session!.id));
  }

  const viewingToday = data.today === data.currentDate;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning!" : hour < 18 ? "Good afternoon!" : "Good evening!";

  function scrollDays(direction: number) {
    stripRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });
  }

  return <>
    <div className="page-intro today-intro">
      <div>
        <p className="greeting-line" suppressHydrationWarning>{viewingToday ? greeting : "Daily log"}</p>
        <h1 className="hero-line">{viewingToday ? "Let's get stronger today." : new Date(`${data.today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h1>
      </div>
    </div>

    <div className="day-strip">
      <button className="strip-chevron" onClick={() => scrollDays(-1)} aria-label="Scroll to earlier days"><ChevronLeft size={16} /></button>
      <div className="streak-strip" role="group" aria-label="Select a logging day" ref={stripRef}>
        {data.days.map((day) => <button
          aria-label={`${day.label}, ${day.dateLabel}${day.complete ? ", workout logged" : ""}${day.today ? ", today" : ""}`}
          aria-pressed={day.date === data.today}
          className={`day-dot${day.complete ? " complete" : ""}${day.today ? " today" : ""}${day.date === data.today ? " selected" : ""}`}
          key={day.date}
          ref={day.date === data.today ? selectedDayRef : undefined}
          onClick={() => router.replace(day.date === data.currentDate ? "/today" : `/today?date=${day.date}`, { scroll: false })}
        >
          {day.complete && <span className="day-dot-log" aria-hidden="true"><Check size={10} strokeWidth={3} /></span>}
          <span className="day-dot-label">{day.label}</span>
          <span className="day-dot-date">{day.dateLabel}</span>
        </button>)}
      </div>
      <button className="strip-chevron" onClick={() => scrollDays(1)} aria-label="Scroll to later days"><ChevronRight size={16} /></button>
    </div>

    <section className="routine-section" aria-labelledby="routine-title">
      <div className="routine-heading">
        <h2 className="routine-title" id="routine-title">Routine</h2>
        <span className="routine-note">Choose your plan for today</span>
      </div>
      <div className="template-row" aria-label="Routine">
        {data.templates.map((template) => <button
          aria-pressed={template.id === data.selectedTemplateId}
          className={`template-option${template.id === data.selectedTemplateId ? " active" : ""}`}
          disabled={pending || isStarted || isComplete}
          key={template.id}
          onClick={() => refreshAfter(() => chooseTemplate({ templateId: template.id, sessionDate: data.today }))}
        >{template.name}</button>)}
      </div>
    </section>

    <WorkoutCapture data={data} />

    <section className="workout-panel">
      <div className="panel-heading">
        <div className="panel-title-group">
          <span className="tile-icon"><Dumbbell size={19} /></span>
          <div>
            <h2 className="panel-title">Workout</h2>
            <p className="workout-subtitle">{selectedTemplate?.name ?? "Choose a routine to get started."}</p>
          </div>
        </div>
        <div className="workout-progress"><strong>{completedSets}</strong> / {totalSets || "-"}<span>sets</span></div>
      </div>

      {actionError && <p className="error-text panel-error" aria-live="polite">{actionError}</p>}

      {data.exercises.length ? isStarted ? <div className="exercise-list">
        {data.exercises.map((exercise) => <ExerciseRow
          data={exercise}
          key={exercise.sessionExerciseId ?? exercise.id}
          ref={(handle) => { exerciseRefs.current[exercise.id] = handle; }}
          onRemove={!isComplete ? () => window.confirm(`Remove ${exercise.name} from this workout? Its logged sets will be deleted.`) && refreshAfter(() => removeExerciseFromSession({ sessionId: data.session!.id, exerciseId: exercise.id })) : undefined}
          onReset={() => refreshAfter(() => resetExerciseSets({ sessionId: data.session!.id, exerciseId: exercise.id }))}
          onSwap={!isComplete ? () => setSwapExercise(exercise) : undefined}
          sessionId={data.session?.id}
          started
          unit={data.profile.preferredUnit}
        />)}
      </div> : <div className="exercise-plan-list" aria-label="Planned exercises">
        {data.exercises.map((exercise, index) => <PrestartExerciseRow data={exercise} index={index} key={exercise.sessionExerciseId ?? exercise.id} />)}
      </div> : <div className="empty-state inverse-empty"><strong>No movements yet.</strong>Add exercises in Library or add them after starting.</div>}

      {isStarted && !isComplete && <button className="add-exercise" onClick={() => setAddExerciseOpen(true)}><Plus size={16} /> Add an exercise</button>}

      {isComplete || isStarted ? <div className="workout-footer">
        <span className="panel-kicker">{isComplete ? "Completed. Set log stays editable." : "Changes save automatically."}</span>
         {isComplete ? <span className="session-complete"><Check size={15} /> Complete</span> : <div className="workout-footer-actions"><button className="button ghost cancel-workout" type="button" disabled={pending} onClick={cancelWorkout}>Cancel</button><button className="button citrus" type="button" disabled={pending} onClick={finishWorkout}>Finish workout</button></div>}
      </div> : <div className="workout-footer prestart">
        <button className="button citrus start-workout" disabled={pending || !selectedTemplate} onClick={() => refreshAfter(() => startSession({ templateId: data.selectedTemplateId!, sessionDate: data.today }))}><Dumbbell size={16} /> Start workout</button>
      </div>}
    </section>

    <section className="panel">
      <div className="quick-grid">
        <button className="quick-card meal-card" onClick={() => setMealOpen(true)}>
          <span className="tile-icon meal"><UtensilsCrossed size={18} /></span>
          <span className="quick-copy"><h3>Log a meal</h3><p>AI-assisted macros estimation for quick logging.</p></span>
          <span className="icon-button"><Plus size={17} /></span>
        </button>
        <button className="quick-card" onClick={() => setBodyOpen(true)}>
          <span className="tile-icon body"><PersonStanding size={18} /></span>
          <span className="quick-copy"><h3>Body check-in</h3><p>Weight required; height and body fat optional.</p></span>
          <span className="icon-button"><Plus size={17} /></span>
        </button>
      </div>
    </section>

    <DailyFuelCard data={data.dailyFuel} targetCalories={data.profile.dailyCalorieGoal} targetLabel={calorieGoalLabel(data.profile.calorieGoal)} subtitle="Confirmed meal estimates for this day." emptyMessage="No meals logged for this day yet. Add one to see your fuel totals." footer="Estimates are for direction, not precision." onLogMeal={() => setMealOpen(true)} />

    {mealOpen && <MealSheet data={data} onClose={() => setMealOpen(false)} />}
    {bodyOpen && <BodySheet data={data} onClose={() => setBodyOpen(false)} />}
    {addExerciseOpen && data.session && <AddExerciseSheet data={data} onClose={() => setAddExerciseOpen(false)} />}
    {swapExercise && <SwapExerciseSheet data={data} exercise={swapExercise} onClose={() => setSwapExercise(null)} />}
  </>;
}

const ExerciseRow = forwardRef<ExerciseRowHandle, { data: ExerciseData; unit: "kg" | "lb"; sessionId?: string; started: boolean; onSwap?: () => void; onReset?: () => void; onRemove?: () => void }>(function ExerciseRow({ data, unit, sessionId, started, onSwap, onReset, onRemove }, ref) {
  const toLocalSet = useCallback((set: ExerciseData["sets"][number]): LocalSet => ({
    id: set.id,
    setNumber: set.setNumber,
    weight: set.weightKg === null ? "" : String(valueInUnit(set.weightKg, unit)?.toFixed(1).replace(/\.0$/, "")),
    reps: set.reps ? String(set.reps) : "",
    completed: set.completed,
    saved: true,
  }), [unit]);

  const [sets, setSets] = useState<LocalSet[]>(() => data.sets.map(toLocalSet));
  const [editingSets, setEditingSets] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState("");
  const [savingCount, setSavingCount] = useState(0);
  const setTrackRef = useRef<HTMLDivElement>(null);
  const setsRef = useRef<LocalSet[]>(sets);
  const editingSetsRef = useRef<Set<number>>(new Set());
  const saveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const pendingSaves = useRef(new Map<number, string>());

  useEffect(() => { setsRef.current = sets; }, [sets]);

  useEffect(() => () => {
    saveTimers.current.forEach((timer) => clearTimeout(timer));
  }, []);

  // Server data refreshes in the background after every save. Merge it into
  // local state instead of replacing it, so a set the user is still editing
  // is never reset to its last saved (often blank) values.
  const [prevServerSets, setPrevServerSets] = useState(data.sets);
  if (prevServerSets !== data.sets) {
    setPrevServerSets(data.sets);
    setSets((current) => {
      const serverSets = data.sets.map(toLocalSet);
      const merged = serverSets.map((serverSet) => {
        const local = current.find((set) => set.setNumber === serverSet.setNumber);
        return local && !local.saved ? local : serverSet;
      });
      for (const local of current) {
        if (!local.saved && !serverSets.some((serverSet) => serverSet.setNumber === local.setNumber)) merged.push(local);
      }
      merged.sort((a, b) => a.setNumber - b.setNumber);
      const unchanged = current.length === merged.length && current.every((set, index) => sameLocalSet(set, merged[index]));
      return unchanged ? current : merged;
    });
  }

  const toPayload = useCallback((set: LocalSet) => {
    const weight = set.weight === "" ? null : Number(set.weight);
    const reps = set.reps === "" || set.reps === "0" ? null : Number(set.reps);
    if ((weight !== null && !Number.isFinite(weight)) || (reps !== null && !Number.isInteger(reps))) return null;
    return { exerciseId: data.id, setNumber: set.setNumber, weight, reps, unit, completed: set.completed && reps !== null };
  }, [data.id, unit]);

  // A set is only marked saved when nothing was typed after the save that
  // the server just acknowledged, so newer keystrokes always stay dirty.
  const acknowledge = useCallback((setNumber: number, serialized: string) => {
    if (pendingSaves.current.get(setNumber) !== serialized) return;
    pendingSaves.current.delete(setNumber);
    setSets((current) => current.map((set) => (set.setNumber === setNumber ? { ...set, saved: true } : set)));
  }, []);

  const persistSet = useCallback(async (set: LocalSet) => {
    if (!sessionId) return;
    const payload = toPayload(set);
    if (!payload) {
      setError("Use a valid weight and whole-number reps, or delete the set.");
      return;
    }
    setError("");
    const serialized = JSON.stringify(payload);
    pendingSaves.current.set(set.setNumber, serialized);
    setSavingCount((count) => count + 1);
    const result = await saveSet({ sessionId, ...payload });
    setSavingCount((count) => Math.max(0, count - 1));
    if (result.success) acknowledge(set.setNumber, serialized);
    else setError(result.error ?? "This set could not be saved.");
  }, [sessionId, toPayload, acknowledge]);

  const scheduleSave = useCallback((setNumber: number) => {
    if (!sessionId) return;
    const existing = saveTimers.current.get(setNumber);
    if (existing) clearTimeout(existing);
    saveTimers.current.set(setNumber, setTimeout(() => {
      saveTimers.current.delete(setNumber);
      const draft = setsRef.current.find((set) => set.setNumber === setNumber);
      if (draft && !draft.saved) void persistSet(draft);
    }, 450));
  }, [sessionId, persistSet]);

  const updateSet = useCallback((setNumber: number, patch: Partial<LocalSet>) => {
    const existing = setsRef.current.find((set) => set.setNumber === setNumber);
    if (!existing) return;
    const next = { ...existing, ...patch, ...(editingSetsRef.current.has(setNumber) && existing.completed && !("completed" in patch) ? { completed: false } : {}) };
    if (next.weight === existing.weight && next.reps === existing.reps && next.completed === existing.completed) return;
    setError("");
    pendingSaves.current.delete(setNumber);
    setSets((current) => current.map((set) => (set.setNumber === setNumber ? { ...next, saved: false } : set)));
    scheduleSave(setNumber);
  }, [scheduleSave]);

  const editSet = useCallback((setNumber: number) => {
    editingSetsRef.current = new Set(editingSetsRef.current).add(setNumber);
    setEditingSets(editingSetsRef.current);
  }, []);

  const logSet = useCallback((set: LocalSet) => {
    const timer = saveTimers.current.get(set.setNumber);
    if (timer) {
      clearTimeout(timer);
      saveTimers.current.delete(set.setNumber);
    }
    const next = { ...set, completed: true, saved: false };
    const payload = toPayload(next);
    if (!payload || payload.reps === null) {
      setError("Enter a valid whole-number rep count before logging this set.");
      return;
    }
    setError("");
    pendingSaves.current.delete(set.setNumber);
    setSets((current) => current.map((item) => (item.setNumber === set.setNumber ? next : item)));
    const nextEditing = new Set(editingSetsRef.current);
    nextEditing.delete(set.setNumber);
    editingSetsRef.current = nextEditing;
    setEditingSets(nextEditing);
    void persistSet(next);
  }, [persistSet, toPayload]);

  const removeSet = useCallback((set: LocalSet) => {
    if (!sessionId) return;
    setError("");
    saveTimers.current.forEach((timer) => clearTimeout(timer));
    saveTimers.current.clear();
    pendingSaves.current.clear();
    setSavingCount((count) => count + 1);
    void (async () => {
      const result = await deleteSet({ sessionId, exerciseId: data.id, setNumber: set.setNumber });
      setSavingCount((count) => Math.max(0, count - 1));
      if (result.success) {
        const next = setsRef.current
          .filter((item) => item.setNumber !== set.setNumber)
          .map((item) => (item.setNumber > set.setNumber ? { ...item, setNumber: item.setNumber - 1 } : item));
        setSets(next);
        setsRef.current = next;
        const nextEditing = new Set<number>();
        editingSetsRef.current.forEach((setNumber) => {
          if (setNumber < set.setNumber) nextEditing.add(setNumber);
          if (setNumber > set.setNumber) nextEditing.add(setNumber - 1);
        });
        editingSetsRef.current = nextEditing;
        setEditingSets(nextEditing);
        for (const item of next) if (!item.saved) scheduleSave(item.setNumber);
      } else setError(result.error ?? "This set could not be deleted.");
    })();
  }, [sessionId, data.id, scheduleSave]);

  useImperativeHandle(ref, () => ({
    async flushDrafts() {
      if (!sessionId) return { success: true };
      saveTimers.current.forEach((timer) => clearTimeout(timer));
      saveTimers.current.clear();
      const drafts = setsRef.current;
      const payloads = drafts.map(toPayload);
      if (payloads.some((payload) => payload === null)) {
        setError("Use valid numbers in every set, or delete the incomplete set before finishing.");
        return { success: false, error: "Use valid numbers in every set, or delete the incomplete set before finishing." };
      }
      const valid = payloads.filter((payload): payload is NonNullable<typeof payload> => payload !== null);
      const sent = valid.map((payload) => ({ setNumber: payload.setNumber, serialized: JSON.stringify(payload) }));
      for (const { setNumber, serialized } of sent) pendingSaves.current.set(setNumber, serialized);
      setSavingCount((count) => count + 1);
      const result = await saveSets({ sessionId, sets: valid });
      setSavingCount((count) => Math.max(0, count - 1));
      if (result.success) for (const { setNumber, serialized } of sent) acknowledge(setNumber, serialized);
      else setError(result.error ?? "The set drafts could not be saved.");
      return result;
    },
  }), [sessionId, toPayload, acknowledge]);

  function addSet() {
    const current = setsRef.current;
    const setNumber = Math.max(0, ...current.map((set) => set.setNumber)) + 1;
    setSets([...current, { setNumber, weight: "", reps: "", completed: false, saved: false }]);
    requestAnimationFrame(() => setTrackRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  const saving = savingCount > 0;
  const previousBest = valueInUnit(data.personalBestWeightKg, unit);
  const currentBest = Math.max(...sets.filter((set) => set.completed).map((set) => Number(set.weight)).filter(Number.isFinite), 0);
  const prSetNumber = previousBest !== null && currentBest > previousBest
    ? sets.find((set) => set.completed && Number(set.weight) === currentBest)?.setNumber ?? null
    : null;

  return <div className="exercise-row">
    <div className="exercise-heading">
      <div>
        <div className="exercise-name">{data.name}</div>
        <div className="exercise-muscle">{data.primaryMuscle}{data.targetReps ? ` · ${data.targetSets ?? ""} × ${data.targetReps}` : ""}</div>
      </div>
       <div className="exercise-actions">
         {data.lastSession.length > 0 && <div className="last-reference">Last <strong>{data.lastSession.map((set) => `${set.weightKg ? valueInUnit(set.weightKg, unit)?.toFixed(0) : "-"}${set.weightKg ? unit : ""} x ${set.reps ?? "-"}`).join(", ")}</strong></div>}
         <div className="exercise-action-buttons">
           {onReset && <button className="exercise-action icon-only-action" onClick={onReset} title="Reset this exercise's sets" aria-label={`Reset ${data.name} sets`}><RotateCcw size={14} /></button>}
            {onSwap && <button className="exercise-action icon-only-action" onClick={onSwap} title="Swap exercise" aria-label={`Swap ${data.name}`}><ArrowRightLeft size={14} /></button>}
           {onRemove && <button className="exercise-action remove-action icon-only-action" onClick={onRemove} title="Remove this exercise" aria-label={`Remove ${data.name}`}><Trash2 size={14} /></button>}
         </div>
       </div>
      </div>
      {started ? <>
        <div className="set-table-header" aria-hidden="true">
          <span>Set</span>
          <div className="set-table-value-head"><span>Weight ({unit})</span><span>Reps</span></div>
        </div>
        <div className="set-track" aria-label={`${data.name} sets`} ref={setTrackRef}>
      {sets.map((set) => <SetRow
           isEditing={editingSets.has(set.setNumber)}
           isPr={set.setNumber === prSetNumber}
           key={set.setNumber}
           onDelete={removeSet}
           onEdit={editSet}
           onLog={logSet}
           onPatch={updateSet}
           saving={saving}
           set={set}
           unit={unit}
        />)}
       </div>
       {error && <p className="error-text set-error" aria-live="polite">{error}</p>}
       <button className="add-set" onClick={addSet}><Plus size={13} /> Add set</button>
     </> : <p className="panel-kicker">Start the workout to log sets. The plan can still change after starting.</p>}
   </div>;
});

const SetRow = memo(function SetRow({ set, unit, saving, isPr, isEditing, onPatch, onEdit, onLog, onDelete }: {
  set: LocalSet;
  unit: "kg" | "lb";
  saving: boolean;
  isPr: boolean;
  isEditing: boolean;
  onPatch: (setNumber: number, patch: Partial<LocalSet>) => void;
  onEdit: (setNumber: number) => void;
  onLog: (set: LocalSet) => void;
  onDelete: (set: LocalSet) => void;
}) {
  const logged = set.completed && !isEditing;
  const editable = !logged;
  return <div className={`set-row${logged ? " completed" : ""}${isEditing ? " editing" : ""}`}>
    <div className="set-row-number"><strong>{set.setNumber}</strong></div>
    <div className="set-row-values">
      <AdjustableNumber label="Weight" value={set.weight} step={unit === "lb" ? 5 : 2.5} inputMode="decimal" disabled={!editable} onChange={(value) => onPatch(set.setNumber, { weight: value })} />
      <AdjustableNumber label="Reps" value={set.reps} step={1} inputMode="numeric" disabled={!editable} onChange={(value) => onPatch(set.setNumber, { reps: value })} />
    </div>
    <div className="set-row-actions">
      {logged ? <button className="set-edit" type="button" onClick={() => onEdit(set.setNumber)}><Pencil size={13} /></button> : <button className="set-log" type="button" disabled={saving} onClick={() => onLog(set)}><Check size={15} /></button>}
      <button className="set-delete" type="button" onClick={() => onDelete(set)} aria-label={`Delete set ${set.setNumber}`} title="Delete set"><Trash2 size={16} /></button>
    </div>
    <span className={isPr ? "pr-note" : "save-state"} title={isPr ? "Heaviest completed set compared with previous sessions" : undefined}>{isPr ? "Weight PR" : !set.saved && saving ? "Saving" : !set.saved ? "Unsaved" : ""}</span>
  </div>;
});

function PrestartExerciseRow({ data, index }: { data: ExerciseData; index: number }) {
  return <article className="exercise-plan-row">
    <span className="exercise-plan-index">{String(index + 1).padStart(2, "0")}</span>
    <span className="exercise-plan-copy">
      <span className="exercise-name">{data.name}</span>
      <span className="exercise-muscle">{data.primaryMuscle}</span>
    </span>
    <span className="exercise-plan-target">{data.targetSets ?? "-"} sets <span>×</span> {data.targetReps ?? "-"} reps</span>
    <ChevronRight className="exercise-plan-chevron" size={17} />
  </article>;
}

function AdjustableNumber({ label, value, step, inputMode, disabled = false, onChange }: { label: string; value: string; step: number; inputMode: "decimal" | "numeric"; disabled?: boolean; onChange: (value: string) => void }) {
  const drag = useRef<{ startX: number; startValue: number; lastValue: string; moved: boolean } | null>(null);

  function formatValue(next: number) {
    return String(Number.isInteger(next) ? next : Number(next.toFixed(2)));
  }

  function adjust(direction: number) {
    if (disabled) return;
    const numericValue = Number(value);
    const next = Math.max(0, (Number.isFinite(numericValue) ? numericValue : 0) + direction * step);
    onChange(formatValue(next));
  }

  function beginDrag(event: React.PointerEvent<HTMLInputElement>) {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    const numericValue = Number(value);
    drag.current = { startX: event.clientX, startValue: Number.isFinite(numericValue) ? numericValue : 0, lastValue: value, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLInputElement>) {
    if (!drag.current) return;
    const change = Math.round((event.clientX - drag.current.startX) / 18);
    if (change === 0) return;
    event.preventDefault();
    drag.current.moved = true;
    const next = Math.max(0, drag.current.startValue + change * step);
    const nextValue = formatValue(next);
    if (nextValue !== drag.current.lastValue) {
      drag.current.lastValue = nextValue;
      onChange(nextValue);
    }
  }

  function endDrag() {
    if (!drag.current) return;
    const current = drag.current;
    drag.current = null;
    if (current.moved) onChange(current.lastValue);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    adjust(event.key === "ArrowRight" ? 1 : -1);
  }

  return <label className={`adjustable-number${disabled ? " disabled" : ""}`} title={`${disabled ? "Edit" : "Click to type, use the buttons, or swipe left and right to adjust"} ${label.toLowerCase()}`}>
    <span className="number-control">
      <button className="number-stepper" type="button" disabled={disabled} onClick={() => adjust(-1)} aria-label={`Decrease ${label.toLowerCase()}`}>
        <span aria-hidden="true">−</span>
      </button>
      <input className="number-field" type="text" inputMode={inputMode} disabled={disabled} aria-label={label} value={value} placeholder="-" onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
      <button className="number-stepper" type="button" disabled={disabled} onClick={() => adjust(1)} aria-label={`Increase ${label.toLowerCase()}`}>
        <span aria-hidden="true">+</span>
      </button>
    </span>
  </label>;
}

function SwapExerciseSheet({ data, exercise, onClose }: { data: TodayData; exercise: ExerciseData; onClose: () => void }) {
  const router = useRouter();
  const available = data.library.filter((item) => item.id !== exercise.id && !data.exercises.some((current) => current.id === item.id));
  const [exerciseId, setExerciseId] = useState(available[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function swap() {
    if (!data.session || !exerciseId) return;
    setError("");
    startTransition(async () => {
      const result = await replaceSessionExercise({
        sessionExerciseId: exercise.sessionExerciseId ?? undefined,
        sessionId: data.session.id,
        oldExerciseId: exercise.id,
        exerciseId,
      });
      if (result.success) {
        router.refresh();
        onClose();
      } else setError(result.error ?? "This exercise could not be swapped.");
    });
  }

  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="swap-title">
    <div className="sheet compact-sheet">
       <div className="sheet-heading"><div><h2 className="sheet-title" id="swap-title">Swap {exercise.name}</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
       {available.length ? <><p className="notice">The template stays unchanged. Only blank sets move to the replacement.</p><label className="form-group sheet-field"><span className="form-label">Replacement</span><select className="select-field" value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{available.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.primaryMuscle}</option>)}</select></label>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button" disabled={pending} onClick={swap}>{pending ? "Swapping..." : "Swap exercise"}</button></div></> : <><div className="empty-state"><strong>No unused exercises available.</strong>Add an exercise in Library first, or keep the movements already in this workout.</div><div className="sheet-actions"><button className="button" onClick={onClose}>Close</button></div></>}
    </div>
  </div>;
}

function AddExerciseSheet({ data, onClose }: { data: TodayData; onClose: () => void }) {
  const router = useRouter();
  const available = data.library.filter((item) => !data.exercises.some((current) => current.id === item.id));
  const [exerciseId, setExerciseId] = useState(available[0]?.id ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    if (!data.session || !exerciseId) return;
    setError("");
    startTransition(async () => {
      const result = await addExerciseToSession({ sessionId: data.session!.id, exerciseId });
      if (result.success) {
        router.refresh();
        onClose();
      } else setError(result.error ?? "This exercise could not be added.");
    });
  }

  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-exercise-title">
    <div className="sheet compact-sheet">
       <div className="sheet-heading"><div><h2 className="sheet-title" id="add-exercise-title">Add an exercise</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
       {available.length ? <><p className="notice">Added to this workout only with three empty sets.</p><label className="form-group sheet-field"><span className="form-label">Exercise</span><select className="select-field" value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{available.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.primaryMuscle}</option>)}</select></label>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button" disabled={pending} onClick={add}>{pending ? "Adding..." : "Add exercise"}</button></div></> : <><div className="empty-state"><strong>Everything in your library is already in this workout.</strong>Use Library to create another movement.</div><div className="sheet-actions"><button className="button" onClick={onClose}>Close</button></div></>}
    </div>
  </div>;
}

function WorkoutCapture({ data }: { data: TodayData }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<WorkoutParse | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const captureInputRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeechInput(setText);

  useEffect(() => {
    const input = captureInputRef.current;
    if (!input) return;
    input.style.height = "52px";
    if (text.includes("\n")) input.style.height = `${Math.min(input.scrollHeight, 240)}px`;
  }, [text]);

  function parse() {
    setError("");
    startTransition(async () => {
      const result = await parseWorkoutText(text);
      if (result.success) setParsed(result.data);
      else setError(result.error);
    });
  }

  function clear() {
    setText("");
    setParsed(null);
    setError("");
  }

  function confirm() {
    if (!parsed || !data.selectedTemplateId) {
      setError("Choose a workout template before logging sets.");
      return;
    }
    setError("");
    startTransition(async () => {
      let sessionId = data.session?.id;
      if (!data.session?.startedAt) {
        const started = await startSession({ templateId: data.selectedTemplateId!, sessionDate: data.today });
        if (!started.success) {
          setError(started.error ?? "The workout could not be started.");
          return;
        }
        sessionId = started.sessionId;
      }
      if (!sessionId) {
        setError("The workout could not be started.");
        return;
      }
      for (const parsedExercise of parsed.exercises) {
        const mapped = data.library.find((exercise) => exercise.name.toLowerCase() === parsedExercise.name.toLowerCase());
        const saved = mapped ? await logQuickSets({
          sessionId,
          exerciseId: mapped.id,
          defaultUnit: data.profile.preferredUnit,
          sets: parsedExercise.sets.map((set) => ({ ...set, unit: set.unit ?? undefined })),
        }) : await createExerciseAndLogQuickSets({
          sessionId,
          name: parsedExercise.name,
          primaryMuscle: parsedExercise.primaryMuscle,
          defaultUnit: data.profile.preferredUnit,
          sets: parsedExercise.sets.map((set) => ({ ...set, unit: set.unit ?? undefined })),
        });
        if (!saved.success) {
          setError(saved.error ?? "One or more sets could not be saved.");
          return;
        }
      }
      router.refresh();
      setText("");
      setParsed(null);
    });
  }

  return <section className={`capture-hero${parsed ? " capture-review" : ""}`} aria-labelledby="capture-title">
    <div className="capture-heading">
      <span className="tile-icon"><ClipboardList size={19} /></span>
      <div className="capture-copy">
        <h2 className="capture-title" id="capture-title">Log a workout</h2>
        <p className="capture-subtitle">Describe your workout, AI will log it for you.</p>
      </div>
    </div>
    {!parsed ? <>
        <div className="parse-box capture-box"><textarea ref={captureInputRef} className={`field capture-field${text.includes("\n") ? " multiline" : ""}`} rows={1} placeholder="Bench press, 3 sets of 8 reps, 85kg" value={text} onChange={(event) => setText(event.target.value)} /><button className={`mic-button capture-mic${speech.listening ? " listening" : ""}`} onClick={speech.toggle} aria-label={speech.supported ? "Use microphone" : "Speech input unsupported"} disabled={!speech.supported}><Mic size={18} /></button></div>
        {speech.error && <p className="error-text">{speech.error}</p>}
        {!speech.supported && <p className="status-text">Voice input is unavailable in this browser. Text entry still works.</p>}
        {error && <p className="error-text" aria-live="polite">{error}</p>}
        <div className="capture-actions"><button className="button capture-submit" disabled={pending || !text.trim()} onClick={parse}>{pending ? "Reading note..." : "Confirm"}</button><button className="button ghost capture-clear" onClick={clear}>Clear</button></div>
      </> : <>
        <p className="capture-review-note">Review the exercises and numbers before saving. New movements are added to this workout, not the template.</p>
        {error && <p className="error-text" aria-live="polite">{error}</p>}
        <div className="review-table">
           <datalist id="exercise-library-options">{data.library.map((option) => <option value={option.name} key={option.id} />)}</datalist>
           {parsed.exercises.map((exercise, exerciseIndex) => <div className="review-exercise" key={exerciseIndex}>
             <label className="form-group"><span className="form-label">Exercise name</span><input className="field" list="exercise-library-options" value={exercise.name} onChange={(event) => setParsed({ ...parsed, exercises: parsed.exercises.map((item, index) => index === exerciseIndex ? { ...item, name: event.target.value } : item) })} /></label>
             {!data.library.some((option) => option.name.toLowerCase() === exercise.name.toLowerCase()) && <label className="form-group sheet-field"><span className="form-label">Target muscle</span><MuscleSelect value={exercise.primaryMuscle} onChange={(value) => setParsed({ ...parsed, exercises: parsed.exercises.map((item, index) => index === exerciseIndex ? { ...item, primaryMuscle: value } : item) })} /></label>}
            {exercise.sets.map((set, setIndex) => <div className="review-row" key={setIndex}>
              <span className="set-number">{setIndex + 1}</span>
              <input className="field tiny-field" type="number" inputMode="decimal" aria-label={`Set ${setIndex + 1} weight`} placeholder="weight" value={set.weight ?? ""} onChange={(event) => setParsed({ ...parsed, exercises: parsed.exercises.map((item, index) => index === exerciseIndex ? { ...item, sets: item.sets.map((current, innerIndex) => innerIndex === setIndex ? { ...current, weight: event.target.value === "" ? null : Number(event.target.value) } : current) } : item) })} />
              <input className="field tiny-field" type="number" inputMode="numeric" aria-label={`Set ${setIndex + 1} reps`} placeholder="reps" value={set.reps ?? ""} onChange={(event) => setParsed({ ...parsed, exercises: parsed.exercises.map((item, index) => index === exerciseIndex ? { ...item, sets: item.sets.map((current, innerIndex) => innerIndex === setIndex ? { ...current, reps: event.target.value === "" ? null : Number(event.target.value) } : current) } : item) })} />
              <span className="unit-label">{set.unit ?? data.profile.preferredUnit}</span>
            </div>)}
           </div>)}
         </div>
        <div className="capture-actions"><button className="button capture-submit" disabled={pending} onClick={confirm}>{pending ? "Saving..." : "Confirm"}</button><button className="button ghost capture-clear" onClick={clear}>Clear</button></div>
       </>}
  </section>;
}

function MealSheet({ data, onClose }: { data: TodayData; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<MealParse | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const speech = useSpeechInput(setText);
  function parse() { setError(""); startTransition(async () => { const result = await parseMealText(text); if (result.success) setParsed(result.data); else setError(result.error); }); }
  function confirm() { if (!parsed) return; startTransition(async () => { const result = await confirmMeal({ ...parsed, rawInput: text, mealDate: data.today }); if (result.success) { router.refresh(); onClose(); } else setError(result.error); }); }
   return <div className="sheet-backdrop centered-sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="meal-title"><div className="sheet centered-sheet"><div className="sheet-heading"><div><h2 className="sheet-title" id="meal-title">Log a meal</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>{!parsed ? <><div className="parse-box"><textarea className="field" placeholder="e.g. chicken bowl with rice and vegetables" value={text} onChange={(event) => setText(event.target.value)} /><button className={`icon-button mic-button${speech.listening ? " listening" : ""}`} onClick={speech.toggle} disabled={!speech.supported} aria-label="Use microphone"><Mic size={17} /></button></div>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button" onClick={parse} disabled={pending || !text.trim()}>{pending ? "Estimating..." : "Review estimate"}</button></div></> : <><div className="notice">Nutrition values are estimates. Adjust them before saving.</div><div className="macro-grid">{(["calories", "protein", "carbs", "fat"] as const).map((key) => <label className="macro-box" key={key}><span className="macro-label">{key === "calories" ? "kcal" : key}</span><input className="field tiny-field" type="number" value={parsed[key]} onChange={(event) => setParsed({ ...parsed, [key]: Number(event.target.value) })} /></label>)}</div><p className="status-text">{parsed.summary}</p>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={() => setParsed(null)}>Back</button><button className="button" disabled={pending} onClick={confirm}>{pending ? "Saving..." : "Confirm meal"}</button></div></>}</div></div>;
}

function BodySheet({ data, onClose }: { data: TodayData; onClose: () => void }) {
  const router = useRouter();
  const [unit, setUnit] = useState<"kg" | "lb">(data.profile.preferredUnit);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState(data.profile.heightCm ? String(data.profile.heightCm) : "");
  const [bodyFat, setBodyFat] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const bmi = calculateBmi(kgFromUnit(Number(weight), unit) ?? 0, Number(height) || null);
  function submit() { startTransition(async () => { const result = await saveBodyMetric({ metricDate: data.today, weight: Number(weight), unit, heightCm: height ? Number(height) : null, bodyFatPercent: bodyFat ? Number(bodyFat) : null }); if (result.success) { router.refresh(); onClose(); } else setError(result.error); }); }
   return <div className="sheet-backdrop centered-sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="body-title"><div className="sheet centered-sheet"><div className="sheet-heading"><div><h2 className="sheet-title" id="body-title">Body check-in</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div><div className="form-grid"><label className="form-group"><span className="form-label">Weight</span><div className="unit-input"><input className="field" type="number" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="72.5" /><select className="select-field" value={unit} onChange={(event) => setUnit(event.target.value as "kg" | "lb")}><option>kg</option><option>lb</option></select></div></label><label className="form-group"><span className="form-label">Height (cm)</span><input className="field" type="number" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="180" /></label><label className="form-group"><span className="form-label">Body fat % (optional)</span><input className="field" type="number" value={bodyFat} onChange={(event) => setBodyFat(event.target.value)} placeholder="18" /></label></div>{bmi ? <p className="notice spaced-notice">BMI: <strong>{bmi.toFixed(1)}</strong> based on the height entered today.</p> : <p className="status-text spaced-notice">Enter height to calculate BMI. Saved height is prefilled when available.</p>}{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button" disabled={pending || !weight} onClick={submit}>{pending ? "Saving..." : "Save check-in"}</button></div></div></div>;
}
