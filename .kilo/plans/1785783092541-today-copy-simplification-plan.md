# Today Copy Simplification

## Goal

Make `/today` read like a private logging tool rather than a marketing page. Remove decorative framing and keep copy that identifies an object, explains an action, communicates state, or prevents a data-entry mistake.

## Decisions

- Scope includes the Today page and every sheet/modal opened from it.
- Remove redundant eyebrow labels and rule labels rather than replacing them with new decorative labels.
- Keep concise operational guidance: constraints, estimates, examples, save behavior, and state-dependent instructions.
- Do not change layout, styling, data behavior, action names, or copy on Progress, History, or Library.

## Implementation Tasks

1. Update `src/components/today-screen.tsx` main-page copy:
   - Remove the `Training log` eyebrow and `Simplest way to log your workouts and meals.` subtitle. Keep the `Today`/`Daily log` title and selected date line.
   - Remove the `Training rhythm` rule label. Preserve the date strip's existing accessible group label and day button labels.
   - Remove the `Fast capture` eyebrow. Keep `Log from a note` and shorten the helper text to `Enter a workout note. Review the sets before saving.` Keep the `Open composer` action.
   - Remove the `Up next`/`Active workout` eyebrow. Keep the selected template name and set progress.
   - Shorten the active-session note to `Changes here apply to this workout, not the template.`
   - Simplify workout footer status text to `Completed. Set log stays editable.`, `Changes save automatically.`, and `Choose a template and start the workout.` for completed, active, and pre-start states respectively.
   - Shorten the no-exercise empty state to `No movements yet. Add exercises in Library or add them after starting.`
   - Shorten pre-start exercise guidance to `Start the workout to log sets. The plan can still change after starting.`
   - Remove the `Other check-ins` rule label. Keep the functional card headings and shorten their descriptions to `Review estimated macros before saving.` and `Weight required; height and body fat optional.`

2. Update Today sheet/modal headings and guidance in the same component:
   - Remove `Adjust this day only`, `Make it fit`, `Review before saving`, `Directional estimate`, and `Keep a useful baseline` eyebrow text. Keep each specific sheet title (`Swap ...`, `Add an exercise`, `Workout note`, `Log a meal`, and `Body check-in`).
   - Rewrite the swap notice as `The template stays unchanged. Only blank sets move to the replacement.`
   - Rewrite the add-exercise notice as `Added to this workout only with three empty sets.`
   - Replace the workout-note intro with `Enter a workout note. Example: “bench press, 3 sets of 8 at 65 kg”.`
   - Rewrite the parsed-workout notice as `Review the exercises and numbers before saving. New movements are added to this workout, not the template.`
   - Rewrite the meal estimate notice as `Nutrition values are estimates. Adjust them before saving.`
   - Rewrite the BMI result text as `BMI: <value> based on the height entered today.` and the no-BMI text as `Enter height to calculate BMI. Saved height is prefilled when available.`
   - Preserve speech availability messaging, validation errors, field labels, placeholders, button labels, and empty-state explanations because they support task completion or error recovery.

3. Leave `src/app/globals.css` unchanged unless implementation reveals a spacing regression from removed text. Existing `.eyebrow`, `.rule-label`, and `.page-subtitle` styles remain needed by other journal screens; do not remove shared styles solely because Today no longer uses them.

## Validation

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run build` if the local environment has the required build configuration.
- Manually inspect `/today` for both current and selected historical dates, and inspect each sheet in its initial, review, empty, and BMI states where applicable.
- Verify that removing visible labels does not remove accessible names: the date strip remains labeled, dialog titles remain referenced by `aria-labelledby`, and all icon-only controls retain their existing labels.

## Expected Result

The page hierarchy is reduced to date, workout/template, progress, actions, and useful state. Users see less copy before acting, while important behavior such as template isolation, estimate quality, review-before-save, and BMI requirements remains explicit.
