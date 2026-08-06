# Today Exercise And Meal Modals

## Context

The Today screen already has reusable sheet/modal styles, an exercise read model with prior set data, a Daily Fuel card, and owner-scoped meal deletion. The missing pieces are the detailed Today read model, transient exercise guidance, and the two new interaction surfaces.

No database migration is required. Exercise guidance is generated on demand and is not persisted. Meal item data already exists in `meal_logs.parsed_items`.

## Product Decisions

- Clicking a planned exercise row before a workout, or the exercise name during/after a workout, opens the exercise details modal. Set inputs and exercise action buttons remain independent controls.
- The modal shows target muscles, the most recent completed workout strictly before the selected date, and the all-time PR through the selected date.
- `Last workout` contains completed sets from the most recent prior completed session only. Blank or incomplete rows are excluded.
- `PR` is the heaviest completed weighted set with reps across completed sessions on or before the selected date. Include the selected session only when it is completed; exclude active drafts and future sessions. Display the weight and reps from the winning set. Equal-weight ties prefer more reps, then the earliest set establishing that result. If no weighted set exists, show `No PR yet`.
- Weight values in the exercise modal use the profile’s preferred unit. Database values remain kilograms.
- Target muscles use the exercise primary muscle plus secondary muscles already stored in the exercise record.
- Opening the exercise modal immediately requests AI-generated four-step guidance and one form tip. Guidance is transient client state, not exercise metadata or a server cache.
- AI failures do not block the facts modal. Show an explicit failure state and retry control.
- `Ask AI` is a transient, exercise-scoped follow-up question. Show the latest answer only; do not persist a conversation or answer.
- AI guidance and answers include a clear general-information/safety disclaimer and never prevent workout logging.
- Clicking the Today Daily Fuel card opens a meal-details modal. It is details-only; the existing `Log a meal` quick card remains the add-meal entry point.
- Meal details show one row per logged meal with time, label, and kcal/protein/carbs/fat totals. Parsed food items are behind an optional expandable breakdown.
- Meal deletion is immediate without confirmation, owner-scoped on the server, keeps the detail modal open, and refreshes the Today totals/list after success. Failures remain visible in the modal.

## Implementation Plan

1. **Extend the Today read model in `src/lib/queries/today.ts`.**
   - Return a serializable `meals` array for the selected date containing meal id, ISO eaten time, raw input, parsed items, and nullable macro totals.
   - Add secondary muscles to each exercise row.
   - Replace the current prior-set derivation with completed-set-only history for the latest completed session strictly before `today`.
   - Derive a `personalBestSet` for each exercise from completed sessions with `sessionDate <= today`, including a completed selected session and excluding active/future sessions. Preserve `personalBestWeightKg` for the existing set-row PR indicator, deriving it from the same eligible weighted history.
   - Keep current session sets and template/session plan behavior unchanged.

2. **Harden meal deletion revalidation in `src/lib/actions/meal.ts`.**
   - Keep the existing `requireSession()` and owner predicate.
   - Add `revalidatePath("/today")` alongside the existing Progress and History paths so deleting from the new modal updates the aggregate card.

3. **Add validated transient exercise AI actions.**
   - In `src/lib/validation.ts`, add strict response schemas for exactly four non-empty guidance steps, one tip, and a non-empty follow-up answer. Reuse `rawTextSchema` for the question input.
   - In `src/lib/ai.ts`, add server-only model functions for exercise guidance and a scoped follow-up answer. Prompts must use the canonical exercise record, request concise practical language, return JSON matching the schemas, and state that the result is general guidance rather than medical advice.
   - In `src/lib/actions/ai.ts`, add authenticated actions such as `generateExerciseGuidance(exerciseId)` and `askExerciseQuestion({ exerciseId, question })`. Look up the exercise on the server by id rather than trusting client-supplied muscle metadata; reject missing/invalid exercises and return the same safe error shape as the existing AI parser action.
   - Do not add a table, cache, or persistence path for generated guidance.

