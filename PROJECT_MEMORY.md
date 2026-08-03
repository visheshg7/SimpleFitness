# Training Journal: Developer Memory

**Document purpose:** CTO-level memory repository for developers working on the Training Journal application.

**Last reviewed:** 2026-08-03

**Current status:** Deployable MVP foundation. The application builds, typechecks, lints, and has passing unit tests for the pure metric functions. Production use still requires a configured Neon database, seeded data, authentication secrets, and OpenRouter settings for AI features.

## 1. Product Contract

Training Journal is a private, single-user workout, nutrition, and body-metric journal. It optimizes for fast mobile entry and continuity rather than accounts, social features, clinical nutrition, or an extensive exercise catalog.

The product has one logical owner. There are no user registration, email, password reset, multi-user, sharing, leaderboard, payment, or role-management concepts.

The primary experience is `/today`. The other product surfaces are `/progress`, `/history`, and `/library`.

The product promise is:

- A workout set or meal can be recorded quickly from a phone.
- A template is a starting point, not a constraint: an active workout can swap an unlogged movement or add a one-off movement without altering the reusable template.
- Free text and browser speech reduce manual entry, but AI output is always reviewed before persistence.
- Database state is the source of truth after a successful mutation or refresh.
- Streaks and PR signals reinforce continuity without gamification.
- Nutrition values are directional estimates, not clinical measurements.

## 2. Architecture Summary

```text
Browser
  |
  | Server Components for initial reads
  | Server Actions for mutations
  v
Next.js App Router
  |
  | middleware.ts verifies signed session cookie
  | lib/auth.ts verifies the session again in every protected action
  | lib/queries/* builds read models
  | lib/actions/* validates and mutates data
  v
Drizzle ORM
  |
  v
Neon Postgres

Browser speech input --> transcript only --> server AI parser --> review UI --> explicit confirmation --> database
Server AI parser --> OpenRouter --> configured DeepSeek-compatible model
```

### Architectural choices

| Concern | Current implementation | Rationale |
| --- | --- | --- |
| Framework | Next.js 15 App Router | Server Components and Server Actions keep the MVP small and deployment-friendly. |
| Language | TypeScript with strict mode | Domain boundaries and database inputs should remain explicit. |
| Database | Neon Postgres | Persistent cross-device storage without managing a local database server. |
| ORM | Drizzle ORM | Typed schema, SQL migrations, and a small runtime footprint. |
| Auth | Signed JWT in an HTTP-only cookie | Appropriate for one private owner without introducing account infrastructure. |
| AI | Direct server-side OpenRouter `fetch` | Keeps credentials out of the client and makes the parser boundary explicit. |
| Speech | Browser Web Speech API | No audio upload, storage, or transcription infrastructure. |
| Charts | Recharts | Sufficient for sparse volume, body, and macro trends. |
| UI | React Client Components only where interaction requires them | Initial reads stay on the server; local state is limited to forms, sheets, speech, and charts. |

## 3. Repository Map

