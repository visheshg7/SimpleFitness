"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowRightLeft, Check, Dumbbell, Mic, Plus, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveBodyMetric } from "@/lib/actions/body";
import { parseWorkoutText } from "@/lib/actions/ai";
import { confirmMeal, parseMealText } from "@/lib/actions/meal";
import { addExerciseToSession, chooseTemplate, finishSession, logQuickSets, replaceSessionExercise, saveSet, startSession } from "@/lib/actions/session";
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

export function TodayScreen({ data }: { data: TodayData }) {
  const router = useRouter();
  const [mealOpen, setMealOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [swapExercise, setSwapExercise] = useState<ExerciseData | null>(null);
  const [actionError, setActionError] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedTemplate = data.templates.find((template) => template.id === data.selectedTemplateId);
  const isStarted = Boolean(data.session?.startedAt);
  const isComplete = Boolean(data.session?.completedAt);
  const completedSets = data.exercises.reduce((total, exercise) => total + exercise.sets.filter((set) => set.completed).length, 0);
  const totalSets = data.exercises.reduce((total, exercise) => total + (exercise.sets.length || exercise.targetSets || 0), 0);

  function refreshAfter(action: () => Promise<ActionResult>) {
    setActionError("");
    startTransition(async () => {
      const result = await action();
      if (result.success) router.refresh();
      else setActionError(result.error ?? "That change could not be saved.");
    });
  }

  return <>
    <div className="page-intro">
      <div>
        <div className="eyebrow">Training log</div>
        <h1 className="page-title">Today</h1>
        <p className="page-subtitle">A plan is a starting point. Make the workout fit the equipment, time, and energy you have right now.</p>
      </div>
      <div className="date-line">{new Date(`${data.today}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
    </div>

    <div className="rule-label">Training rhythm</div>
    <div className="streak-strip">
      {data.week.map((day) => <div className={`day-dot${day.complete ? " complete" : ""}${day.today ? " today" : ""}`} key={day.date}>{day.label}</div>)}
    </div>

    <section className="workout-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{isStarted ? "Active workout" : "Up next"}</div>
          <h2 className="panel-title">{selectedTemplate?.name ?? "Build a session"}</h2>
        </div>
        <div className="workout-progress"><strong>{completedSets}</strong> / {totalSets || "-"}<span>sets</span></div>
      </div>

      <div className="template-row" aria-label="Workout template">
        {data.templates.map((template) => <button
          aria-pressed={template.id === data.selectedTemplateId}
          className={`template-option${template.id === data.selectedTemplateId ? " active" : ""}`}
          disabled={pending || isStarted || isComplete}
          key={template.id}
          onClick={() => refreshAfter(() => chooseTemplate({ templateId: template.id, sessionDate: data.today }))}
        >{template.name}</button>)}
      </div>
      {isStarted && <p className="activity-note">This workout has its own plan now. Swap or add movements without changing your template.</p>}
      {actionError && <p className="error-text panel-error" aria-live="polite">{actionError}</p>}

      {data.exercises.length ? <div className="exercise-list">
        {data.exercises.map((exercise) => <ExerciseRow
          data={exercise}
          key={exercise.sessionExerciseId ?? exercise.id}
          onSwap={isStarted && !isComplete ? () => setSwapExercise(exercise) : undefined}
          sessionId={data.session?.id}
          started={isStarted}
          unit={data.profile.preferredUnit}
        />)}
      </div> : <div className="empty-state inverse-empty"><strong>No movements here yet.</strong>Add exercises from Library, or start and build this session as you go.</div>}

      {isStarted && !isComplete && <button className="add-exercise" onClick={() => setAddExerciseOpen(true)}><Plus size={16} /> Add an exercise</button>}

      <div className="workout-footer">
        <span className="panel-kicker">{isComplete ? "Completed. Your set log stays editable." : isStarted ? "Every change saves as you go." : "Choose a template, then start when you are ready."}</span>
        {isComplete ? <span className="session-complete"><Check size={15} /> Complete</span> : isStarted ? <button className="button citrus" disabled={pending} onClick={() => refreshAfter(() => finishSession(data.session!.id))}>Finish workout</button> : <button className="button citrus" disabled={pending || !selectedTemplate} onClick={() => refreshAfter(() => startSession({ templateId: data.selectedTemplateId!, sessionDate: data.today }))}><Dumbbell size={16} /> Start workout</button>}
      </div>
    </section>

    <section className="panel capture-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">Fast capture</div>
          <h2 className="panel-title">Log from a note</h2>
        </div>
        <button className="button small secondary" onClick={() => setLogOpen(true)}><Sparkles size={14} /> Open composer</button>
      </div>
      <p className="page-subtitle">Type or dictate a quick workout note. It can start a workout and fill the matching sets for you.</p>
    </section>

    <section className="panel">
      <div className="rule-label">Other check-ins</div>
      <div className="quick-grid">
        <button className="quick-card" onClick={() => setMealOpen(true)}>
          <span><h3>Log a meal</h3><p>Estimate macros, then adjust before saving.</p></span>
          <span className="icon-button"><Plus size={17} /></span>
        </button>
        <button className="quick-card" onClick={() => setBodyOpen(true)}>
          <span><h3>Body check-in</h3><p>Weight, height, and an optional body-fat note.</p></span>
          <span className="icon-button"><Plus size={17} /></span>
        </button>
      </div>
    </section>

    {logOpen && <WorkoutLogSheet data={data} onClose={() => setLogOpen(false)} />}
    {mealOpen && <MealSheet onClose={() => setMealOpen(false)} />}
    {bodyOpen && <BodySheet data={data} onClose={() => setBodyOpen(false)} />}
    {addExerciseOpen && data.session && <AddExerciseSheet data={data} onClose={() => setAddExerciseOpen(false)} />}
    {swapExercise && <SwapExerciseSheet data={data} exercise={swapExercise} onClose={() => setSwapExercise(null)} />}
  </>;
}

function ExerciseRow({ data, unit, sessionId, started, onSwap }: { data: ExerciseData; unit: "kg" | "lb"; sessionId?: string; started: boolean; onSwap?: () => void }) {
  const router = useRouter();
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

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

  function persist(set: LocalSet) {
    if (!sessionId) return;
    const weight = set.weight === "" ? null : Number(set.weight);
    const reps = set.reps === "" ? null : Number(set.reps);
    if ((weight !== null && !Number.isFinite(weight)) || (reps !== null && !Number.isInteger(reps))) {
      setError("Use a valid weight and whole-number reps.");
      return;
    }
    setError("");
    startSaving(async () => {
      const result = await saveSet({ sessionId, exerciseId: data.id, setNumber: set.setNumber, weight, reps, unit, completed: set.completed });
      if (result.success) {
        setSets((current) => current.map((item) => item.setNumber === set.setNumber ? { ...item, saved: true } : item));
        router.refresh();
      } else setError(result.error ?? "This set could not be saved.");
    });
  }

  function addSet() {
    setSets((current) => [...current, { setNumber: Math.max(0, ...current.map((set) => set.setNumber)) + 1, weight: "", reps: "", completed: false, saved: false }]);
  }

  const bestPrevious = Math.max(...data.lastSession.map((set) => set.weightKg ?? 0), 0);
  return <div className="exercise-row">
    <div className="exercise-heading">
      <div>
        <div className="exercise-name">{data.name}</div>
        <div className="exercise-muscle">{data.primaryMuscle}{data.targetReps ? ` · ${data.targetSets ?? ""} × ${data.targetReps}` : ""}</div>
      </div>
      <div className="exercise-actions">
        {data.lastSession.length > 0 && <div className="last-reference">Last <strong>{data.lastSession.map((set) => `${set.weightKg ? valueInUnit(set.weightKg, unit)?.toFixed(0) : "-"}${set.weightKg ? unit : ""} x ${set.reps ?? "-"}`).join(", ")}</strong></div>}
        {onSwap && <button className="exercise-action" onClick={onSwap}><ArrowRightLeft size={13} /> Swap</button>}
      </div>
    </div>
    {started ? <>
      <div className="set-labels" aria-hidden="true"><span>Set</span><span>Weight</span><span>Reps</span><span>Done</span></div>
      {sets.map((set, index) => {
        const isPr = set.completed && Number(set.weight) > valueInUnit(bestPrevious, unit)!;
        return <div className="set-line" key={set.setNumber}>
          <span className="set-number">{set.setNumber}</span>
          <input className="field tiny-field" inputMode="decimal" aria-label={`${data.name} set ${set.setNumber} weight`} placeholder={unit} value={set.weight} onChange={(event) => update(index, { weight: event.target.value })} onBlur={() => persist(sets[index])} />
          <input className="field tiny-field" inputMode="numeric" aria-label={`${data.name} set ${set.setNumber} reps`} placeholder="reps" value={set.reps} onChange={(event) => update(index, { reps: event.target.value })} onBlur={() => persist(sets[index])} />
          <button className={`complete-button${set.completed ? " done" : ""}`} aria-label={set.completed ? "Mark set incomplete" : "Complete set"} onClick={() => { const next = { ...set, completed: !set.completed }; update(index, next); persist(next); }}><Check size={16} /></button>
          <span className={isPr ? "pr-note" : "save-state"}>{isPr ? "PR" : !set.saved && saving ? "Saving" : !set.saved ? "Unsaved" : ""}</span>
        </div>;
      })}
      {error && <p className="error-text set-error" aria-live="polite">{error}</p>}
      <button className="add-set" onClick={addSet}><Plus size={13} /> Add set</button>
    </> : <p className="panel-kicker">Start the workout to log these sets. You can still change the plan after starting.</p>}
  </div>;
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
      <div className="sheet-heading"><div><div className="eyebrow">Adjust today only</div><h2 className="sheet-title" id="swap-title">Swap {exercise.name}</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      {available.length ? <><p className="notice">Your template will stay unchanged. Blank planned sets move to the new exercise.</p><label className="form-group sheet-field"><span className="form-label">Replacement</span><select className="select-field" value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{available.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.primaryMuscle}</option>)}</select></label>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button" disabled={pending} onClick={swap}>{pending ? "Swapping..." : "Swap exercise"}</button></div></> : <><div className="empty-state"><strong>No unused exercises available.</strong>Add an exercise in Library first, or keep the movements already in this workout.</div><div className="sheet-actions"><button className="button" onClick={onClose}>Close</button></div></>}
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
      <div className="sheet-heading"><div><div className="eyebrow">Make it fit</div><h2 className="sheet-title" id="add-exercise-title">Add an exercise</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      {available.length ? <><p className="notice">This is added to today&apos;s workout only, with three empty sets ready to log.</p><label className="form-group sheet-field"><span className="form-label">Exercise</span><select className="select-field" value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{available.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.primaryMuscle}</option>)}</select></label>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button" disabled={pending} onClick={add}>{pending ? "Adding..." : "Add exercise"}</button></div></> : <><div className="empty-state"><strong>Everything in your library is already in this workout.</strong>Use Library to create another movement.</div><div className="sheet-actions"><button className="button" onClick={onClose}>Close</button></div></>}
    </div>
  </div>;
}

function WorkoutLogSheet({ data, onClose }: { data: TodayData; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<WorkoutParse | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const speech = useSpeechInput(setText);

  function parse() {
    setError("");
    startTransition(async () => {
      const result = await parseWorkoutText(text);
      if (result.success) setParsed(result.data);
      else setError(result.error);
    });
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
        if (!mapped) {
          setError(`Map “${parsedExercise.name}” to an exercise in your library before saving.`);
          return;
        }
        const saved = await logQuickSets({
          sessionId,
          exerciseId: mapped.id,
          defaultUnit: data.profile.preferredUnit,
          sets: parsedExercise.sets.map((set) => ({ ...set, unit: set.unit ?? undefined })),
        });
        if (!saved.success) {
          setError(saved.error ?? "One or more sets could not be saved.");
          return;
        }
      }
      router.refresh();
      onClose();
    });
  }

  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="workout-note-title">
    <div className="sheet">
      <div className="sheet-heading"><div><div className="eyebrow">Review before saving</div><h2 className="sheet-title" id="workout-note-title">Workout note</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      {!parsed ? <>
        <p className="sheet-intro">A quick note can start this workout for you. Example: “bench press, 3 sets of 8 at 65 kg”.</p>
        <div className="parse-box"><textarea className="field" placeholder="What did you do?" value={text} onChange={(event) => setText(event.target.value)} /><button className={`icon-button mic-button${speech.listening ? " listening" : ""}`} onClick={speech.toggle} aria-label={speech.supported ? "Use microphone" : "Speech input unsupported"} disabled={!speech.supported}><Mic size={17} /></button></div>
        {speech.error && <p className="error-text">{speech.error}</p>}
        {!speech.supported && <p className="status-text">Voice input is unavailable in this browser. Text entry still works.</p>}
        {error && <p className="error-text" aria-live="polite">{error}</p>}
        <div className="sheet-actions"><button className="button" disabled={pending || !text.trim()} onClick={parse}>{pending ? "Reading note..." : "Review workout"}</button></div>
      </> : <>
        <p className="notice">Confirm the exercise and numbers. New movements are added to today&apos;s workout, not your template.</p>
        {error && <p className="error-text" aria-live="polite">{error}</p>}
        <div className="review-table">
          {parsed.exercises.map((exercise, exerciseIndex) => <div className="review-exercise" key={`${exercise.name}-${exerciseIndex}`}>
            <label className="form-label">Exercise</label>
            <select className="select-field" value={exercise.name} onChange={(event) => setParsed({ ...parsed, exercises: parsed.exercises.map((item, index) => index === exerciseIndex ? { ...item, name: event.target.value } : item) })}>
              <option value={exercise.name}>{exercise.name} (parsed)</option>
              {data.library.map((option) => <option value={option.name} key={option.id}>{option.name}</option>)}
            </select>
            {exercise.sets.map((set, setIndex) => <div className="review-row" key={setIndex}>
              <span className="set-number">{setIndex + 1}</span>
              <input className="field tiny-field" type="number" inputMode="decimal" aria-label={`Set ${setIndex + 1} weight`} placeholder="weight" value={set.weight ?? ""} onChange={(event) => setParsed({ ...parsed, exercises: parsed.exercises.map((item, index) => index === exerciseIndex ? { ...item, sets: item.sets.map((current, innerIndex) => innerIndex === setIndex ? { ...current, weight: event.target.value === "" ? null : Number(event.target.value) } : current) } : item) })} />
              <input className="field tiny-field" type="number" inputMode="numeric" aria-label={`Set ${setIndex + 1} reps`} placeholder="reps" value={set.reps ?? ""} onChange={(event) => setParsed({ ...parsed, exercises: parsed.exercises.map((item, index) => index === exerciseIndex ? { ...item, sets: item.sets.map((current, innerIndex) => innerIndex === setIndex ? { ...current, reps: event.target.value === "" ? null : Number(event.target.value) } : current) } : item) })} />
              <span className="unit-label">{set.unit ?? data.profile.preferredUnit}</span>
            </div>)}
          </div>)}
        </div>
        <div className="sheet-actions"><button className="button ghost" onClick={() => setParsed(null)}>Back</button><button className="button" disabled={pending} onClick={confirm}>{pending ? "Saving..." : "Add completed sets"}</button></div>
      </>}
    </div>
  </div>;
}

function MealSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<MealParse | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const speech = useSpeechInput(setText);
  function parse() { setError(""); startTransition(async () => { const result = await parseMealText(text); if (result.success) setParsed(result.data); else setError(result.error); }); }
  function confirm() { if (!parsed) return; startTransition(async () => { const result = await confirmMeal({ ...parsed, rawInput: text }); if (result.success) onClose(); else setError(result.error); }); }
  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="meal-title"><div className="sheet"><div className="sheet-heading"><div><div className="eyebrow">Directional estimate</div><h2 className="sheet-title" id="meal-title">Log a meal</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>{!parsed ? <><div className="parse-box"><textarea className="field" placeholder="e.g. chicken bowl with rice and vegetables" value={text} onChange={(event) => setText(event.target.value)} /><button className={`icon-button mic-button${speech.listening ? " listening" : ""}`} onClick={speech.toggle} disabled={!speech.supported} aria-label="Use microphone"><Mic size={17} /></button></div>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button" onClick={parse} disabled={pending || !text.trim()}>{pending ? "Estimating..." : "Review estimate"}</button></div></> : <><div className="notice">Estimated values for directional awareness, not food-scale accuracy.</div><div className="macro-grid">{(["calories", "protein", "carbs", "fat"] as const).map((key) => <label className="macro-box" key={key}><span className="macro-label">{key === "calories" ? "kcal" : key}</span><input className="field tiny-field" type="number" value={parsed[key]} onChange={(event) => setParsed({ ...parsed, [key]: Number(event.target.value) })} /></label>)}</div><p className="status-text">{parsed.summary}</p>{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={() => setParsed(null)}>Back</button><button className="button" disabled={pending} onClick={confirm}>{pending ? "Saving..." : "Confirm meal"}</button></div></>}</div></div>;
}

function BodySheet({ data, onClose }: { data: TodayData; onClose: () => void }) {
  const [unit, setUnit] = useState<"kg" | "lb">(data.profile.preferredUnit);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState(data.profile.heightCm ? String(data.profile.heightCm) : "");
  const [bodyFat, setBodyFat] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const bmi = calculateBmi(kgFromUnit(Number(weight), unit) ?? 0, Number(height) || null);
  function submit() { startTransition(async () => { const result = await saveBodyMetric({ metricDate: data.today, weight: Number(weight), unit, heightCm: height ? Number(height) : null, bodyFatPercent: bodyFat ? Number(bodyFat) : null }); if (result.success) onClose(); else setError(result.error); }); }
  return <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="body-title"><div className="sheet"><div className="sheet-heading"><div><div className="eyebrow">Keep a useful baseline</div><h2 className="sheet-title" id="body-title">Body check-in</h2></div><button className="sheet-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div><div className="form-grid"><label className="form-group"><span className="form-label">Weight</span><div className="unit-input"><input className="field" type="number" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="72.5" /><select className="select-field" value={unit} onChange={(event) => setUnit(event.target.value as "kg" | "lb")}><option>kg</option><option>lb</option></select></div></label><label className="form-group"><span className="form-label">Height (cm)</span><input className="field" type="number" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="180" /></label><label className="form-group"><span className="form-label">Body fat % (optional)</span><input className="field" type="number" value={bodyFat} onChange={(event) => setBodyFat(event.target.value)} placeholder="18" /></label></div>{bmi ? <p className="notice spaced-notice">Calculated BMI: <strong>{bmi.toFixed(1)}</strong>. This snapshot uses the height entered today.</p> : <p className="status-text spaced-notice">Add height to calculate BMI. Your saved height is prefilled when available.</p>}{error && <p className="error-text">{error}</p>}<div className="sheet-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button" disabled={pending || !weight} onClick={submit}>{pending ? "Saving..." : "Save check-in"}</button></div></div></div>;
}
