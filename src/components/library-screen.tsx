"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  addExerciseToTemplate,
  archiveExercise,
  createExercise,
  createTemplate,
  deleteTemplate,
  editExercise,
  moveTemplate,
  removeExerciseFromTemplate,
  renameTemplate,
  saveProfile,
} from "@/lib/actions/library";
import { getLibraryData } from "@/lib/queries/library";
import { activityLevels, calculateBmr, calculateCalorieTargets, calculateTdee, kgFromUnit, valueInUnit, type ActivityLevel, type CalorieGoal } from "@/lib/metrics";

type LibraryData = Awaited<ReturnType<typeof getLibraryData>>;
type LibraryTab = "templates" | "exercises" | "settings";

export function LibraryScreen({ data }: { data: LibraryData }) {
  const [tab, setTab] = useState<LibraryTab>("templates");
  const [selectedTemplateId, setSelectedTemplateId] = useState(data.templates[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [templateName, setTemplateName] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [muscle, setMuscle] = useState("");
  const [exerciseUnit, setExerciseUnit] = useState<"kg" | "lb">("kg");
  const [height, setHeight] = useState(data.profile?.heightCm ? String(data.profile.heightCm) : "");
  const [profileUnit, setProfileUnit] = useState<"kg" | "lb">(data.profile?.preferredUnit ?? "kg");
  const [sex, setSex] = useState<"male" | "female" | "">(data.profile?.sex ?? "");
  const [age, setAge] = useState(() => data.profile?.birthYear ? String(new Date().getFullYear() - data.profile.birthYear) : "");
  const [tdeeWeight, setTdeeWeight] = useState(() => {
    const value = valueInUnit(data.latestWeightKg, data.profile?.preferredUnit ?? "kg");
    return value === null ? "" : String(Math.round(value * 10) / 10);
  });
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | "">(data.profile?.activityLevel ?? "");
  const [calorieGoal, setCalorieGoal] = useState<CalorieGoal | "">(data.profile?.calorieGoal ?? "");
  const [exerciseSearch, setExerciseSearch] = useState("");

  const selectedTemplate = data.templates.find((template) => template.id === selectedTemplateId) ?? data.templates[0];
  const activeExerciseCount = data.exercises.filter((exercise) => !exercise.archived).length;
  const bmr = useMemo(() => {
    const weightKg = kgFromUnit(Number(tdeeWeight), profileUnit);
    const heightCm = Number(height) || data.profile?.heightCm;
    const ageNum = age ? Number(age) : null;
    if (!weightKg || !heightCm || !ageNum || !sex) return null;
    return calculateBmr(weightKg, heightCm, ageNum, sex);
  }, [tdeeWeight, profileUnit, height, age, sex, data.profile?.heightCm]);
  const tdee = bmr !== null && activityLevel ? calculateTdee(bmr, activityLevel) : null;
  const calorieTargets = tdee === null ? [] : calculateCalorieTargets(tdee);
  const selectedCalorieTarget = calorieTargets.find((target) => target.value === calorieGoal);
  const filteredExercises = data.exercises.filter((exercise) => {
    const query = exerciseSearch.trim().toLowerCase();
    return !query || `${exercise.name} ${exercise.primaryMuscle}`.toLowerCase().includes(query);
  });

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) window.alert(result.error);
      else window.location.reload();
    });
  }

  function renameSelectedTemplate() {
    if (!selectedTemplate) return;
    const name = window.prompt("Rename template", selectedTemplate.name);
    if (name?.trim()) run(() => renameTemplate(selectedTemplate.id, { name }));
  }

  function editLibraryExercise(exercise: LibraryData["exercises"][number]) {
    const name = window.prompt("Exercise name", exercise.name);
    if (!name?.trim()) return;
    const primaryMuscle = window.prompt("Primary muscle", exercise.primaryMuscle);
    if (!primaryMuscle?.trim()) return;
    const defaultUnit = window.prompt("Default unit (kg or lb)", exercise.defaultUnit)?.toLowerCase();
    if (defaultUnit !== "kg" && defaultUnit !== "lb") {
      window.alert("Default unit must be kg or lb.");
      return;
    }
    run(() => editExercise(exercise.id, { name, primaryMuscle, secondaryMuscles: exercise.secondaryMuscles, defaultUnit }));
  }

  function saveCalorieNeeds() {
    if (tdee === null || !selectedCalorieTarget) {
      window.alert("Choose a daily calorie target before saving.");
      return;
    }
    const year = new Date().getFullYear();
    const ageNum = Number(age);
    const birthYear = age.trim() && Number.isInteger(ageNum) && ageNum >= 13 && ageNum <= 110 ? year - ageNum : null;
    run(() => saveProfile({ sex: sex || null, birthYear, activityLevel: activityLevel || null, calorieGoal: calorieGoal || null, dailyCalorieGoal: selectedCalorieTarget.calories }));
  }

  return (
    <>
      <div className="page-intro library-page-intro">
        <div>
          <div className="eyebrow">Your setup</div>
          <h1 className="page-title">Library</h1>
          <p className="page-subtitle">The routines and movements that make training feel like yours.</p>
        </div>
        <div className="library-overview" aria-label="Library summary">
          <div><strong>{data.templates.length}</strong><span>routines</span></div>
          <div><strong>{activeExerciseCount}</strong><span>movements</span></div>
        </div>
      </div>

      <div className="library-tabs" role="tablist" aria-label="Library sections">
        {(["templates", "exercises", "settings"] as const).map((option) => (
          <button
            className={`library-tab${tab === option ? " active" : ""}`}
            onClick={() => setTab(option)}
            role="tab"
            aria-selected={tab === option}
            key={option}
          >
            {option === "settings" ? "Profile" : option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>

      {tab === "templates" && (
        <div className="library-workspace">
          <aside className="library-rail" aria-label="Workout routines">
            <div className="library-rail-heading">
              <div>
                <span className="section-caption">Collections</span>
                <span className="library-rail-count">{data.templates.length} saved</span>
              </div>
            </div>
            <div className="library-template-list">
              {data.templates.map((template, index) => (
                <button
                  className={`library-template-option${selectedTemplate?.id === template.id ? " active" : ""}`}
                  onClick={() => setSelectedTemplateId(template.id)}
                  key={template.id}
                >
                  <span className="library-list-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="library-template-copy">
                    <strong>{template.name}</strong>
                    <small>{template.exercises.length} {template.exercises.length === 1 ? "movement" : "movements"}</small>
                  </span>
                  <ChevronRight className="library-list-chevron" size={15} />
                </button>
              ))}
              {!data.templates.length && <div className="library-rail-empty">Your first routine starts here.</div>}
            </div>
            <form
              className="library-create"
              onSubmit={(event) => {
                event.preventDefault();
                if (templateName.trim()) run(() => createTemplate({ name: templateName }));
              }}
            >
              <input
                className="field"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="New routine"
                aria-label="New routine name"
              />
              <button className="icon-button" disabled={pending || !templateName.trim()} aria-label="Add routine">
                <Plus size={17} />
              </button>
            </form>
          </aside>

          {selectedTemplate ? (
            <section className="library-detail" aria-label={`${selectedTemplate.name} routine`}>
              <div className="library-detail-heading">
                <div>
                  <div className="eyebrow">Routine {String(data.templates.findIndex((template) => template.id === selectedTemplate.id) + 1).padStart(2, "0")}</div>
                  <h2>{selectedTemplate.name}</h2>
                  <p>{selectedTemplate.exercises.length} {selectedTemplate.exercises.length === 1 ? "movement" : "movements"} in this routine</p>
                </div>
                <div className="library-detail-actions">
                  <button className="button small ghost" disabled={pending || data.templates.findIndex((template) => template.id === selectedTemplate.id) === 0} onClick={() => run(() => moveTemplate(selectedTemplate.id, "up"))} aria-label="Move routine up"><ArrowUp size={13} /></button>
                  <button className="button small ghost" disabled={pending || data.templates.findIndex((template) => template.id === selectedTemplate.id) === data.templates.length - 1} onClick={() => run(() => moveTemplate(selectedTemplate.id, "down"))} aria-label="Move routine down"><ArrowDown size={13} /></button>
                  <button className="button small ghost" onClick={renameSelectedTemplate}><Pencil size={13} /> Rename</button>
                  <button className="button small ghost danger-button" onClick={() => { if (window.confirm("Delete this template? Historical workouts stay intact.")) run(() => deleteTemplate(selectedTemplate.id)); }} aria-label={`Delete ${selectedTemplate.name}`}><Trash2 size={13} /></button>
                </div>
              </div>

              <div className="library-table" role="table" aria-label="Routine movements">
                <div className="library-table-head" role="row">
                  <span>#</span><span>Movement</span><span>Target</span><span />
                </div>
                {selectedTemplate.exercises.map(({ assignment, exercise }, index) => (
                  <div className="library-table-row" role="row" key={assignment.id}>
                    <span className="library-list-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="library-movement-copy">
                      <strong>{exercise.name}</strong>
                      <small>{exercise.primaryMuscle}{exercise.archived ? " · Archived" : ""}</small>
                    </div>
                    <span className="library-target">{assignment.targetSets ?? "-"}<small> sets</small><span> x </span>{assignment.targetReps ?? "-"}<small> reps</small></span>
                    <button className="icon-button subtle" onClick={() => run(() => removeExerciseFromTemplate(assignment.id))} aria-label={`Remove ${exercise.name}`}><X size={15} /></button>
                  </div>
                ))}
                {!selectedTemplate.exercises.length && <div className="library-table-empty"><strong>A quiet start.</strong>Add movements below to shape this routine.</div>}
              </div>

              <div className="library-add-movement">
                <div>
                  <span className="section-caption">Add movement</span>
                  <p>Only active movements not already in this routine are shown.</p>
                </div>
                <select
                  className="select-field"
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) run(() => addExerciseToTemplate(selectedTemplate.id, event.target.value));
                  }}
                  aria-label="Add movement to routine"
                >
                  <option value="">Choose from library...</option>
                  {data.exercises.filter((exercise) => !exercise.archived && !selectedTemplate.exercises.some(({ exercise: assigned }) => assigned.id === exercise.id)).map((exercise) => <option value={exercise.id} key={exercise.id}>{exercise.name} · {exercise.primaryMuscle}</option>)}
                </select>
              </div>
            </section>
          ) : (
            <section className="library-detail library-detail-empty"><strong>Create a routine</strong><p>Use the field on the left to give your first routine a name.</p></section>
          )}
        </div>
      )}

      {tab === "exercises" && (
        <section className="library-catalog">
          <div className="library-catalog-heading">
            <div>
              <div className="eyebrow">Movement library</div>
              <h2>Every movement, in one place.</h2>
              <p>Keep the catalog focused. Archived movements stay available in old routines without appearing in new ones.</p>
            </div>
            <div className="library-search">
              <Search size={16} />
              <input className="field" value={exerciseSearch} onChange={(event) => setExerciseSearch(event.target.value)} placeholder="Search movements" aria-label="Search movements" />
            </div>
          </div>
          <div className="library-catalog-body">
            <div className="library-catalog-list">
              <div className="library-catalog-list-heading"><span>{filteredExercises.length} results</span><span>Name · focus · unit</span></div>
              {filteredExercises.map((exercise, index) => (
                <div className={`library-catalog-row${exercise.archived ? " archived" : ""}`} key={exercise.id}>
                  <span className="library-list-index">{String(index + 1).padStart(2, "0")}</span>
                  <div className="library-movement-copy"><strong>{exercise.name}</strong><small>{exercise.primaryMuscle}{exercise.archived ? " · Archived" : ""}</small></div>
                  <span className="library-unit">{exercise.defaultUnit}</span>
                  <div className="library-row-actions">
                    <button className="button small ghost" onClick={() => editLibraryExercise(exercise)}><Pencil size={13} /> Edit</button>
                    <button className="icon-button subtle" onClick={() => run(() => archiveExercise(exercise.id, !exercise.archived))} aria-label={`${exercise.archived ? "Restore" : "Archive"} ${exercise.name}`}>{exercise.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                  </div>
                </div>
              ))}
              {!filteredExercises.length && <div className="library-table-empty"><strong>No movements found.</strong>Try a different search or add a new movement.</div>}
            </div>
            <form
              className="library-add-exercise"
              onSubmit={(event) => {
                event.preventDefault();
                if (exerciseName.trim() && muscle.trim()) run(() => createExercise({ name: exerciseName, primaryMuscle: muscle, secondaryMuscles: [], defaultUnit: exerciseUnit }));
              }}
            >
              <div className="eyebrow">New movement</div>
              <h3>Add to the library</h3>
              <p>It will be ready to use in any routine.</p>
              <label className="form-group"><span className="form-label">Name</span><input className="field" value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="Cable row" /></label>
              <label className="form-group"><span className="form-label">Primary focus</span><input className="field" value={muscle} onChange={(event) => setMuscle(event.target.value)} placeholder="Back" /></label>
              <label className="form-group"><span className="form-label">Default unit</span><select className="select-field" value={exerciseUnit} onChange={(event) => setExerciseUnit(event.target.value as "kg" | "lb")}><option value="kg">Kilograms</option><option value="lb">Pounds</option></select></label>
              <button className="button" disabled={pending || !exerciseName.trim() || !muscle.trim()}><Plus size={14} /> Add movement</button>
            </form>
          </div>
        </section>
      )}

      {tab === "settings" && (
        <section className="library-settings">
          <div className="library-settings-heading">
            <div className="eyebrow">Personal details</div>
            <h2>Profile settings</h2>
            <p>These defaults shape the way numbers appear while you train. Your history remains stored in canonical kilograms and centimeters.</p>
          </div>
          <form
            className="settings-group"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => saveProfile({ heightCm: height ? Number(height) : undefined, preferredUnit: profileUnit }));
            }}
          >
            <label className="settings-row"><span><strong>Height</strong><small>Used for body metric context</small></span><span className="settings-input"><input className="field" value={height} onChange={(event) => setHeight(event.target.value)} placeholder="180" inputMode="decimal" /><em>cm</em></span></label>
            <label className="settings-row"><span><strong>Weight unit</strong><small>Used for new entries and targets</small></span><select className="select-field settings-select" value={profileUnit} onChange={(event) => setProfileUnit(event.target.value as "kg" | "lb")}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></label>
            <div className="settings-actions"><span className="status-text">Changes apply to future entries.</span><button className="button" disabled={pending}>Save profile</button></div>
          </form>

          <div className="library-settings-heading tdee-heading">
            <div className="eyebrow">Calorie needs</div>
            <h2>Daily energy estimate</h2>
            <p>An estimate of what you burn each day, using the Mifflin-St Jeor equation.</p>
          </div>
          <form
            className="settings-group"
            onSubmit={(event) => {
              event.preventDefault();
              saveCalorieNeeds();
            }}
          >
            <div className="settings-row"><span><strong>Sex</strong><small>Required by the estimation equation</small></span><div className="settings-segmented" role="radiogroup" aria-label="Sex">{(["female", "male"] as const).map((option) => <button type="button" key={option} className={sex === option ? "active" : ""} onClick={() => setSex(option)} role="radio" aria-checked={sex === option}>{option === "female" ? "Female" : "Male"}</button>)}</div></div>
            <label className="settings-row"><span><strong>Age</strong><small>Stored as your birth year so it never goes stale</small></span><span className="settings-input"><input className="field" value={age} onChange={(event) => setAge(event.target.value)} placeholder="30" inputMode="numeric" /><em>years</em></span></label>
            <label className="settings-row"><span><strong>Current weight</strong><small>{data.latestWeightKg ? "From your latest check-in - adjust to preview" : "Used for the estimate only"}</small></span><span className="settings-input"><input className="field" value={tdeeWeight} onChange={(event) => setTdeeWeight(event.target.value)} placeholder="72.5" inputMode="decimal" /><em>{profileUnit}</em></span></label>
            <label className="settings-row"><span><strong>Activity level</strong><small>Shapes the daily multiplier</small></span><select className="select-field settings-select" value={activityLevel} onChange={(event) => setActivityLevel(event.target.value as ActivityLevel | "")}><option value="">Choose...</option>{activityLevels.map((level) => <option value={level.value} key={level.value}>{level.label} ({level.hint})</option>)}</select></label>
            {tdee !== null ? <><div className="tdee-result"><div className="tdee-total"><strong>{tdee.toLocaleString()}</strong><span>kcal / day</span></div><div className="tdee-meta">Resting burn <strong>{bmr!.toLocaleString()}</strong> kcal</div></div><div className="tdee-targets" role="group" aria-label="Choose a daily calorie goal">{calorieTargets.map((target) => <button type="button" className={`tdee-target${calorieGoal === target.value ? " active" : ""}`} aria-pressed={calorieGoal === target.value} key={target.value} onClick={() => setCalorieGoal(target.value)}><span>{target.label}</span><strong>{target.calories.toLocaleString()}</strong></button>)}</div></> : <p className="status-text tdee-note">Fill in sex, age, weight and activity level to see your daily estimate.</p>}
            <div className="settings-actions"><span className="status-text">{selectedCalorieTarget ? `${selectedCalorieTarget.label} is selected.` : "Choose a goal above to save your guide."}</span><button className="button" disabled={pending || tdee === null || !selectedCalorieTarget}>Save calorie needs</button></div>
          </form>
        </section>
      )}
    </>
  );
}