| Path | Responsibility |
| --- | --- |
| `src/app/layout.tsx` | Root HTML shell, metadata, and `next/font` setup. |
| `src/app/globals.css` | Mobile-first visual system, design tokens, responsive layout, controls, sheets, charts, and mobile navigation styles. |
| `src/app/(auth)/login/page.tsx` | Login page. |
| `src/app/(auth)/login/actions.ts` | Login, in-memory rate guard, session cookie issuance, logout. |
| `src/app/(journal)/layout.tsx` | Protected shell loader. Resolves the current owner and streak before rendering navigation. |
| `src/app/(journal)/*/page.tsx` | Server-rendered route entry points for Today, Progress, History, and Library. |
| `src/components/journal-shell.tsx` | Desktop side navigation, mobile bottom navigation, header date, streak, and logout. |
| `src/components/today-screen.tsx` | Main workout UI, set editor, workout parser sheet, meal sheet, and body metric sheet. |
| `src/components/progress-screen.tsx` | Recharts views and progress summary. |
| `src/components/history-screen.tsx` | Filtered timeline, entry detail sheet, and destructive deletion confirmation. |
| `src/components/library-screen.tsx` | Template, exercise, and profile management UI. |
| `src/components/speech-input.ts` | Browser speech feature detection and transcript handling. |
| `src/db/schema.ts` | Authoritative Drizzle schema and inferred database types. |
| `src/db/index.ts` | Lazy Neon/Drizzle database factory. |
| `src/db/seed.ts` | Idempotent owner, PPL template, and exercise seed. |
| `drizzle.config.ts` | Drizzle Kit schema, migration, and database configuration. |
| `drizzle/0000_polite_reaper.sql` | Initial generated SQL migration. |
| `drizzle/0001_normal_kronos.sql` | Adds the per-session exercise-plan table used for flexible active workouts. |
| `src/lib/auth.ts` | Session cookie constants, signing, verification, and protected-action guard. |
| `src/middleware.ts` | Page-level unauthenticated redirect to `/login`. |
| `src/lib/validation.ts` | Zod schemas for all important action inputs and parser outputs. |
| `src/lib/metrics.ts` | Pure canonical-unit, BMI, streak, week, volume, macro, and template rotation functions. |
| `src/lib/ai.ts` | Server-only OpenRouter client, timeout behavior, prompts, and strict output validation. |
| `src/lib/queries/*` | Read models for Today, Progress, History, and Library. |
| `src/lib/actions/*` | Server Action mutation boundaries. |
| `src/lib/metrics.test.ts` | Unit tests for pure metric functions. |
| `.env.example` | Safe environment variable names and placeholders. |
| `README.md` | Short setup and deployment reference. |

## 4. Runtime and Request Model

### Protected page request

1. A browser requests a non-public route.
2. `src/middleware.ts` reads `training_journal_session`.
3. `verifySessionToken()` validates the JWT signature and expiry.
4. If invalid or absent, middleware redirects to `/login`.
5. The journal layout calls `currentOwnerId()` again and loads the Today model to display the current streak in the shell.
6. The route Server Component calls its domain query and passes a serializable read model to a Client Component when interaction is needed.

### Protected Server Action request

1. The Client Component invokes a Server Action.
2. The action calls `requireSession()` and never trusts an owner ID from the browser.
3. The action validates the payload using Zod.
4. The action verifies ownership or uses the authenticated singleton context.
5. The action writes through Drizzle.
6. The action revalidates the affected route paths.
7. The Client Component refreshes or updates local state after success.

### Database connection behavior

`src/db/index.ts` creates a Neon HTTP client lazily from `DATABASE_URL`. Pages and actions fail at runtime with a clear configuration error if the database URL is missing. This allows the application to compile without a configured database, but it cannot serve authenticated application data until the database exists.

## 5. Route and Surface Contract

| Route | Rendering | Primary responsibility |
| --- | --- | --- |
| `/` | Static redirect | Redirects to `/today`. |
| `/login` | Static page plus Client Component | Shared passcode login. |
| `/today` | Dynamic Server Component plus Client Component | Suggested workout, flexible active-session plan, set logging, AI workout parsing, meal entry, and body check-in. |
| `/progress` | Dynamic Server Component plus Client Component | Streak, weekly volume, muscle coverage, body trends, and daily macros. |
| `/history` | Dynamic Server Component plus Client Component | Combined workout, meal, and body timeline with filtering and details. |
| `/library` | Dynamic Server Component plus Client Component | Templates, exercise library, ordering, archive state, and profile settings. |

There is intentionally no public API route layer. Server Actions are the mutation API for the MVP.

## 6. Data Model and Invariants

### Tables

#### `users`

Stores the singleton owner record, display name, saved height in centimeters, and preferred weight unit.

Invariant: seed creates the first owner row if no owner exists. The application assumes one logical owner even though the table is relationally modeled.

#### `exercises`

Stores the exercise name, default unit, primary muscle, secondary muscle array, archive flag, and timestamps.

Invariant: names are unique. Exercises are archived rather than physically deleted when they may be referenced by templates or historical logs.

#### `workout_templates`

