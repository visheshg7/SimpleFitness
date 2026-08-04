# Today page mobile view — match mockup

## Goal
Make the Today page mobile view match the provided mockup (Image 1). Current implementation (Image 2) is close but differs in details. All changes are presentation-only; no data/query/action changes.

## Files to change
1. `src/components/journal-shell.tsx` — header brand + streak chip + mobile nav icon
2. `src/components/today-screen.tsx` — intro, day strip, capture card, workout panel, quick cards
3. `src/app/globals.css` — all styling updates (base + mobile media query)

## Detailed changes

### 1. Header (`journal-shell.tsx` + CSS)
- Replace `.brand::before` red dot with a solid lucide `Flame` mark (red, `fill="currentColor"`, `strokeWidth={0}`) before the wordmark; wordmark becomes `Simple<span>Fitness</span>` (no space, like the mockup).
- Add a small orange `Flame` icon inside `.streak-chip` before the count.
- CSS: `.brand` becomes inline-flex with gap; add `.brand-mark { color: var(--lime) }`; `.streak-chip` becomes inline-flex with gap; add `.streak-flame { color: #FF8A3D }`.
- Mobile nav: Today icon `Dumbbell` → `House`; active state becomes red text/icon (`.mobile-nav a.active { color: var(--lime); background: transparent }`).

### 2. Page intro (`today-screen.tsx` + CSS)
- Replace `<h1 className="page-title">Today</h1>` + `.date-line` with:
  - Small line: time-based greeting ("Good morning!" / "Good afternoon!" / "Good evening!") rendered with `suppressHydrationWarning` (server/client hour can differ; app already computes dates server-side).
  - Big line: "Let's get stronger today."
- Non-today selected date: small line "Daily log", big line = formatted date (e.g. "Sunday, August 2") — preserves the existing "Daily log" behavior.
- CSS: new `.greeting-line` (~15px, ink, 600) and `.hero-line` (bold, `clamp(30px, 8.5vw, 54px)`, tight line-height/letter-spacing). `.date-line` is only used by Today (verified: progress/library/history don't use it) — remove the element and its CSS rule. `.page-intro`/`.page-title` stay (used by Library/Progress/History).

### 3. Day strip (`today-screen.tsx` + CSS)
- Wrap `.streak-strip` in a flex row with circular chevron buttons (`ChevronLeft`/`ChevronRight`) at both ends that `scrollBy({ left: ±240, behavior: "smooth" })` via a strip ref. Keep the existing selected-day `scrollIntoView` effect.
- Restyle `.day-dot` to match mockup:
  - Base: dark surface, subtle border, ~10px radius; label (`SUN`) muted, date (`Aug 2`) ink-soft.
  - `.selected`: solid `var(--lime)` fill, ink text (label + date).
  - `.today:not(.selected)`: keep red border + inset underline marker.
  - `.complete`: fill that indicates that the day was logged.

### 4. Routine section
- Note text: "Choose the plan for this day" → "Choose your plan for today".

### 5. Log a workout card (`WorkoutCapture` + CSS)
- Add red icon tile (lucide `ClipboardList`, white glyph) left of the title/subtitle stack — new reusable `.tile-icon` class (40px, 12px radius, `background: var(--lime)`).
- Subtitle: "Tell me what you did..." → "Tell us what you did".
- Placeholder: capitalize → "Bench press, 3 sets of 8 reps, 85kg".
- Mic: move inside the input — wrap textarea in a relative container, mic button absolute at right, borderless, muted icon; textarea gets right padding (~44px). Mic stays anchored to the top line when the field grows multiline. (MealSheet keeps its own parse-box layout.)
- Confirm/Clear row: Confirm `flex: 1` red, Clear fixed-width ghost (already close; adjust mobile rules so they sit side-by-side like the mockup).
- Mobile: `.capture-title` 29px → ~20px; `.capture-heading` back to `row` with center alignment (currently `column` on mobile).

### 6. Workout panel (`today-screen.tsx` + CSS)
- Add red `.tile-icon` with `Dumbbell` glyph left of "Workout" + subtitle stack (new `.panel-title-group` flex wrapper).
- Mobile: `.panel-title` 29px → ~20px.
- Prestart exercises: replace `.exercise-plan-grid` (2-col cards) with `.exercise-plan-list` — full-width rows: red index (`01`), name + uppercase muscle (stacked, flex 1), `4 sets × 8 reps` target (nowrap), muted `ChevronRight`. Row: night-raised bg, 1px border, 12px radius, ~13px padding. Name may wrap on very narrow screens.
- Remove now-unused `.exercise-plan-grid` / `.exercise-plan-card` CSS and its two media-query overrides; rename `PrestartExerciseCard` → row markup (keep component, new classes).
- Footer prestart state: drop the "Choose a template and start the workout." kicker; render only the full-width red `Start workout` button (keeps `Dumbbell` icon), no top divider (`.workout-footer.prestart { border-top: 0; padding-top: 0 }`). Started/completed states keep their kicker + Finish/Complete UI.

### 7. Quick cards (`today-screen.tsx` + CSS)
- Add colored icon tiles: meal = green (`#3E9B66`) `UtensilsCrossed`, body = blue (`#4A86C8`) `PersonStanding` — via `.tile-icon.meal` / `.tile-icon.body` modifiers.
- Structure per card: tile | copy (title + description, flex 1, min-width 0) | circular `+` button.
- Mobile: `.quick-grid` stays 2 columns (currently collapses to 1); card padding/typography tightened (title ~13px, desc ~11px, tile 36–38px, plus ~34px) so both cards fit side-by-side like the mockup.

### 8. Cleanup
- Remove `.brand::before` rule, `.day-dot.complete*` red-fill rules, `.exercise-plan-grid`/`.exercise-plan-card` rules, `.date-line` rule, and the mobile overrides that referenced them.

## Verification
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Visually confirm classes/structure against the mockup (dev server optional; user can run `npm run dev`).