4. **Add the exercise details sheet in `src/components/today-screen.tsx`.**
   - Track the selected exercise separately from the existing meal/body/add/swap sheets.
   - Pass an exercise-open handler to `PrestartExerciseRow` and `ExerciseRow`. Render the prestart row as an accessible button; render the active exercise title/name as the details trigger while preserving set editing and reset/swap/remove controls.
   - Implement `ExerciseDetailsSheet` using the established sheet backdrop and close patterns. Render facts immediately: target-muscle chips, Last workout set rows, and PR as preferred-unit `weight x reps` or its empty state.
   - On a new exercise id, reset transient guidance/question state and start exactly one guidance request. Show loading, success, error, and retry states without replacing the facts content.
   - Add a follow-up question field and submit action. Disable empty/pending submissions, show the latest transient answer and its disclaimer, and prevent stale responses from a previous exercise from updating the current sheet.
   - Use accessible labels/heading ids and avoid nested interactive elements.

5. **Make `DailyFuelCard` optionally open details without breaking Progress.**
   - In `src/components/daily-fuel-card.tsx`, add an optional `onOpenDetails` prop.
   - Keep the card’s existing display and Progress usage unchanged when the prop is absent.
   - When present, make the non-action card content a keyboard-accessible click target. Keep the empty-state `Log a meal` CTA separate from that target so there are no nested buttons; the CTA should continue to open the existing meal logging sheet.
   - Update Today’s `DailyFuelCard` call to open the new meal-details sheet. Keep the existing quick meal card wired to `MealSheet`.

6. **Add the meal details sheet in `src/components/today-screen.tsx`.**
   - Track a separate `mealDetailsOpen` state and render `MealDetailsSheet` with `data.meals`.
   - Show the selected date, an empty state when appropriate, and per-meal macro totals. Use native expandable sections or equivalent accessible disclosure controls for `parsedItems`, including each item’s quantity and available estimates.
   - Add an immediate delete button per meal. Track the pending/deleted id locally to prevent duplicate requests, call the existing `deleteMeal` action, show an inline error on failure, and refresh the route on success without closing the detail sheet.
   - Keep the existing AI meal logging/review flow untouched except for the shared Today refresh behavior.

7. **Add focused styles in `src/app/globals.css`.**
   - Style the exercise fact cards, muscle chips, guidance list/tip, AI question/answer area, and meal list/macro rows using existing design tokens and sheet conventions.
   - Add hover/focus/disabled/loading states for the new triggers and destructive meal controls.
   - Ensure the sheets remain scrollable and readable on narrow mobile screens, with touch-sized controls and no horizontal overflow.

## Validation

- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- Verify a planned exercise opens details before a workout; verify active exercise set controls and action icons do not open the modal accidentally.
- Verify Last workout excludes the selected session, uses only the immediately preceding completed occurrence, and handles no history/bodyweight sets gracefully.
- Verify PR excludes active drafts and future dates, includes a completed selected session, honors kg/lb display conversion, and shows the correct reps.
- Verify AI loading, timeout/configuration failure, retry, follow-up failure, and stale-close/reopen behavior leave facts usable and never persist guidance.
- Verify the Daily Fuel card opens the selected date’s meal list, including zero/multiple meals and expandable parsed items, while the separate quick card still opens meal logging.
- Verify immediate meal deletion updates the list and aggregate totals, rejects/does not expose another owner’s meal, and leaves a clear error when the action fails.
- Check keyboard activation/focus states, mobile sheet layout, and that no new interactive controls are nested inside buttons.

## Out Of Scope

- Persisting or manually editing AI exercise instructions.
- AI chat history, streaming responses, proactive coaching, or medical/personalized injury advice.
- Meal editing or changing a confirmed meal’s macros after persistence.
- Changes to Progress, History, Library, workout templates, or the database schema beyond shared action revalidation.