Stores named workout templates and their ordered `position`.

Invariant: template positions are unique. The seeded order is Push, Pull, Legs. Library reordering temporarily uses negative positions to avoid unique-index collisions while swapping.

#### `template_exercises`

Join table connecting templates to exercises with ordered `orderIndex`, optional target sets, and optional target reps.

Invariants:

- A template cannot contain the same exercise twice.
- A template cannot contain two exercises at the same order index.
- Deleting a template cascades this join data.
- Deleting an exercise is restricted by foreign keys; use archive behavior instead.

#### `sessions`

Stores the owner, calendar date, selected template, started timestamp, completed timestamp, and timestamps.

Invariant: one session exists per owner per date because of the unique `(owner_id, session_date)` index. A template selection can create an unstarted placeholder session. Starting the session snapshots the selected template into `session_exercises` and seeds its initial set rows.

Important behavior: the database currently implements one session per owner per day, not separate simultaneous in-progress and completed sessions for the same date.

#### `session_exercises`

Stores the active workout's ordered exercise plan, including optional target-set and target-rep values. It is created from the selected template when a session starts, then becomes the source of truth for that active workout.

Invariants:

- A session cannot contain the same exercise twice or two exercises at the same order index.
- Swapping an exercise changes this session-specific plan only; it does not change the reusable template.
- A movement with completed, weighted, or rep-logged work cannot be swapped, because hiding recorded work would corrupt the active-workout record. Add an alternative exercise instead.
- Existing pre-migration started sessions receive a plan on their first add or swap action.

#### `set_logs`

Stores a session exercise set number, canonical kilogram weight, optional reps, completion state, and timestamps.

Invariant: `(session_id, exercise_id, set_number)` is unique. Saving a set is an upsert and is safe to retry for the same natural key.

#### `meal_logs`

Stores the owner, eaten timestamp, original raw input, parsed item JSON, and canonical macro values.

Invariant: raw input is preserved. Parsed data is directional and may be edited before confirmation.

#### `body_metrics`

Stores the owner, metric date, canonical kilogram weight, captured height, body-fat percentage, and calculated BMI snapshot.

Invariant: one body metric per owner per date. BMI is calculated at write time and retained as a historical snapshot; later profile changes do not rewrite old records.

### Foreign-key behavior

| Operation | Result |
| --- | --- |
| Delete owner | Cascades all owner-owned records. This is an operational-only action, not a user feature. |
| Delete template | Deletes template assignments and sets historical session template references to null. Session and set history remain. |
| Delete exercise | Restricted if referenced. Archive instead. |
| Delete session | Cascades its session plan and set logs. |

### Canonical units

The database stores:

- Weight in kilograms.
- Height in centimeters.
- Macros in grams.
- Calories in kcal.

The UI converts weight at the boundary using `kgFromUnit()` and `valueInUnit()`. Never store a UI display value directly in a canonical database column.

## 7. Core Workflows

### 7.1 First-time setup

1. Create a Neon Postgres database.
2. Put `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL` in `.env` for local development.
3. Run `npm install`.
4. Run `npm run db:migrate` to apply the generated SQL migration.
5. Run `npm run db:seed` to create the owner, PPL templates, and starter exercise library.
6. Run `npm run dev`.

`npm run db:generate` is only needed after changing `src/db/schema.ts`. It generates a new SQL migration; it does not apply that migration.

### 7.2 Login and session lifecycle

1. User submits the shared passcode on `/login`.
2. The login action compares it against `APP_PASSWORD` on the server.
3. Failed attempts are tracked in a process-local five-minute guard. Eight failed attempts are blocked temporarily.
4. On success, the action selects the singleton owner row and signs a JWT containing `ownerId`.
5. The JWT is stored in an HTTP-only, same-site lax cookie for fourteen days.
6. Production cookies use the `secure` flag.
7. Logout deletes the cookie and redirects to `/login`.

This is deliberately lightweight private-app auth. The in-memory rate guard is not a multi-region security boundary and does not replace a distributed authentication system.

### 7.3 Today workout flow

#### Read model

