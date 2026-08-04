"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useTransition } from "react";
import { ArrowRightLeft, Check, Dumbbell, Mic, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveBodyMetric } from "@/lib/actions/body";
import { parseWorkoutText } from "@/lib/actions/ai";
import { confirmMeal, parseMealText } from "@/lib/actions/meal";
import { addExerciseToSession, chooseTemplate, createExerciseAndLogQuickSets, deleteSet, finishSession, logQuickSets, removeExerciseFromSession, replaceSessionExercise, resetExerciseSets, saveSet, saveSets, startSession } from "@/lib/actions/session";
import { getTodayData } from "@/lib/queries/today";
import { calculateBmi, kgFromUnit, valueInUnit } from "@/lib/metrics";
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

export function TodayScreen({ data }: { data: TodayData }) {
  const router = useRouter();
  const [mealOpen, setMealOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [swapExercise, setSwapExercise] = useState<ExerciseData | null>(null);
  const [actionError, setActionError] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedDayRef = useRef<HTMLButtonElement>(null);
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

  return <>
    <div className="page-intro">
      <div>
        <h1 className="page-title">{data.today === data.currentDate ? "Today" : "Daily log"}</h1>
      </div>
      <div className="date-line">{new Date(`${data.today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}{data.today === data.currentDate ? "" : " · selected"}</div>
    </div>

    <div className="streak-strip" role="group" aria-label="Select a logging day">
      {data.days.map((day) => <button
        aria-label={`${day.label}, ${day.dateLabel}${day.today ? ", today" : ""}`}
        aria-pressed={day.date === data.today}
        className={`day-dot${day.complete ? " complete" : ""}${day.today ? " today" : ""}${day.date === data.today ? " selected" : ""}`}
        key={day.date}
        ref={day.date === data.today ? selectedDayRef : undefined}
        onClick={() => router.replace(day.date === data.currentDate ? "/today" : `/today?date=${day.date}`, { scroll: false })}
      >
        <span className="day-dot-label">{day.label}</span>
        <span className="day-dot-date">{day.dateLabel}</span>
      </button>)}
    </div>

    <section className="routine-section" aria-labelledby="routine-title">
      <div className="routine-heading">
        <h2 className="routine-title" id="routine-title">Routine</h2>
        <span className="routine-note">Choose the plan for this day</span>
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
        <div>
          <h2 className="panel-title">Workout</h2>
          <p className="workout-subtitle">{selectedTemplate?.name ?? "Choose a routine to get started."}</p>
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
      </div> : <div className="exercise-plan-grid" aria-label="Planned exercises">
        {data.exercises.map((exercise, index) => <PrestartExerciseCard data={exercise} index={index} key={exercise.sessionExerciseId ?? exercise.id} />)}
      </div> : <div className="empty-state inverse-empty"><strong>No movements yet.</strong>Add exercises in Library or add them after starting.</div>}

      {isStarted && !isComplete && <button className="add-exercise" onClick={() => setAddExerciseOpen(true)}><Plus size={16} /> Add an exercise</button>}

      <div className="workout-footer">
        <span className="panel-kicker">{isComplete ? "Completed. Set log stays editable." : isStarted ? "Changes save automatically." : "Choose a template and start the workout."}</span>
         {isComplete ? <span className="session-complete"><Check size={15} /> Complete</span> : isStarted ? <button className="button citrus" disabled={pending} onClick={finishWorkout}>Finish workout</button> : <button className="button citrus" disabled={pending || !selectedTemplate} onClick={() => refreshAfter(() => startSession({ templateId: data.selectedTemplateId!, sessionDate: data.today }))}><Dumbbell size={16} /> Start workout</button>}
      </div>
    </section>

    <section className="panel">
      <div className="quick-grid">
        <button className="quick-card meal-card" onClick={() => setMealOpen(true)}>
          <span><h3>Log a meal</h3><p>AI-assisted macros estimation for quick logging.</p></span>
          <span className="icon-button"><Plus size={17} /></span>
        </button>
        <button className="quick-card" onClick={() => setBodyOpen(true)}>
          <span><h3>Body check-in</h3><p>Weight required; height and body fat optional.</p></span>
          <span className="icon-button"><Plus size={17} /></span>
        </button>
      </div>
    </section>

    {mealOpen && <MealSheet data={data} onClose={() => setMealOpen(false)} />}
    {bodyOpen && <BodySheet data={data} onClose={() => setBodyOpen(false)} />}
    {addExerciseOpen && data.session && <AddExerciseSheet data={data} onClose={() => setAddExerciseOpen(false)} />}
    {swapExercise && <SwapExerciseSheet data={data} exercise={swapExercise} onClose={() => setSwapExercise(null)} />}
  </>;
}

const ExerciseRow = forwardRef<ExerciseRowHandle, { data: ExerciseData; unit: "kg" | "lb"; sessionId?: string; started: boolean; onSwap?: () => void; onReset?: () => void; onRemove?: () => void }>(function ExerciseRow({ data, unit, sessionId, started, onSwap, onReset, onRemove }, ref) {
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();
  const setTrackRef = useRef<HTMLDivElement>(null);
  const trackDrag = useRef<{ startX: number; startScrollLeft: number } | null>(null);

  useEffect(() => {
    setSets(data.sets.map((set) => ({
      id: set.id,
      setNumber: set.setNumber,
      weight: set.weightKg === null ? "" : String(valueInUnit(set.weightKg, unit)?.toFixed(1).replace(/\.0$/, "")),
      reps: set.reps ? String(set.reps) : "",
      completed: set.completed,
      saved: true,
    })));
  }, [data.sets, unit]);

  function update(index: number, patch: Partial<LocalSet>) {
    setSets((current) => current.map((set, setIndex) => setIndex === index ? { ...set, ...patch, saved: false } : set));
  }

  const toPayload = useCallback((set: LocalSet) => {
    const weight = set.weight === "" ? null : Number(set.weight);
    const reps = set.reps === "" || set.reps === "0" ? null : Number(set.reps);
    if ((weight !== null && !Number.isFinite(weight)) || (reps !== null && !Number.isInteger(reps))) return null;
    return { exerciseId: data.id, setNumber: set.setNumber, weight, reps, unit, completed: set.completed && reps !== null };
  }, [data.id, unit]);

  function saveCompletedSet(set: LocalSet) {
    if (!sessionId) return;
    const payload = toPayload(set);
    if (!payload) {
      setError("Use a valid weight and whole-number reps, or delete the set.");
      return;
    }
    setError("");
    startSaving(async () => {
      const result = await saveSet({ sessionId, ...payload });
      if (result.success) setSets((current) => current.map((item) => item.setNumber === set.setNumber ? { ...item, saved: true } : item));
      else setError(result.error ?? "This set could not be saved.");
    });
  }

  useImperativeHandle(ref, () => ({
    async flushDrafts() {
      if (!sessionId) return { success: true };
      const payloads = sets.map(toPayload);
      if (payloads.some((payload) => payload === null)) {
        setError("Use valid numbers in every set, or delete the incomplete set before finishing.");
        return { success: false, error: "Use valid numbers in every set, or delete the incomplete set before finishing." };
      }
      const result = await saveSets({ sessionId, sets: payloads.filter((payload): payload is NonNullable<typeof payload> => payload !== null) });
      if (result.success) setSets((current) => current.map((set) => ({ ...set, saved: true })));
      else setError(result.error ?? "The set drafts could not be saved.");
      return result;
    },
  }), [sessionId, sets, toPayload]);

  function removeSet(set: LocalSet) {
    if (!sessionId) return;
    setError("");
    startSaving(async () => {
      const result = await deleteSet({ sessionId, exerciseId: data.id, setNumber: set.setNumber });
      if (result.success) setSets((current) => current.filter((item) => item.setNumber !== set.setNumber).map((item) => item.setNumber > set.setNumber ? { ...item, setNumber: item.setNumber - 1 } : item));
      else setError(result.error ?? "This set could not be deleted.");
    });
  }

  function addSet() {
    setSets((current) => [...current, { setNumber: Math.max(0, ...current.map((set) => set.setNumber)) + 1, weight: "", reps: "", completed: false, saved: false }]);
  }

  const previousBest = valueInUnit(data.personalBestWeightKg, unit);
  const currentBest = Math.max(...sets.filter((set) => set.completed).map((set) => Number(set.weight)).filter(Number.isFinite), 0);
  const prSetNumber = previousBest !== null && currentBest > previousBest
    ? sets.find((set) => set.completed && Number(set.weight) === currentBest)?.setNumber ?? null
    : null;

  function beginTrackDrag(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, button, label")) return;
    if (!setTrackRef.current || setTrackRef.current.scrollWidth <= setTrackRef.current.clientWidth) return;
    trackDrag.current = { startX: event.clientX, startScrollLeft: setTrackRef.current.scrollLeft };
    setTrackRef.current.setPointerCapture(event.pointerId);
    setTrackRef.current.classList.add("is-dragging");
  }

  function moveTrackDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!trackDrag.current || !setTrackRef.current) return;
    event.preventDefault();
    setTrackRef.current.scrollLeft = trackDrag.current.startScrollLeft - (event.clientX - trackDrag.current.startX);
  }

  function endTrackDrag() {
    trackDrag.current = null;
    setTrackRef.current?.classList.remove("is-dragging");
  }

  function scrollTrack(event: React.WheelEvent<HTMLDivElement>) {
    const track = setTrackRef.current;
    if (!track || track.scrollWidth <= track.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    track.scrollLeft += delta;
  }

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
           {onSwap && <button className="exercise-action" onClick={onSwap}><ArrowRightLeft size={13} /> Swap</button>}
           {onRemove && <button className="exercise-action remove-action icon-only-action" onClick={onRemove} title="Remove this exercise" aria-label={`Remove ${data.name}`}><Trash2 size={14} /></button>}
         </div>
       </div>
     </div>
     {started ? <>
        <div className="set-track" aria-label={`${data.name} sets`} ref={setTrackRef} onPointerDown={beginTrackDrag} onPointerMove={moveTrackDrag} onPointerUp={endTrackDrag} onPointerCancel={endTrackDrag} onWheel={scrollTrack}>
        {sets.map((set, index) => {
          const isPr = set.setNumber === prSetNumber;
          return <div className={`set-card${set.completed ? " completed" : ""}`} key={set.setNumber}>
             <div className="set-card-heading"><span className="set-number">Set {set.setNumber}</span><span className="set-card-status"><span className={isPr ? "pr-note" : "save-state"} title={isPr ? "Heaviest completed set compared with previous sessions" : undefined}>{isPr ? "Weight PR" : !set.saved && saving ? "Saving" : !set.saved ? "Unsaved" : ""}</span></span></div>
             <div className="set-card-values">
               <AdjustableNumber label="Weight" unit={unit} value={set.weight} step={unit === "lb" ? 5 : 2.5} inputMode="decimal" onChange={(value) => update(index, { weight: value })} />
               <AdjustableNumber label="Reps" value={set.reps} step={1} inputMode="numeric" onChange={(value) => update(index, { reps: value })} />
             </div>
             <div className="set-card-footer">
               <button className="set-delete" type="button" onClick={() => removeSet(set)} aria-label={`Delete set ${set.setNumber}`} title="Delete set"><X size={19} /></button>
               <button className={`complete-button${set.completed ? " done" : ""}`} aria-pressed={set.completed} aria-label={set.completed ? "Mark set incomplete" : "Complete set"} onClick={() => { const next = { ...set, completed: !set.completed }; update(index, next); saveCompletedSet(next); }}><Check size={22} /></button>
             </div>
          </div>;
       })}
       </div>
       {error && <p className="error-text set-error" aria-live="polite">{error}</p>}
       <button className="add-set" onClick={addSet}><Plus size={13} /> Add set</button>
     </> : <p className="panel-kicker">Start the workout to log sets. The plan can still change after starting.</p>}
   </div>;
});

function PrestartExerciseCard({ data, index }: { data: ExerciseData; index: number }) {
  return <article className="exercise-plan-card">
    <div className="exercise-plan-index">{String(index + 1).padStart(2, "0")}</div>
    <div className="exercise-name">{data.name}</div>
    <div className="exercise-muscle">{data.primaryMuscle}</div>
    <div className="exercise-plan-target">{data.targetSets ?? "-"} sets <span>×</span> {data.targetReps ?? "-"} reps</div>
  </article>;
}

function AdjustableNumber({ label, unit, value, step, inputMode, onChange }: { label: string; unit?: string; value: string; step: number; inputMode: "decimal" | "numeric"; onChange: (value: string) => void }) {
  const drag = useRef<{ startY: number; startValue: number; lastValue: string; moved: boolean } | null>(null);

  function beginDrag(event: React.PointerEvent<HTMLInputElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const numericValue = Number(value);
    drag.current = { startY: event.clientY, startValue: Number.isFinite(numericValue) ? numericValue : 0, lastValue: value, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLInputElement>) {
    if (!drag.current) return;
    const change = Math.round((drag.current.startY - event.clientY) / 18);
    if (change === 0) return;
    event.preventDefault();
    drag.current.moved = true;
    const next = Math.max(0, drag.current.startValue + change * step);
    const nextValue = String(Number.isInteger(next) ? next : Number(next.toFixed(2)));
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

  return <label className="adjustable-number" title={`Click to edit ${label.toLowerCase()}, or drag up and down to adjust`}>
    <span className="number-label">{label}{unit ? ` (${unit})` : ""}</span>
    <input className="field number-field" inputMode={inputMode} aria-label={label} value={value} placeholder="-" onChange={(event) => onChange(event.target.value)} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
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
      <div className="capture-copy">
        <h2 className="capture-title" id="capture-title">Log a workout</h2>
        <p className="capture-subtitle">Tell me what you did...</p>
      </div>
    </div>
    {!parsed ? <>
        <div className="parse-box"><textarea ref={captureInputRef} className={`field capture-field${text.includes("\n") ? " multiline" : ""}`} rows={1} placeholder="bench press, 3 sets of 8 reps, 85kg" value={text} onChange={(event) => setText(event.target.value)} /><button className={`icon-button mic-button${speech.listening ? " listening" : ""}`} onClick={speech.toggle} aria-label={speech.supported ? "Use microphone" : "Speech input unsupported"} disabled={!speech.supported}><Mic size={18} /></button></div>
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
             {!data.library.some((option) => option.name.toLowerCase() === exercise.name.toLowerCase()) && <label className="form-group sheet-field"><span className="form-label">Target muscle</span><input className="field" value={exercise.primaryMuscle} onChange={(event) => setParsed({ ...parsed, exercises: parsed.exercises.map((item, index) => index === exerciseIndex ? { ...item, primaryMuscle: event.target.value } : item) })} /></label>}
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
   return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="meal-title"><div className="sheet"><div className="sheet-heading"><div><h2 className="sheet-title" id="meal-title">Log a meal</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>{!parsed ? <><div className="parse-box"><textarea className="field" placeholder="e.g. chicken bowl with rice and vegetables" value={text} onChange={(event) => setText(event.target.value)} /><button className={`icon-button mic-button${speech.listening ? " listening" : ""}`} onClick={speech.toggle} disabled={!speech.supported} aria-label="Use microphone"><Mic size={17} /></button></div>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button" onClick={parse} disabled={pending || !text.trim()}>{pending ? "Estimating..." : "Review estimate"}</button></div></> : <><div className="notice">Nutrition values are estimates. Adjust them before saving.</div><div className="macro-grid">{(["calories", "protein", "carbs", "fat"] as const).map((key) => <label className="macro-box" key={key}><span className="macro-label">{key === "calories" ? "kcal" : key}</span><input className="field tiny-field" type="number" value={parsed[key]} onChange={(event) => setParsed({ ...parsed, [key]: Number(event.target.value) })} /></label>)}</div><p className="status-text">{parsed.summary}</p>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={() => setParsed(null)}>Back</button><button className="button" disabled={pending} onClick={confirm}>{pending ? "Saving..." : "Confirm meal"}</button></div></>}</div></div>;
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
   return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="body-title"><div className="sheet"><div className="sheet-heading"><div><h2 className="sheet-title" id="body-title">Body check-in</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div><div className="form-grid"><label className="form-group"><span className="form-label">Weight</span><div className="unit-input"><input className="field" type="number" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="72.5" /><select className="select-field" value={unit} onChange={(event) => setUnit(event.target.value as "kg" | "lb")}><option>kg</option><option>lb</option></select></div></label><label className="form-group"><span className="form-label">Height (cm)</span><input className="field" type="number" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="180" /></label><label className="form-group"><span className="form-label">Body fat % (optional)</span><input className="field" type="number" value={bodyFat} onChange={(event) => setBodyFat(event.target.value)} placeholder="18" /></label></div>{bmi ? <p className="notice spaced-notice">BMI: <strong>{bmi.toFixed(1)}</strong> based on the height entered today.</p> : <p className="status-text spaced-notice">Enter height to calculate BMI. Saved height is prefilled when available.</p>}{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button" disabled={pending || !weight} onClick={submit}>{pending ? "Saving..." : "Save check-in"}</button></div></div></div>;
}
