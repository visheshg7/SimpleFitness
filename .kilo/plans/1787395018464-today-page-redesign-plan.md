# Today Page Redesign Plan

## Context
`Today` (`src/components/today-screen.tsx`, route `src/app/(journal)/today/page.tsx`, data `src/lib/queries/today.ts`) currently shows: greeting `Good morning! / Let's get stronger today.`, a `day-strip` with left/right chevrons, a `Select workout:` pill row (`.routine-section` + `.template-row`), the AI capture block, the `workout-panel` (prestart list vertical, active set logging), then the `quick-grid` (Log a meal / Body check-in), then `DailyFuelCard`. Fuel card shows `kcal` guide + three `MacroRow` bars sized as share of total kcal (not vs body-weight targets).

User requests (6 items, Aug 22 2026):
1. Header → `Hi [first name], it's [workout name] day.` with muted underlined tappable workout.
2. Remove chevrons from day strip.
3. Move `Log a meal` + `Body check-in` below day strip (above workout).
4. Remove `Select workout` strip; elegant picker.
5. Prestart exercises: 2-column grid (6 items → 3 rows) not vertical stack.
6. Daily fuel: Apple/Google ring style; protein target `1.8–2.2 g/kg`, fat `0.5 g/kg` from latest body weight, carbs no target.

No schema migration desired; derive protein/fat targets from existing `body_metrics.weightKg`. All decisions below were confirmed via questions: short workout name, hero-sheet picker, latest-metric weight source, order `Header → Day strip → QuickGrid → WorkoutPanel → Capture → DailyFuel`.

## Product Decisions (resolved)
- **First name source:** `data.profile.displayName` (nullable `text`). Helper `firstName(displayName)` → `trim().split(/\s+/)[0]`; fallback `"there"` if null/empty/whitespace-only. Same fallback for `viewingToday===false`? For non-today selected date keep personalized hero but add muted date subline: e.g. `Hi Adam, it's Push day.  · Monday, Aug 18` so context not lost. If non-today and no template (`selectedTemplate===null`) show `Hi Adam, it's Rest day.` with picker still opening.
- **Short workout name:** `shortWorkoutName(full: string): string` → if `full` contains ` - `, take substring after *last* ` - `, strip parenthetical `\(.*\)`, trim. Else strip parenthetical and trim verbatim. Examples: `"Day 1 - Push (Chest Focus)" → "Push"`, `"Push" → "Push"`, `"Day 5 - Back Thickness (Back Priority)" → "Back Thickness"`. Use short name in hero, full `template.name` in picker rows and `workout-subtitle`. Hero word `Push` is the only underlined tappable span.
- **Picker interaction:** Hero underlined word opens centered sheet (reuse `.sheet` / `centered-sheet`). Picker rows: `WorkoutPickerRow` with `name`, full name subtitle, position indicator, checkmark when `id===selectedTemplateId`. Clicking a row calls same `chooseTemplate({templateId, sessionDate: data.today})` via existing `refreshAfter` pattern. Disabled while `pending || isStarted || isComplete` — show muted row + helper text `"Workout locked after start"` and disable sheet confirm. Keep `useTransition` pending state. Alternatives (inline dropdown/popover) rejected.
- **Day strip:** Remove both `.strip-chevron` buttons and `scrollDays()` + `stripRef` scroll helper. Keep `streak-strip` as `display:flex; overflow-x:auto; scroll-snap-type:x proximity; -webkit-overflow-scrolling:touch; scrollbar-width:none` with fade edges on mobile. Keep keyboard arrow handling? Keep existing `switchDay` logic, drop chevron handlers.
- **Page order (new vertical stack):**
  1. `page-intro today-intro` (personalized hero)
  2. `day-strip` (chevron-free)
  3. `quick-grid` section (`Log a meal`, `Body check-in`)
  4. `workout-panel` (includes `Start workout` / progress)
  5. `WorkoutCapture` (AI block)
  6. `DailyFuelCard` (redesigned)
  Order change is pure JSX reorder; no data flow change except fuel props.