`getTodayData(ownerId, today)` loads:

- Owner profile and preferred unit.
- Templates ordered by position.
- The current date session, if any.
- Recent completed sessions for streak and template rotation.
- Active non-archived exercise library.
- Exercises from the active session plan when it exists; otherwise, active exercises assigned to the selected template.
- Current session set rows.
- The most recent prior completed sets for each exercise.

If there is no completed-session history, the first template by position is suggested. Otherwise, the next template position after the last completed template is suggested, wrapping to the first template.

#### Template selection

`chooseTemplate({ templateId, sessionDate })` creates or updates the date placeholder session and revalidates `/today`. It rejects template changes after the workout has started or completed so existing set data cannot become hidden behind a different plan.

#### Start session

`startSession({ templateId, sessionDate })`:

- Requires the authenticated owner.
- Creates or updates the date session.
- Sets `startedAt`.
- Snapshots active template exercises into the session-specific plan, then seeds initial set rows from the plan target-set count.
- Defaults seeded template assignments to three sets and eight target reps.
- Returns the started session ID and revalidates `/today`.

#### Active workout adjustments

`addExerciseToSession({ sessionId, exerciseId })` adds an active-library exercise to the current session only, after the planned movements, and seeds three empty sets. It does not modify the template.

`replaceSessionExercise({ sessionExerciseId, exerciseId })` swaps a movement only when its existing sets are still blank. It deletes the outgoing blank rows, seeds blank rows for the replacement, and keeps the reusable template unchanged. When work is already logged, the action fails with a clear instruction to add an alternative movement instead.

#### Set save

`saveSet(input)`:

1. Requires the session.
2. Validates with `setInputSchema`.
3. Confirms the session belongs to the authenticated owner.
4. Confirms the exercise exists.
5. Converts weight to kilograms.
6. Upserts on `(sessionId, exerciseId, setNumber)`.
7. Revalidates `/today`, `/progress`, and `/history`.

Set changes are persisted immediately. Completing the workout is not required to save individual set values.

#### Finish workout

`finishSession(sessionId)` verifies owner ownership, sets `completedAt`, and revalidates Today, Progress, and History. Streak calculations use completed sessions only.

#### PR signal

The Today UI compares the current set weight against the prior session reference for that exercise and displays a quiet `PR` label when the current completed weight is higher. There is no modal celebration or gamified reward system.

### 7.4 Free-text or speech workout parsing

1. User opens the Today workout composer.
2. User types a note or taps the microphone.
3. The browser Web Speech API, when available, returns transcript text only. No audio is uploaded or persisted.
4. `parseWorkoutText(rawInput)` requires a valid authenticated session and loads active library names.
5. `parseWorkout()` sends raw text and exercise names to OpenRouter.
6. The OpenRouter response must be JSON.
7. `workoutParseSchema` validates exercise names, sets, optional weight, optional reps, unit, and notes.
8. The review sheet lets the user map parsed exercise names to active library exercises and edit weight or reps.
9. Confirmation starts the selected workout when necessary, then calls `logQuickSets()` for each reviewed exercise.
10. `logQuickSets()` adds an off-template active-library exercise to the session plan when necessary, fills blank planned rows before appending new rows, and saves reviewed sets as completed.
11. No parsed set is written before review confirmation.

Failure behavior:

- Missing OpenRouter configuration returns an inline configuration error.
- Upstream failures return an inline retryable error.
- Timeout is 20 seconds.
- Invalid JSON or invalid schema output is rejected.
- Unmatched exercise names must be mapped before confirmation; they are not silently created or discarded.

### 7.5 Meal logging workflow

1. User opens `Log a meal` from Today.
2. User types or dictates raw food text.
3. `parseMealText(rawInput)` validates the text and calls OpenRouter.
4. `mealParseSchema` validates summary, item array, calories, protein, carbs, and fat.
5. The review sheet labels values as estimates.
6. User edits the top-level macro values if needed.
7. `confirmMeal()` validates the complete payload, preserves `rawInput`, inserts the meal row, and revalidates Today, Progress, and History.

