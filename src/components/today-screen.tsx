"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRightLeft, Check, ChevronDown, ChevronRight, Dumbbell, Droplet, Flame, Link2, Mic, Pencil, PersonStanding, Plus, RotateCcw, Sparkle, Trash2, UtensilsCrossed, Wheat, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { DailyFuelCard } from "@/components/daily-fuel-card";
import { MuscleSelect } from "@/components/muscle-select";
import { saveBodyMetric } from "@/lib/actions/body";
import { askExerciseQuestion, generateExerciseGuidance, parseWorkoutText } from "@/lib/actions/ai";
import { confirmMeal, deleteMeal, parseMealText } from "@/lib/actions/meal";
import { addExerciseToSession, cancelSession, chooseTemplate, createExerciseAndLogQuickSets, deleteSet, finishSession, logQuickSets, removeExerciseFromSession, replaceSessionExercise, resetExerciseSets, saveSet, saveSets, startSession } from "@/lib/actions/session";
import { getTodayData } from "@/lib/queries/today";
import { matchReusableMeals, type ReusableMeal } from "@/lib/meal-text";
import { calculateBmi, calorieGoalLabel, firstName, kgFromUnit, shortWorkoutName, valueInUnit } from "@/lib/metrics";
import type { ExerciseAnswer, ExerciseGuidance, MealParse, WorkoutParse } from "@/lib/validation";
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

const DRAFT_STORAGE_PREFIX = "simple-fitness-set-drafts:";

function readDraftMap(sessionId: string): Record<string, LocalSet[]> {
  try {
    const raw = window.localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${sessionId}`);
    return raw ? JSON.parse(raw) as Record<string, LocalSet[]> : {};
  } catch { return {}; }
}

function writeDraftMap(sessionId: string, exerciseId: string, sets: LocalSet[]) {
  try {
    const map = readDraftMap(sessionId);
    if (sets.length) map[exerciseId] = sets;
    else delete map[exerciseId];
    window.localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${sessionId}`, JSON.stringify(map));
  } catch { /* storage unavailable */ }
}

function clearExerciseDrafts(sessionId: string, exerciseId: string) {
  try {
    const map = readDraftMap(sessionId);
    delete map[exerciseId];
    window.localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${sessionId}`, JSON.stringify(map));
  } catch { /* storage unavailable */ }
}

function clearSessionDrafts(sessionId: string) {
  try { window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${sessionId}`); } catch { /* storage unavailable */ }
}

function sameServerSets(a: ExerciseData["sets"], b: ExerciseData["sets"]) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left.id !== right.id || left.setNumber !== right.setNumber || left.weightKg !== right.weightKg || left.reps !== right.reps || left.completed !== right.completed) return false;
  }
  return true;
}