- **Prestart 2-column grid:** Desktop `grid-template-columns: repeat(2, minmax(0,1fr))`. At `max-width: 760px` keep 2 columns down to `380px` with compact row sizing; below `380px` collapse to 1 column to avoid overflow on 320px devices. 6 exercises → 3 rows; 5 exercises → 3 rows (last row 1 item). Each `PrestartExerciseRow` keeps button semantics + `ExerciseDetailsSheet` open on click. No change to `isStarted` list (`.exercise-list` stays single column).
- **Fuel targets:** Query `latestWeightKg: number|null` = most recent `body_metrics.weightKg` for owner (`ORDER BY metricDate DESC LIMIT 1`) added to `getTodayData` return. Pure helpers in `src/lib/metrics.ts`: `proteinTargets(weightKg) => {low: round(weight*1.8,1), high: round(weight*2.2,1)}`, `fatTarget(weightKg) => round(weight*0.5,1)`. `null` → card shows no targets. Card redesign uses those values; kcal ring still driven by `profile.dailyCalorieGoal` unchanged. Carbs shows grams + `% of kcal` with no target ring/bar.

## Implementation Plan
1. **Helpers in `src/lib/metrics.ts`.**
   - Add `firstName(displayName)` + `shortWorkoutName(templateName)` + `proteinTargets(weightKg)` / `fatTarget(weightKg)` (or single `macroTargets(weightKg)`). Pure, unit-testable. Add `src/lib/metrics.test.ts` cases: first-name fallback, short-name parsing (`Push`, `Day 1 - Push (Chest Focus)`, no-dash, empty), target math (e.g. 70 kg → 126.0/154.0 protein, 35.0 fat; 0/null → null; rounding to 1 dec).

2. **Extend read model `src/lib/queries/today.ts`.**
   - Add parallel query `db.select({weightKg: bodyMetrics.weightKg}).from(bodyMetrics).where(eq(bodyMetrics.ownerId, ownerId)).orderBy(desc(bodyMetrics.metricDate)).limit(1)` to the existing `Promise.all`. Import `desc`, `bodyMetrics`.
   - Return `latestWeightKg: latestMetric[0]?.weightKg ?? null` alongside existing fields. No aggregation change. Keep `dailyFuel` derivation. Do not compute targets here — keep query serializable.

3. **Rewrite hero + picker in `src/components/today-screen.tsx`.**
   - Remove current `greeting`/`Let's get stronger` (`viewingToday ? greeting : ...`). Replace `page-intro` with: `Hi {firstName}, it's <button class="hero-workout-picker" …>{shortName}</button> day.` plus optional date subline when `!viewingToday`. Button has muted dashed underline, `ChevronDown` 12–14px hint, `aria-label="Change workout, currently {fullName}"`, `aria-haspopup="dialog"`. Disabled visual when `isStarted||isComplete` but still focusable? Spec: disabled selection after start → keep button disabled or sheet opens with disabled rows + explanatory text. Implement `const [workoutPickerOpen, setWorkoutPickerOpen]=useState(false)`.
   - Delete entire `routine-section` block (heading + `template-row`). Add new `WorkoutPickerSheet` component (inline file or `src/components/workout-picker-sheet.tsx`): centered sheet, list of `data.templates` sorted by `position`, rows showing full `template.name`, active check (`Check` 14px), disabled state (`!pending && !isStarted && !isComplete` required). On select `refreshAfter(()=>chooseTemplate(...))` then close. Preserve `pending` disable.
   - Remove chevrons: delete both `strip-chevron` buttons, `ChevronLeft`/`ChevronRight` imports (keep if used elsewhere), `scrollDays` function, `stripRef` scrollBy helper (keep ref only if needed for `scrollIntoView` centering). Keep `selectedDayRef` auto-scroll. Adjust JSX to `<div class="streak-strip" …>` only.
   - Reorder JSX: after `day-strip`, render `<section class="panel quick-actions-panel"><div class="quick-grid">…</div></section>` (move existing quick-grid block up). Keep its handlers `setMealOpen/setBodyOpen`. Leave `WorkoutCapture` after `workout-panel`, before `DailyFuelCard`. So order is hero → strip → quick-grid → workout-panel → WorkoutCapture → DailyFuelCard.
   - Wire fuel: compute `proteinTargets`/`fatTarget` from `data.latestWeightKg` (in component or memoized) and pass to `DailyFuelCard`.