Meal macros are intentionally directional. The current UI edits top-level macro totals; parsed item-level editing is a future enhancement.

### 7.6 Body metric workflow

1. User opens `Body check-in` from Today.
2. Weight is required.
3. Unit is selected as kg or lb.
4. Height and body-fat percentage are optional.
5. Weight is converted to kilograms.
6. BMI is calculated when height is available.
7. `saveBodyMetric()` upserts on owner and metric date.
8. The stored BMI is a snapshot for that date.

### 7.7 Progress workflow

`getProgressData(ownerId)` loads:

- Completed workouts from the recent 56-day window.
- Completed set logs joined to exercises and sessions.
- Recent meal logs.
- Recent body metrics.
- All completed session dates for the long-running streak.

Displayed metrics:

- Current streak.
- Monday-first weekly completion strip.
- Current-week volume.
- Previous-week volume comparison.
- Muscle coverage by completed primary-muscle sets in the last seven days.
- Eight weekly volume buckets by primary muscle.
- Body metric chart data.
- Daily macro aggregation.

Volume formula:

```text
volume = completed weightKg * reps
```

Sets without weight or reps contribute zero volume. Secondary muscle groups are stored but are not currently included in coverage or volume aggregation.

### 7.8 History workflow

`getHistoryData(ownerId)` loads up to 100 completed workouts, 100 meals, and 100 body metrics, then combines them into a reverse-chronological timeline.

Workout entries include exercise and set detail. Meal entries include raw input and macro summary. Body entries include captured weight, body fat, and BMI context.

`deleteHistoryEntry()` supports owner-scoped deletion of workouts and meals. Workout deletion cascades set logs. Body metric deletion has a server action but is not currently exposed as a History UI action.

### 7.9 Library workflow

`getLibraryData(ownerId)` loads the owner profile, ordered templates, all exercises, and template assignments.

Supported mutations:

- Create template.
- Rename template.
- Delete template.
- Move template up or down.
- Add exercise to template.
- Remove exercise from template.
- Create exercise.
- Edit exercise.
- Archive or unarchive exercise.
- Save preferred unit and profile height.

Library actions require a valid session. The current application relies on the singleton product boundary rather than storing owner IDs on templates and exercises.

## 8. Server Action Catalog

| Action | Input | Side effects |
| --- | --- | --- |
| `login` | Password string | Sets signed session cookie or returns generic failure. |
| `logout` | None | Deletes session cookie. |
| `chooseTemplate` | Template ID and date | Creates or updates date placeholder session. |
| `startSession` | Template ID and date | Starts session, snapshots its plan, seeds set rows, and returns the session ID. |
| `addExerciseToSession` | Session and exercise IDs | Adds an active-library movement to this session only and seeds blank sets. |
| `replaceSessionExercise` | Session-plan row and replacement exercise IDs | Safely swaps an unlogged session movement without changing its template. |
| `saveSet` | Session, exercise, set number, weight, reps, unit, completion | Canonicalizes weight and upserts a set. |
| `logQuickSets` | Session, exercise, reviewed parsed sets, default unit | Fills blank rows or appends completed quick-log sets, adding an exercise to the active plan if needed. |
| `finishSession` | Session ID | Marks session completed. |
| `parseWorkoutText` | Raw text | Calls OpenRouter and returns validated draft only. |
| `parseMealText` | Raw text | Calls OpenRouter and returns validated draft only. |
| `confirmMeal` | Raw input plus reviewed meal data | Persists meal row. |
| `saveBodyMetric` | Date, weight, unit, optional height and body fat | Persists canonical body snapshot. |
| `createTemplate` | Template name | Inserts ordered template. |
| `renameTemplate` | Template ID and name | Updates template name. |
| `deleteTemplate` | Template ID | Deletes template and assignments. |
| `moveTemplate` | Template ID and direction | Swaps template position. |
| `addExerciseToTemplate` | Template and exercise IDs | Adds ordered assignment. |
| `removeExerciseFromTemplate` | Assignment ID | Removes assignment. |
| `createExercise` | Name, muscle data, default unit | Inserts exercise. |
| `editExercise` | Exercise ID and exercise data | Updates exercise metadata. |
| `archiveExercise` | Exercise ID and archive flag | Soft-hides or restores exercise. |
| `saveProfile` | Height and preferred unit | Updates singleton owner profile. |
| `deleteHistoryEntry` | Type and entry ID | Owner-scoped workout or meal deletion. |