export function TodayScreen({ data }: { data: TodayData }) {
  const router = useRouter();
  const [mealOpen, setMealOpen] = useState(false);
  const [mealDetailsOpen, setMealDetailsOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [swapExercise, setSwapExercise] = useState<ExerciseData | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseData | null>(null);
  const [workoutPickerOpen, setWorkoutPickerOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedDayRef = useRef<HTMLButtonElement>(null);
  const exerciseRefs = useRef<Record<string, ExerciseRowHandle | null>>({});
  const selectedTemplate = data.templates.find((template) => template.id === data.selectedTemplateId);
  const isStarted = Boolean(data.session?.startedAt);
  const isComplete = Boolean(data.session?.completedAt);
  const locked = isStarted || isComplete;
  const [exerciseStats, setExerciseStats] = useState<Record<string, { completed: number; total: number }>>(() => {
    const stats: Record<string, { completed: number; total: number }> = {};
    for (const exercise of data.exercises) stats[exercise.id] = { completed: exercise.sets.filter((set) => set.completed).length, total: exercise.sets.length || exercise.targetSets || 0 };
    return stats;
  });
  const completedSets = Object.values(exerciseStats).reduce((total, entry) => total + entry.completed, 0);
  const totalSets = Object.values(exerciseStats).reduce((total, entry) => total + entry.total, 0);

  const reportStats = useCallback((exerciseId: string, completed: number, total: number) => {
    setExerciseStats((previous) => {
      const current = previous[exerciseId];
      if (current && current.completed === completed && current.total === total) return previous;
      return { ...previous, [exerciseId]: { completed, total } };
    });
  }, []);

  useEffect(() => {
    selectedDayRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [data.today]);

  // When the exercise list changes (add, remove, swap, finish), drop stats
  // for removed exercises and seed fresh ones for new rows.
  const [prevExercises, setPrevExercises] = useState(data.exercises);
  if (prevExercises !== data.exercises) {
    setPrevExercises(data.exercises);
    setExerciseStats((previous) => {
      const next: Record<string, { completed: number; total: number }> = {};
      for (const exercise of data.exercises) next[exercise.id] = previous[exercise.id] ?? { completed: exercise.sets.filter((set) => set.completed).length, total: exercise.sets.length || exercise.targetSets || 0 };
      return next;
    });
  }

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
    clearSessionDrafts(data.session.id);
    refreshAfter(() => cancelSession(data.session!.id));
  }

  const viewingToday = data.today === data.currentDate;
  const personName = firstName(data.profile.displayName);
  const shortName = selectedTemplate ? shortWorkoutName(selectedTemplate.name) || selectedTemplate.name : "Rest";
  const longDateLabel = new Date(`${data.today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  function switchDay(date: string) {
    startTransition(async () => {
      await Promise.all(Object.values(exerciseRefs.current).filter((ref): ref is ExerciseRowHandle => Boolean(ref)).map((ref) => ref.flushDrafts().catch(() => ({ success: false }))));
      router.replace(date === data.currentDate ? "/today" : `/today?date=${date}`, { scroll: false });
    });
  }

  return <>
    <div className="page-intro today-intro">
      <div>
        <h1 className="hero-line">Hi {personName}, it&apos;s <button type="button" className="hero-workout-picker" aria-label={`Change workout, currently ${selectedTemplate?.name ?? "Rest day"}`} aria-haspopup="dialog" aria-expanded={workoutPickerOpen} onClick={() => setWorkoutPickerOpen(true)}><span className="hero-workout-name">{shortName}</span><ChevronDown size={13} aria-hidden="true" className="hero-workout-chevron" /></button> day.</h1>
        {!viewingToday && <p className="hero-date-subline">{longDateLabel}</p>}
      </div>
    </div>

    <div className="day-strip">
      <div className="streak-strip" role="group" aria-label="Select a logging day">
        {data.days.map((day) => <button
          aria-label={`${day.label}, ${day.dateLabel}${day.complete ? ", workout logged" : ""}${day.today ? ", today" : ""}`}
          aria-pressed={day.date === data.today}
          className={`day-dot${day.complete ? " complete" : ""}${day.today ? " today" : ""}${day.date === data.today ? " selected" : ""}`}
          key={day.date}
          ref={day.date === data.today ? selectedDayRef : undefined}
          onClick={() => switchDay(day.date)}
        >
          {day.complete && <span className="day-dot-log" aria-hidden="true"><Check size={10} strokeWidth={3} /></span>}
          <span className="day-dot-label">{day.label}</span>
          <span className="day-dot-date">{day.dateLabel}</span>
        </button>)}
      </div>
    </div>

    <section className="panel quick-actions-panel" aria-label="Quick actions">
      <div className="quick-grid">
        <button className="quick-card meal-card" onClick={() => setMealOpen(true)}>
          <span className="tile-icon meal"><UtensilsCrossed size={18} /></span>
          <span className="quick-copy"><h3>Log a meal</h3></span>
          <span className="icon-button"><Plus size={17} /></span>
        </button>
        <button className="quick-card" onClick={() => setBodyOpen(true)}>
          <span className="tile-icon body"><PersonStanding size={18} /></span>
          <span className="quick-copy"><h3>Body check-in</h3></span>
          <span className="icon-button"><Plus size={17} /></span>
        </button>
      </div>
    </section>

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
          onOpenDetails={() => setSelectedExercise(exercise)}
          onRemove={!isComplete ? () => { if (!window.confirm(`Remove ${exercise.name} from this workout? Its logged sets will be deleted.`)) return; if (data.session) clearExerciseDrafts(data.session.id, exercise.id); refreshAfter(() => removeExerciseFromSession({ sessionId: data.session!.id, exerciseId: exercise.id })); } : undefined}
          onReset={() => refreshAfter(() => resetExerciseSets({ sessionId: data.session!.id, exerciseId: exercise.id }))}
          onSwap={!isComplete ? () => setSwapExercise(exercise) : undefined}
          onStatsChange={reportStats}
          sessionId={data.session?.id}
          started
          unit={data.profile.preferredUnit}
        />)}
      </div> : <div className="exercise-plan-list" aria-label="Planned exercises">
        {data.exercises.map((exercise, index) => <PrestartExerciseRow data={exercise} index={index} key={exercise.sessionExerciseId ?? exercise.id} onOpenDetails={() => setSelectedExercise(exercise)} />)}
      </div> : <div className="empty-state inverse-empty"><strong>No movements yet.</strong>Add exercises in Library or add them after starting.</div>}

      {isStarted && !isComplete && <button className="add-exercise" onClick={() => setAddExerciseOpen(true)}><Plus size={16} /> Add an exercise</button>}

      {isComplete || isStarted ? <div className="workout-footer">
        <span className="panel-kicker">{isComplete ? "Completed. Set log stays editable." : "Changes save automatically."}</span>
         {isComplete ? <span className="session-complete"><Check size={15} /> Complete</span> : <div className="workout-footer-actions"><button className="button ghost cancel-workout" type="button" disabled={pending} onClick={cancelWorkout}>Cancel</button><button className="button citrus" type="button" disabled={pending} onClick={finishWorkout}>Finish workout</button></div>}
      </div> : <div className="workout-footer prestart">
        <button className="button citrus start-workout" disabled={pending || !selectedTemplate} onClick={() => refreshAfter(() => startSession({ templateId: data.selectedTemplateId!, sessionDate: data.today }))}><Dumbbell size={16} /> Start workout</button>
      </div>}
    </section>

    <WorkoutCapture data={data} />

    <DailyFuelCard data={data.dailyFuel} latestWeightKg={data.latestWeightKg} targetCalories={data.profile.dailyCalorieGoal} targetLabel={calorieGoalLabel(data.profile.calorieGoal)} subtitle="Confirmed meal estimates for this day." emptyMessage="No meals logged for this day yet. Add one to see your fuel totals." footer="Estimates are for direction, not precision." onLogMeal={() => setMealOpen(true)} onOpenDetails={() => setMealDetailsOpen(true)} onBodyCheckIn={() => setBodyOpen(true)} />

    {workoutPickerOpen && <WorkoutPickerSheet data={data} selectedTemplateId={data.selectedTemplateId} locked={locked} pending={pending} onClose={() => setWorkoutPickerOpen(false)} onSelect={(templateId) => refreshAfter(() => chooseTemplate({ templateId, sessionDate: data.today }))} />}
    {mealOpen && <MealSheet data={data} onClose={() => setMealOpen(false)} />}
    {mealDetailsOpen && <MealDetailsSheet data={data} onClose={() => setMealDetailsOpen(false)} />}
    {bodyOpen && <BodySheet data={data} onClose={() => setBodyOpen(false)} />}
    {addExerciseOpen && data.session && <AddExerciseSheet data={data} onClose={() => setAddExerciseOpen(false)} />}
    {swapExercise && <SwapExerciseSheet data={data} exercise={swapExercise} onClose={() => setSwapExercise(null)} />}
    {selectedExercise && <ExerciseDetailsSheet key={selectedExercise.id} data={data} exercise={selectedExercise} onClose={() => setSelectedExercise(null)} />}
  </>;
}

const ExerciseRow = forwardRef<ExerciseRowHandle, { data: ExerciseData; unit: "kg" | "lb"; sessionId?: string; started: boolean; onOpenDetails: () => void; onSwap?: () => void; onReset?: () => void; onRemove?: () => void; onStatsChange: (exerciseId: string, completed: number, total: number) => void }>(function ExerciseRow({ data, unit, sessionId, started, onOpenDetails, onSwap, onReset, onRemove, onStatsChange }, ref) {
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
  const setTrackRef = useRef<HTMLDivElement>(null);
  const setsRef = useRef<LocalSet[]>(sets);
  const editingSetsRef = useRef<Set<number>>(new Set());
  const pendingSaves = useRef(new Map<number, string>());

  useEffect(() => { setsRef.current = sets; }, [sets]);

  // Unsaved drafts survive page reloads. They are restored only after
  // hydration so the server-rendered values never mismatch.
  useEffect(() => {
    if (!sessionId) return;
    const drafts = readDraftMap(sessionId)[data.id] ?? [];
    if (!drafts.length) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration restore cannot be derived during render
    setSets((current) => {
      const merged = current.map((set) => {
        const draft = drafts.find((item) => item.setNumber === set.setNumber);
        return draft ? { ...draft, saved: false } : set;
      });
      for (const draft of drafts) if (!merged.some((set) => set.setNumber === draft.setNumber)) merged.push({ ...draft, saved: false });
      merged.sort((a, b) => a.setNumber - b.setNumber);
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { editingSetsRef.current = editingSets; }, [editingSets]);

  useEffect(() => {
    if (!sessionId) return;
    writeDraftMap(sessionId, data.id, sets.filter((set) => !set.saved));
  }, [sessionId, data.id, sets]);

  useEffect(() => {
    onStatsChange(data.id, sets.filter((set) => set.completed).length, sets.length || data.targetSets || 0);
  }, [sets, data.id, data.targetSets, onStatsChange]);

  // Server refreshes arrive after session-level actions (finish, reset,
  // swap, quick-log). When the server state for this exercise changed, the
  // server wins and unsaved drafts are discarded; when it is unchanged,
  // local state is kept untouched.
  const [prevServerSets, setPrevServerSets] = useState(data.sets);
  if (prevServerSets !== data.sets) {
    setPrevServerSets(data.sets);
    if (!sameServerSets(prevServerSets, data.sets)) {
      setSets(data.sets.map(toLocalSet));
      setEditingSets(new Set<number>());
    }
  }

  const toPayload = useCallback((set: LocalSet) => {
    const weight = set.weight === "" ? null : Number(set.weight);
    const reps = set.reps === "" || set.reps === "0" ? null : Number(set.reps);
    if ((weight !== null && !Number.isFinite(weight)) || (reps !== null && !Number.isInteger(reps))) return null;
    return { exerciseId: data.id, setNumber: set.setNumber, weight, reps, unit, completed: set.completed && reps !== null };
  }, [data.id, unit]);

  // A set is only marked saved when nothing was typed after the save that
  // the server just acknowledged, so newer changes always stay dirty.
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
    const result = await saveSet({ sessionId, ...payload });
    if (result.success) {
      acknowledge(set.setNumber, serialized);
    } else if (pendingSaves.current.get(set.setNumber) === serialized) {
      pendingSaves.current.delete(set.setNumber);
      setSets((current) => current.map((item) => (item.setNumber === set.setNumber && item.weight === set.weight && item.reps === set.reps ? { ...item, completed: set.completed ? false : item.completed, saved: false } : item)));
      setError(result.error ?? "This set could not be saved.");
    }
  }, [sessionId, toPayload, acknowledge]);

  const updateSet = useCallback((setNumber: number, patch: Partial<LocalSet>) => {
    const existing = setsRef.current.find((set) => set.setNumber === setNumber);
    if (!existing) return;
    const next = { ...existing, ...patch, ...(editingSetsRef.current.has(setNumber) && existing.completed && !("completed" in patch) ? { completed: false } : {}) };
    if (next.weight === existing.weight && next.reps === existing.reps && next.completed === existing.completed) return;
    setError("");
    pendingSaves.current.delete(setNumber);
    setSets((current) => current.map((set) => (set.setNumber === setNumber ? { ...next, saved: false } : set)));
  }, []);

  const editSet = useCallback((setNumber: number) => {
    editingSetsRef.current = new Set(editingSetsRef.current).add(setNumber);
    setEditingSets(editingSetsRef.current);
  }, []);

  // Logging is optimistic: the set flips to completed immediately and the
  // save happens in the background. Failures revert the flag.
  const logSet = useCallback((set: LocalSet) => {
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
    pendingSaves.current.clear();
    void (async () => {
      const result = await deleteSet({ sessionId, exerciseId: data.id, setNumber: set.setNumber });
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
      } else setError(result.error ?? "This set could not be deleted.");
    })();
  }, [sessionId, data.id]);

  useImperativeHandle(ref, () => ({
    async flushDrafts() {
      if (!sessionId) return { success: true };
      const payloads = setsRef.current.filter((set) => !set.saved).map(toPayload);
      if (payloads.some((payload) => payload === null)) {
        setError("Use valid numbers in every set, or delete the incomplete set before finishing.");
        return { success: false, error: "Use valid numbers in every set, or delete the incomplete set before finishing." };
      }
      const valid = payloads.filter((payload): payload is NonNullable<typeof payload> => payload !== null);
      if (!valid.length) return { success: true };
      const sent = valid.map((payload) => ({ setNumber: payload.setNumber, serialized: JSON.stringify(payload) }));
      for (const { setNumber, serialized } of sent) pendingSaves.current.set(setNumber, serialized);
      const result = await saveSets({ sessionId, sets: valid });
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

  const previousBest = valueInUnit(data.personalBestWeightKg, unit);
  const currentBest = Math.max(...sets.filter((set) => set.completed).map((set) => Number(set.weight)).filter(Number.isFinite), 0);
  const prSetNumber = previousBest !== null && currentBest > previousBest
    ? sets.find((set) => set.completed && Number(set.weight) === currentBest)?.setNumber ?? null
    : null;

  return <div className="exercise-row">
    <div className="exercise-heading">
      <button className="exercise-name-trigger" type="button" onClick={onOpenDetails}>
        <span className="exercise-name">{data.name}</span>
        <span className="exercise-muscle">{data.primaryMuscle}{data.targetReps ? ` · ${data.targetSets ?? ""} × ${data.targetReps}` : ""}</span>
      </button>
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
           set={set}
           unit={unit}
        />)}
       </div>
       {error && <p className="error-text set-error" aria-live="polite">{error}</p>}
       <button className="add-set" onClick={addSet}><Plus size={13} /> Add set</button>
     </> : <p className="panel-kicker">Start the workout to log sets. The plan can still change after starting.</p>}
   </div>;
});

const SetRow = memo(function SetRow({ set, unit, isPr, isEditing, onPatch, onEdit, onLog, onDelete }: {
  set: LocalSet;
  unit: "kg" | "lb";
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
      {logged ? <button className="set-edit" type="button" onClick={() => onEdit(set.setNumber)}><Pencil size={13} /></button> : <button className="set-log" type="button" onClick={() => onLog(set)}><Check size={15} /></button>}
      <button className="set-delete" type="button" onClick={() => onDelete(set)} aria-label={`Delete set ${set.setNumber}`} title="Delete set"><Trash2 size={16} /></button>
    </div>
    <span className={isPr ? "pr-note" : "save-state"} title={isPr ? "Heaviest completed set compared with previous sessions" : undefined}>{isPr ? "Weight PR" : ""}</span>
  </div>;
});

function WorkoutPickerSheet({ data, selectedTemplateId, locked, pending, onClose, onSelect }: { data: TodayData; selectedTemplateId: string | null; locked: boolean; pending: boolean; onClose: () => void; onSelect: (id: string) => void }) {
  return <div className="sheet-backdrop centered-sheet-backdrop workout-picker-backdrop" role="dialog" aria-modal="true" aria-labelledby="workout-picker-title" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="sheet centered-sheet workout-picker-sheet">
      <div className="sheet-heading">
        <div>
          <div className="eyebrow">Workout</div>
          <h2 className="sheet-title" id="workout-picker-title">Choose workout</h2>
        </div>
        <button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
      </div>
      {locked && <p className="notice">Workout locked after start. Finish or cancel the current session to switch.</p>}
      <div className="picker-list" role="listbox" aria-label="Workout templates">
        {data.templates.map((template) => {
          const active = template.id === selectedTemplateId;
          const disabled = locked || pending;
          return <button
            key={template.id}
            role="option"
            aria-selected={active}
            disabled={disabled}
            className={`picker-row${active ? " active" : ""}${disabled ? " disabled" : ""}`}
            onClick={() => { if (disabled) return; onSelect(template.id); onClose(); }}
          >
            <span className="picker-copy">
              <strong>{template.name}</strong>
              {active && <small>Current</small>}
            </span>
            {active ? <span className="picker-check" aria-hidden="true"><Check size={16} strokeWidth={2.5} /></span> : <span className="picker-chevron" aria-hidden="true"><ChevronRight size={16} /></span>}
          </button>;
        })}
      </div>
      {data.templates.length === 0 && <div className="empty-state"><strong>No templates yet.</strong>Create one in Library.</div>}
      <div className="sheet-actions"><button className="button ghost" onClick={onClose}>Close</button></div>
    </div>
  </div>;
}

function PrestartExerciseRow({ data, index, onOpenDetails }: { data: ExerciseData; index: number; onOpenDetails: () => void }) {
  return <button className="exercise-plan-row" type="button" onClick={onOpenDetails}>
    <span className="exercise-plan-index">{String(index + 1).padStart(2, "0")}</span>
    <span className="exercise-plan-copy">
      <span className="exercise-name">{data.name}</span>
      <span className="exercise-muscle">{data.primaryMuscle}</span>
    </span>
    <span className="exercise-plan-target">{data.targetSets ?? "-"} sets <span>×</span> {data.targetReps ?? "-"} reps</span>
    <ChevronRight className="exercise-plan-chevron" size={17} />
  </button>;
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
        if (data.session) clearExerciseDrafts(data.session.id, exercise.id);
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
      <span className="tile-icon"><Sparkle size={19} /></span>
      <div className="capture-copy">
        <h2 className="capture-title" id="capture-title">Log workout with AI</h2>
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
  const commonMeals = useMemo(() => data.reusableMeals.slice(0, 8), [data.reusableMeals]);
  const suggestions = useMemo(() => (text.trim() ? matchReusableMeals(data.reusableMeals, text) : []), [text, data.reusableMeals]);
  function reuse(meal: ReusableMeal) { setError(""); setText(meal.rawInput); setParsed({ summary: meal.rawInput, items: meal.parsedItems as MealParse["items"], calories: meal.calories ?? 0, protein: meal.protein ?? 0, carbs: meal.carbs ?? 0, fat: meal.fat ?? 0 }); }
  function parse() { setError(""); startTransition(async () => { const result = await parseMealText(text); if (result.success) setParsed(result.data); else setError(result.error); }); }
  function confirm() { if (!parsed) return; startTransition(async () => { const result = await confirmMeal({ ...parsed, rawInput: text, mealDate: data.today }); if (result.success) { router.refresh(); onClose(); } else setError(result.error); }); }
   return <div className="sheet-backdrop centered-sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="meal-title"><div className="sheet centered-sheet"><div className="sheet-heading"><div><h2 className="sheet-title" id="meal-title">Log a meal</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>{!parsed ? <><div className="parse-box"><textarea className="field" placeholder="e.g. chicken bowl with rice and vegetables" value={text} onChange={(event) => setText(event.target.value)} /><button className={`icon-button mic-button${speech.listening ? " listening" : ""}`} onClick={speech.toggle} disabled={!speech.supported} aria-label="Use microphone"><Mic size={17} /></button></div>{!text.trim() && commonMeals.length > 0 && <div className="common-meals"><span className="common-meals-label">Common meals</span><div className="common-meals-chips">{commonMeals.map((meal) => <button className="common-meal-chip" type="button" key={meal.rawInput} onClick={() => reuse(meal)}><span>{meal.rawInput}</span><strong>{Math.round(meal.calories ?? 0)} kcal</strong></button>)}</div></div>}{suggestions.length > 0 && <div className="meal-suggestions-wrap"><span className="meal-suggestions-label">Reuse a previous meal</span><ul className="meal-suggestions" role="listbox" aria-label="Matching meals">{suggestions.map((meal) => <li role="option" aria-selected="false" key={meal.rawInput}><button type="button" onClick={() => reuse(meal)}><span>{meal.rawInput}</span><strong>{Math.round(meal.calories ?? 0)} kcal</strong></button></li>)}</ul></div>}{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button" onClick={parse} disabled={pending || !text.trim()}>{pending ? "Estimating..." : "Review estimate"}</button></div></> : <><div className="notice">Nutrition values are estimates. Adjust them before saving.</div><div className="macro-grid">{(["calories", "protein", "carbs", "fat"] as const).map((key) => <label className="macro-box" key={key}><span className="macro-label">{key === "calories" ? "kcal" : key}</span><input className="field tiny-field" type="number" value={parsed[key]} onChange={(event) => setParsed({ ...parsed, [key]: Number(event.target.value) })} /></label>)}</div><p className="status-text">{parsed.summary}</p>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={() => setParsed(null)}>Back</button><button className="button" disabled={pending} onClick={confirm}>{pending ? "Saving..." : "Confirm meal"}</button></div></>}</div></div>;
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

type MealDetailsData = TodayData["meals"][number];

function formatUnitWeight(valueKg: number | null | undefined, unit: "kg" | "lb") {
  const value = valueInUnit(valueKg, unit);
  return value === null ? "" : `${value.toFixed(1).replace(/\.0$/, "")} ${unit}`;
}

function formatItemNutrition(item: MealDetailsData["parsedItems"][number]) {
  const parts: string[] = [];
  if (item.calories !== undefined && item.calories !== null) parts.push(`${formatMealValue(item.calories)} kcal`);
  if (item.protein !== undefined && item.protein !== null) parts.push(`${formatMealValue(item.protein)}g protein`);
  if (item.carbs !== undefined && item.carbs !== null) parts.push(`${formatMealValue(item.carbs)}g carbs`);
  if (item.fat !== undefined && item.fat !== null) parts.push(`${formatMealValue(item.fat)}g fat`);
  return parts.length ? parts.join(" · ") : "No estimates";
}

function formatMealValue(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function MealMacro({ icon: Icon, value, unit, label, tone }: { icon: typeof Flame; value: number | null | undefined; unit?: string; label: string; tone: "calories" | "protein" | "carbs" | "fat" }) {
  return <div className={`meal-macro meal-macro-${tone}`}>
    <Icon size={22} strokeWidth={2.5} aria-hidden="true" />
    <div><strong>{formatMealValue(value)}{unit && <small> {unit}</small>}</strong><span>{label}</span></div>
  </div>;
}

function ExerciseDetailsSheet({ data, exercise, onClose }: { data: TodayData; exercise: ExerciseData; onClose: () => void }) {
  const unit = data.profile.preferredUnit;
  const requestIdRef = useRef(0);
  const startedRef = useRef(false);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidance, setGuidance] = useState<ExerciseGuidance | null>(null);
  const [guidanceError, setGuidanceError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ExerciseAnswer | null>(null);
  const [answerError, setAnswerError] = useState("");
  const [answerLoading, setAnswerLoading] = useState(false);

  function requestGuidance() {
    const requestId = ++requestIdRef.current;
    setGuidanceLoading(true);
    setGuidanceError("");
    setGuidance(null);
    setQuestion("");
    setAnswer(null);
    setAnswerError("");
    void (async () => {
      const result = await generateExerciseGuidance(exercise.id);
      if (requestId !== requestIdRef.current) return;
      setGuidanceLoading(false);
      if (result.success) setGuidance(result.data);
      else setGuidanceError(result.error ?? "Guidance could not be generated right now.");
    })();
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    requestGuidance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function askQuestion() {
    if (!question.trim() || answerLoading) return;
    const requestId = requestIdRef.current;
    setAnswerError("");
    setAnswerLoading(true);
    void (async () => {
      const result = await askExerciseQuestion({ exerciseId: exercise.id, question });
      if (requestId !== requestIdRef.current) return;
      setAnswerLoading(false);
      if (result.success) setAnswer(result.data);
      else setAnswerError(result.error ?? "That question could not be answered right now.");
    })();
  }

  const muscles = exercise.secondaryMuscles.length ? [exercise.primaryMuscle, ...exercise.secondaryMuscles] : [exercise.primaryMuscle];
  const lastWorkoutCount = exercise.lastSession.length;

  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="exercise-details-title">
    <div className="sheet exercise-details-sheet">
      <div className="sheet-heading">
        <div>
          <div className="eyebrow">Exercise details</div>
          <h2 className="sheet-title" id="exercise-details-title">{exercise.name}</h2>
        </div>
        <button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
      </div>

      <div className="exercise-facts">
        <section className="exercise-fact-card" aria-labelledby="target-muscles-label">
          <h3 className="exercise-fact-label" id="target-muscles-label">Target muscles</h3>
          <div className="muscle-chips">{muscles.map((muscle) => <span className="muscle-chip" key={muscle}>{muscle}</span>)}</div>
        </section>
        <section className="exercise-fact-card" aria-labelledby="last-workout-label">
          <h3 className="exercise-fact-label" id="last-workout-label">Last workout</h3>
          {lastWorkoutCount ? <ul className="fact-set-list">{exercise.lastSession.map((set) => <li key={set.id}>
            <span className="fact-set-number">Set {set.setNumber}</span>
            <span className="fact-set-value">{set.weightKg !== null && set.weightKg > 0 ? formatUnitWeight(set.weightKg, unit) : "Bodyweight"}{set.reps ? ` × ${set.reps}` : ""}</span>
          </li>)}</ul> : <p className="fact-empty">No completed workout before this day.</p>}
        </section>
      </div>

      <section className="exercise-fact-card pr-card" aria-labelledby="pr-label">
        <h3 className="exercise-fact-label" id="pr-label">Personal record</h3>
        {exercise.personalBestSet ? <p className="pr-value">{formatUnitWeight(exercise.personalBestSet.weightKg, unit)}<span> × {exercise.personalBestSet.reps}</span></p> : <p className="fact-empty">No PR yet.</p>}
      </section>

      <section className="ai-block" aria-labelledby="ai-guidance-title">
        <div className="ai-block-heading"><h3 className="ai-block-title" id="ai-guidance-title"><Sparkle size={15} /> How to do it</h3></div>
        {guidanceLoading ? <p className="ai-loading" role="status"><span className="spinner" aria-hidden="true" /> Generating form guidance...</p>
          : guidanceError ? <div className="ai-error"><p className="error-text">{guidanceError}</p><button className="button small" type="button" onClick={requestGuidance}>Try again</button></div>
          : guidance ? <><ol className="guidance-steps">{guidance.steps.map((step, index) => <li key={index}>{step}</li>)}</ol><p className="guidance-tip"><strong>Form tip:</strong> {guidance.tip}</p></>
          : null}
        <form className="ai-question" onSubmit={(event) => { event.preventDefault(); askQuestion(); }}>
          <div className="ai-question-field">
            <input className="field" placeholder="Ask about this exercise..." value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Ask a question about this exercise" />
            <button className="icon-button" type="submit" disabled={!question.trim() || answerLoading} aria-label="Ask"><Sparkle size={17} /></button>
          </div>
          {answerLoading && <p className="status-text">Thinking...</p>}
          {answerError && <p className="error-text">{answerError}</p>}
          {answer && <div className="ai-answer"><p>{answer.answer}</p></div>}
        </form>
        <p className="ai-disclaimer">AI guidance is general fitness information, not medical advice. It never replaces professional guidance and never blocks you from logging a workout.</p>
      </section>

      <div className="sheet-actions"><button className="button" onClick={onClose}>Close</button></div>
    </div>
  </div>;
}

function MealDetailsSheet({ data, onClose }: { data: TodayData; onClose: () => void }) {
  const router = useRouter();
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const meals = data.meals.filter((meal) => !removedIds.has(meal.id));
  const dateLabel = new Date(`${data.today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const itemCount = meals.reduce((count, meal) => count + meal.parsedItems.length, 0);
  const totals = meals.reduce((sum, meal) => ({
    calories: sum.calories + (meal.calories ?? 0),
    protein: sum.protein + (meal.protein ?? 0),
    carbs: sum.carbs + (meal.carbs ?? 0),
    fat: sum.fat + (meal.fat ?? 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  function removeMeal(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError("");
    startTransition(async () => {
      const result = await deleteMeal(id);
      if (result.success) {
        setRemovedIds((current) => new Set(current).add(id));
        router.refresh();
      } else {
        setError(result.error ?? "The meal could not be deleted.");
      }
      setDeletingId(null);
    });
  }

  return <div className="sheet-backdrop meal-details-backdrop" role="dialog" aria-modal="true" aria-labelledby="meal-details-title">
    <div className="sheet meal-details-sheet">
      <div className="meal-details-heading">
        <div>
          <div className="eyebrow">{dateLabel}</div>
          <h2 className="sheet-title" id="meal-details-title">Meal details</h2>
          <p className="sheet-intro">Confirmed meal estimates for this day.<br />Estimates are for direction, not precision.</p>
        </div>
        <button className="sheet-close" onClick={onClose} aria-label="Close"><X size={22} /></button>
      </div>
      {meals.length ? <>
        <div className="meal-list">
          {meals.map((meal) => {
            return <article className="meal-detail-row" key={meal.id}>
              <div className="meal-detail-head">
                <div className="meal-detail-copy">
                  <p className="meal-detail-label">{meal.rawInput}</p>
                </div>
                <div className="meal-detail-actions">
                  {deletingId === meal.id && <span className="meal-deleting">Deleting...</span>}
                  <button className="meal-delete" type="button" disabled={deletingId !== null} onClick={() => removeMeal(meal.id)} aria-label={`Delete ${meal.rawInput}`} title="Delete meal"><Trash2 size={17} /></button>
                </div>
              </div>
              <div className="meal-detail-macros">
                <MealMacro icon={Flame} value={meal.calories} label="kcal" tone="calories" />
                <MealMacro icon={Link2} value={meal.protein} unit="g" label="protein" tone="protein" />
                <MealMacro icon={Wheat} value={meal.carbs} unit="g" label="carbs" tone="carbs" />
                <MealMacro icon={Droplet} value={meal.fat} unit="g" label="fat" tone="fat" />
              </div>
              {meal.parsedItems.length > 0 && <details className="meal-items">
                <summary><span>{meal.parsedItems.length} {meal.parsedItems.length === 1 ? "item" : "items"}</span><ChevronDown size={18} aria-hidden="true" /></summary>
                <ul>{meal.parsedItems.map((item, index) => <li key={index}>
                  <span className="meal-item-name">{item.name}{item.quantity ? <span className="meal-item-quantity"> · {item.quantity}</span> : null}</span>
                  <span className="meal-item-macros">{formatItemNutrition(item)}</span>
                </li>)}</ul>
              </details>}
            </article>;
          })}
        </div>
        <section className="meal-totals" aria-label="Meal totals">
          <div className="meal-totals-copy"><strong>Meal totals</strong><span>{meals.length} {meals.length === 1 ? "meal" : "meals"} · {itemCount} {itemCount === 1 ? "item" : "items"}</span></div>
          <MealMacro icon={Flame} value={totals.calories} label="kcal" tone="calories" />
          <MealMacro icon={Link2} value={totals.protein} unit="g" label="protein" tone="protein" />
          <MealMacro icon={Wheat} value={totals.carbs} unit="g" label="carbs" tone="carbs" />
          <MealMacro icon={Droplet} value={totals.fat} unit="g" label="fat" tone="fat" />
        </section>
      </> : <div className="empty-state"><strong>No meals logged for this day.</strong>Use the Log a meal card to add one.</div>}
      {error && <p className="error-text" aria-live="polite">{error}</p>}
      <p className="meal-details-hint">Use the trash button to delete a meal</p>
    </div>
  </div>;
}