4. **Prestart 2-column grid styles + markup `src/components/today-screen.tsx` + `src/app/globals.css`.**
   - Change `.exercise-plan-list` from `display:grid; gap:8px` to `gap:10px; grid-template-columns: repeat(2, minmax(0,1fr))`. Keep semantic `aria-label` wrapper. Ensure `PrestartExerciseRow` button fills cell (`width:100%; height:100%`).
   - Responsive: `@media (max-width:760px){ .exercise-plan-list{grid-template-columns:repeat(2, minmax(0,1fr))} .exercise-plan-row{padding:11px 12px} .exercise-plan-target{font-size:11px} } @media (max-width:380px){ .exercise-plan-list{grid-template-columns:1fr} }`. Test 6-item layout → 3 rows.
   - No change to `.exercise-list` active state.

5. **Redesign `src/components/daily-fuel-card.tsx` (Apple/Google ring inspiration).**
   - New props: `latestWeightKg?: number|null` or precomputed `proteinLow/high, fatTarget`. Keep backward compat for `src/components/progress-screen.tsx` caller (which will not pass weight → renders without targets). Signature: `DailyFuelCard({data, targetCalories, targetLabel, latestWeightKg, subtitle, emptyMessage, footer, onLogMeal, onOpenDetails})`.
   - Layout: header unchanged; body: top `fuel-guide` (kcal ring) unchanged but optionally restyled as circular ring if desired — keep linear track to minimize risk unless designer wants ring. Lower section: `macro-rings` grid 3 cols (protein | carbs | fat). Each cell:
     - Protein: title `Protein`, value `X g`, sub `1.8–2.2 g/kg · 126–154 g` (when weight exists). Visual: horizontal track with range background `low→high` (accent tint) and marker for current `data.protein`. States: below low → amber, in range → success green, above → coral. Show small helper `Y g to range` or `In target`.
     - Fat: title `Fat`, value `Y g`, sub `0.5 g/kg · 35 g`. Single target marker; track fill `% = min(100, current/target*100)` with overflow indicator if >100%. Show `Z g to go` or `Over by N g`.
     - Carbs: title `Carbs`, value `Z g`, sub `% of energy` or grams only. Muted track showing share of total kcal (`macroCalories`) with no target styling.
   - Null-weight empty: show all three values but tracks in muted `background: var(--surface-strong)` with no fill, plus notice `Add weight in Body check-in to see protein & fat targets.` with link/button opening `BodySheet` (`onOpenBodyCheckIn?` or reuse `onLogMeal` CTA). Don't block kcal ring.
   - Keep `onOpenDetails` clickable body behavior, `onLogMeal` footer CTA, empty states. Add prop `onBodyCheckIn` optional if needed for CTA; else CTA triggers `onLogMeal`? Better pass `onBodyCheckIn` from Today and keep existing `onLogMeal` for meal CTA.
   - Accessibility: `aria-label` on each macro cell with grams + target context.
   - For Progress average card: caller passes no `latestWeightKg` → card auto-renders without target markers (fallback to current share bars or muted).