All mutation actions should keep the same sequence: authenticate, validate, authorize, mutate, revalidate, return structured success or failure.

## 9. Validation and Error Handling

Zod is the boundary for:

- Set payloads.
- Workout parser output.
- Meal parser output.
- Raw parser text length.
- Body metrics.
- Profile settings.
- Template names.
- Exercise metadata.

The UI should never assume an AI response is safe or complete. AI results remain drafts until a user confirms them through normal persistence actions.

The expected action result shape is:

```ts
{ success: true }
```

or:

```ts
{ success: false, error: string }
```

Do not expose raw database errors or secrets to the browser. Use clear inline errors that preserve the user's local draft where possible.

## 10. Security Model

### Authentication

- Shared `APP_PASSWORD` is compared server-side.
- `SESSION_SECRET` signs the JWT.
- Cookie is HTTP-only, same-site lax, path-scoped to `/`, and fourteen days by default.
- Production cookies are secure.
- Middleware protects page navigation.
- Every protected Server Action calls `requireSession()` again.

### Data authorization

- Owner ID is derived from the verified session, never accepted from client input.
- Owner-scoped tables use the authenticated owner ID in queries and mutations.
- Historical data is preserved when templates or exercises change.

### AI security

- OpenRouter credentials are server-only.
- AI requests are issued from `src/lib/ai.ts`.
- Raw user text is bounded to 2,000 characters.
- Output is parsed and schema-validated before it reaches a persistence action.
- Audio is not uploaded or stored.

### Operational security limitations

- The login rate limiter is process-local and resets when the instance restarts.
- There is no audit log for login attempts or destructive actions.
- There is no CSRF-specific token because mutations use same-site cookie semantics and Next Server Actions, but this assumption should be revisited if the app becomes multi-user or exposes third-party integrations.

## 11. Environment Variables

| Variable | Required | Used by | Meaning |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Drizzle, Neon | Neon Postgres connection string. |
| `APP_PASSWORD` | Yes | Login action | Shared private passcode. |
| `SESSION_SECRET` | Yes | Auth | Random signing secret, at least 24 characters in current code. Use a much longer random value in practice. |
| `OPENROUTER_API_KEY` | Required for AI | Server AI client | OpenRouter credential. |
| `OPENROUTER_MODEL` | Required for AI | Server AI client | Model identifier sent to OpenRouter. |
| `NEXT_PUBLIC_APP_URL` | Optional | Server AI client | Referer header value; falls back to localhost. |

Do not commit `.env`, `.env.local`, or any real credentials. `.env.example` contains placeholders only.

For local Drizzle commands, use `.env` because `drizzle.config.ts` and `src/db/seed.ts` load `dotenv/config`, whose default file is `.env`. Next.js also reads `.env`, so this keeps local CLI and application configuration aligned.

## 12. Database Operations

### Initial local or deployment setup

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

### Schema change workflow

1. Edit `src/db/schema.ts`.
2. Run `npm run typecheck`.
3. Run `npm run db:generate`.
4. Inspect the generated SQL in `drizzle/`.
5. Run `npm run db:migrate` against the intended database.
6. Update seed behavior if the new entity needs starter data.
7. Add or update tests.

`db:generate` creates SQL. `db:migrate` applies SQL. `db:seed` inserts initial application data. These commands are intentionally separate.

### Production deployment sequence

1. Create or select the production Neon database.
2. Configure all required Vercel environment variables.
3. Apply migrations against production Neon.
4. Run the idempotent seed once against production.
5. Deploy the Next.js application.
6. Verify `/login`, login, Today template loading, set save, and OpenRouter error behavior.

Vercel build does not automatically migrate or seed the database. Database changes must be an explicit deployment operation.

## 13. Quality Gates

Run the following before merging or deploying:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Current automated test coverage is intentionally small and focuses on pure metrics:

- kg/lb conversion.
- BMI calculation.
- Streak calculation across gaps.
- Monday-first week construction.
- Completed weighted volume.
- Macro aggregation.
- Template rotation.

The next high-value test additions are authenticated Server Action tests, parser fixtures, invalid AI response tests, database integration tests, and an end-to-end smoke path against a disposable Postgres database.

## 14. Current Known Gaps and Risks

These are implementation facts that future developers should not accidentally treat as completed product behavior:

1. Database integration tests and browser end-to-end tests are not implemented.
2. The local login rate limiter is not suitable for multi-region or multi-user authentication.
3. The app assumes one session per owner per calendar date.
4. The Today draft is not currently persisted to `localStorage` for crash recovery.
5. Parsed workout exercises must be mapped to an existing library exercise; the review flow does not yet create a new exercise inline.
6. Meal review edits top-level macro totals but does not yet expose item-by-item editing.
7. Body metric deletion has a Server Action but no visible History delete control.
8. Secondary muscle groups are stored but not yet included in coverage or volume aggregation.
9. Session-specific added exercises currently receive the fixed default of three sets and eight target reps; the active-workout UI does not yet edit those targets.
10. The Progress body chart selector currently uses display keys that should be checked against the canonical fields `weightKg` and `bodyFatPercent` before relying on those chart series in production.
11. The `getWorkoutDetail()` query exists, but the History screen currently receives workout details as part of the combined History read model.
12. Template and exercise mutations rely on the singleton product boundary rather than owner foreign keys on those tables.
13. There is no background job, offline sync, reminder system, wearable integration, or native mobile package.

Known gaps should be resolved with a focused change and tests rather than broadening the architecture prematurely.

## 15. Developer Change Protocol

Before changing code:

1. Identify the domain boundary: schema, query, action, component, or pure function.
2. Confirm whether the change affects canonical units, ownership, historical preservation, or route revalidation.
3. Read the existing action and query for the affected route before adding a parallel path.

When changing data:

1. Update `src/db/schema.ts`.
2. Update validation schemas.
3. Generate and inspect the migration.
4. Update seed data if required.
5. Update queries and actions.
6. Add pure or integration tests.

When adding a mutation:

1. Add a Server Action under `src/lib/actions/`.
2. Call `requireSession()` first.
3. Validate all client input with Zod.
4. Never accept a client-provided owner ID.
5. Preserve existing historical rows unless deletion is explicit and safe.
6. Revalidate every affected route.
7. Return structured success or error data.

When changing UI:

1. Keep initial data loading in a Server Component where possible.
2. Use Client Components only for local interaction, charts, speech, or transitions.
3. Preserve mobile thumb reachability and large touch targets.
4. Preserve the mobile-first visual language: off-white canvas, deep forest active-workout surface, lime status accent, rounded but restrained controls, legible set-entry grids, and a fixed thumb-reachable bottom navigation.
5. Preserve review-before-save behavior for all AI output.

## 16. Decision Log

| Decision | Why it exists |
| --- | --- |
| Single shared passcode | The product is private and single-user; full account infrastructure adds cost without current value. |
| Singleton owner row | Keeps relational integrity and future extension possible without adding user-facing account concepts. |
| Server Actions instead of API routes | Reduces surface area for a small CRUD application and keeps auth checks close to mutations. |
| Canonical kg/cm/g/kcal storage | Makes analytics consistent regardless of user display preferences. |
| Review-before-save AI | AI translates input but never becomes the authority over user data. |
| Archive instead of delete for exercises | Historical set logs must retain their exercise references. |
| Session-specific workout plan | An active workout must be adjustable without rewriting its reusable template or hiding logged work. |
| Streak based on completed sessions | Starting or partially entering a workout should not count as completed continuity. |
| Directional nutrition language | The model output is an estimate and must not imply clinical precision. |
| No local database abstraction | Neon is the intended deployment database and the MVP should not maintain a second persistence implementation. |