6. **Styles `src/app/globals.css`.**
   - Hero picker: `.hero-line .hero-workout-picker{ color: var(--text-muted); font: inherit; font-weight:800; border:0; border-bottom:1.5px dashed var(--line-strong); background:transparent; padding:0 1px 1px; border-radius:2px; text-underline-offset:3px; display:inline-flex; align-items:center; gap:5px } .hero-workout-picker:hover{ color: var(--ink); border-bottom-color: var(--ink)} .hero-workout-picker:disabled{ opacity:.55; cursor:not-allowed } .hero-date-subline{ margin-top:6px; color: var(--text-muted); font-size:13px }` Adjust `.hero-line` line-height.
   - Day strip: remove `.strip-chevron` rules or hide; update `.day-strip{ gap:0 } .streak-strip{ gap:7px; scroll-snap-type:x proximity; scrollbar-width:none } .streak-strip::-webkit-scrollbar{display:none} .streak-strip .day-dot{ scroll-snap-align:center }` maybe add fade mask: `mask-image: linear-gradient(...)` on narrow.
   - Picker sheet: `.workout-picker-sheet .picker-list{ display:grid; gap:8px } .picker-row{ display:flex; align-items:center; gap:12px; padding:13px 14px; border:1px solid var(--line); border-radius:10px; background:var(--surface) } .picker-row.active{ border-color: var(--accent); background: var(--accent-07)} .picker-row:disabled{ opacity:.5}`.
   - Fuel rings/bars: `.macro-rings{ display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:12px; margin-top:14px } .macro-ring-card{ padding:12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-75)} .macro-ring-track…` etc. Responsive: `@media(max-width:560px){ .macro-rings{ grid-template-columns:1fr } }` or 2+1.
   - Quick-actions panel spacing: `.quick-actions-panel{ margin: 0 0 20px; padding-top:0; border-top:0 }`.

7. **Wiring + cleanup.**
   - Ensure imports: add `Check`, `ChevronDown` for hero picker if needed; remove unused `ChevronLeft/Right`.
   - Pass `latestWeightKg` from `TodayScreen` to `DailyFuelCard`. Keep Progress caller unchanged.
   - Verify `chooseTemplate` still guarded by `isStarted||isComplete` via sheet vs old pills — same server action semantics.

## Validation
- `npm run typecheck` / `npm run lint` / `npm run test` (include new metrics helpers) / `npm run build`.
- Hero: with `displayName="Adam Smith"` → `Hi Adam, it's Push day.`; `displayName=null/""` → `Hi there, it's … day.`; template `"Day 1 - Push (Chest Focus)"` → `Push`; `"Legs"` → `Legs`; `"   "` edge. Verify historical date shows subline `· Monday, Aug 18`.
- Picker: click underlined workout → sheet opens, lists templates with check, selecting active calls `chooseTemplate`, updates hero; when workout started/completed picker rows disabled and sheet shows helper; keyboard/ESC closes.
- Day strip: chevrons absent, horizontal drag/scroll works via touch, mouse wheel, trackpad; selected day auto-centered; snap works on mobile; no layout overflow at 320px.
- Order: DOM order is hero → day-strip → quick-grid → workout-panel → capture-hero → daily-fuel-card on both mobile and desktop (inspect source order).
- Prestart: with 6 exercises grid has 3 rows × 2 cols on >=381px, collapses to 1 col at <=380px; cards open `ExerciseDetailsSheet`; active workout list remains single column.
- Daily fuel — with weight (e.g. 72.5 kg → protein 130.5–159.5 g, fat 36.3 g) verify marker positions, in-range green, below/above colors, carbs shows grams + % without target. Without weight: tracks muted, helper CTA appears, clicking CTA opens Body check-in. Kcal ring still reflects `dailyCalorieGoal`. Progress average card renders without targets and no helper.
- Regression: `isStarted` locking, `switchDay` flushing drafts, AI parse/confirm still works below workout.

## Out Of Scope
- Schema/migration for `users.displayName` or new weight fields; use existing `body_metrics`.
- Progress page fuel target redesign (stays share-based).
- Changing `chooseTemplate` server semantics, template ordering, or adding new templates.
- Persisting short-name or first-name derived fields; pure helpers only.
- Full Apple Watch ring animation; horizontal range/track approved as lighter implementation — circular SVG rings optional enhancement if time allows but not required.

## Risks
- Short-name heuristic may produce unexpected token for exotic template names (e.g. multi-word suffix). Mitigation: fallback shows trimmed suffix verbatim; owner can rename template in Library.
- 2-col prestart at 320–375px may feel cramped — mitigated by 380px collapse breakpoint.
- Queried `latestWeightKg` adds one lightweight indexed lookup to Today; no N+1, no effect on other pages.
