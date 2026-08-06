# Progress Muscle Heatmap

## Context

`/progress` already displays a primary-muscle set summary, but `getProgressData()` currently hard-codes that summary to the last seven days. The page already has selected `7D`, `30D`, and `56D` range state, while the supplied framework-agnostic MuscleMap source under `knowledge/musclemap/src` provides body paths, heatmap colors, and SVG rendering primitives.

The feature replaces the existing Muscle focus bar with side-by-side front and back body maps. It must preserve the private single-owner model, completed-set semantics, current dark visual system, and server-read/client-interaction split.

No database schema or migration is required. Existing completed `set_logs`, exercise primary-muscle values, and optional user sex are sufficient.

## Fresh Session Handoff

- Begin implementation in a new implementation-capable session using this plan as the source of truth. Do not implement the feature in the planning session.
- At session start, inspect `git status`, the current branch, and the existing untracked `knowledge/musclemap/` source. Preserve unrelated user changes; do not reset, checkout, or delete them.
- The current repository context is branch `feature/tech-stack-upgrade` with GitHub remote `origin` at `https://github.com/visheshg7/SimpleFitness.git`. Unless the user changes that context, implement on the current branch and push that branch.

## Product Decisions

- Replace the existing Muscle focus bar and legend with one Muscle heatmap card. Do not show two competing muscle summaries.
- The heatmap follows the Progress page's selected `7D`, `30D`, or `56D` range.
- Each completed set contributes once, to the exercise's primary muscle only. Secondary muscles do not inflate the heatmap.
- Use the saved `users.sex` for the silhouette. Fall back to the male paths when sex is unset. Use the same gender for front and back.
- Normalize heat intensity relative to the selected period. The highest summed rendered-region count is intensity `1`; zero-count regions stay neutral.
- When several app groups map to one renderer region, sum those group counts before calculating that region's intensity. Keep the legend's canonical app groups and individual counts.
- Use the closest renderer fallback for app groups without an exact path: `Lats` and `Mid-Back` to `upper-back`, all delt variants to `deltoids`, and `Abductors` to `gluteal`. Exact mappings cover the remaining supported app groups.
- Keep the map visual-only. Do not enable tap selection, tooltips, zoom, drag, or map editing. The legend is the detail surface.
- List every canonical app muscle group with at least one recognized completed set in the selected period, sorted by set count descending. Omit zero-count groups.
- If no recognized completed sets exist in the selected period, render neutral maps and the existing-style empty guidance instead of attempting a zero-max normalization.
- Promote the supplied source into app-owned `src/lib/musclemap/`, preserving its internal modules and public `index.ts`. Do not add a package dependency or import across the `knowledge` boundary.

## Implementation Plan

1. **Promote the supplied map source.**
   - Copy every file under `knowledge/musclemap/src` into `src/lib/musclemap/`, preserving the module layout and existing `.js` relative import specifiers.
   - Keep the copied `src/lib/musclemap/index.ts` as the public import boundary for renderer, heatmap, color, style, and muscle types.
   - Do not execute DOM-dependent map functions during Server Component render. The map wrapper will call `buildBodySvg()` only in a Client Component effect.

2. **Add pure mapping logic in `src/lib/muscle-heatmap.ts`.**
   - Define the typed app-to-renderer mapping: `Chest` -> `chest`; `Lats` and `Mid-Back` -> `upper-back`; `Traps` -> `trapezius`; `Lower Back` -> `lower-back`; all three delt groups -> `deltoids`; `Biceps` -> `biceps`; `Triceps` -> `triceps`; `Forearms` -> `forearm`; `Abs` -> `abs`; `Obliques` -> `obliques`; `Quads` -> `quadriceps`; `Hamstrings` -> `hamstring`; `Glutes` and `Abductors` -> `gluteal`; `Adductors` -> `adductors`; and `Calves` -> `calves`.
   - Add a serializable `buildMuscleHeatmap(counts)` result containing sorted canonical legend rows, summed renderer-region counts, and normalized renderer-region intensities. Keep canonical rows separate from fallback-region aggregation.
   - Normalize by the maximum summed renderer-region count. Return empty region data for empty input or a zero maximum; never divide by zero.
   - Normalize keys through `normalizeMuscle()` and ignore unrecognized legacy/custom values because they cannot be rendered reliably. Do not mutate those exercise records.
   - Add `src/lib/muscle-heatmap.test.ts` covering exact/fallback mappings, shared-region summation, relative normalization, sorted legend output, unknown-muscle exclusion, and empty input.

3. **Extend the Progress read model in `src/lib/queries/progress.ts`.**
   - Include `users.sex` in the profile projection and return `bodyGender` as the saved sex or `male` when unset.
   - Replace the fixed seven-day `muscleTotals` derivation with a serializable `muscleSetCountsByDate` array containing `{ date, muscle, count }` rows for completed primary-muscle sets across the existing 56-day query window.
   - Continue filtering by completed sessions and completed sets. Count one row per completed set, normalize the exercise primary muscle, and omit unrecognized values.
   - Leave volume, exercise progression, body metrics, macros, streak, and completed-date behavior unchanged.

4. **Add the visual-only client map in `src/components/muscle-heatmap.tsx`.**
   - Mark the component `use client`; accept `bodyGender` and the serializable heatmap result from Progress.
   - Render two labeled map frames, `Front` and `Back`, in a two-column layout. In an effect, build one SVG per frame with `buildBodySvg()` using the selected gender, `front`/`back` side, a dark app-compatible `BodyViewStyle`, and `MuscleHighlight` values generated from the normalized region intensities.
   - Use a local literal color scale derived from the existing app palette because the MuscleMap color parser cannot resolve CSS custom properties. Keep neutral fills aligned with the dark surface and use warm/coral/accent colors for increasing intensity.
   - Clean up/rebuild SVG nodes when gender or heatmap data changes. Do not attach BodyView gesture handlers, selection callbacks, tooltips, zoom, or path editing behavior.
   - Render the full nonzero canonical legend below the maps with each app muscle name and set count. Use the same intensity color for a row's swatch; shared fallback regions may therefore have matching swatches.
   - Preserve an accessible card/figure label and map side labels without making the body regions interactive.

5. **Wire the selected range into `src/components/progress-screen.tsx`.**
   - Filter `data.muscleSetCountsByDate` with the existing `rangeDays` calculation and reduce it to canonical muscle totals for the selected period.
   - Build the pure heatmap result from those totals. Use its legend totals for the card's total-set meta and any summary copy.
   - Replace the current `Muscle focus` bar/legend markup with the new `MuscleHeatmap` card. Update its description to state that it shows completed primary-muscle sets for the selected range, not only the last seven days.
   - Keep all other Progress range-dependent charts and sections unchanged.
   - Remove obsolete focus-bar-only constants/markup, while retaining the existing empty-state language pattern for no recognized sets.

6. **Add focused styles in `src/app/globals.css`.**
   - Style the map card, two map frames, body SVG sizing, `Front`/`Back` labels, legend grid, swatches, set counts, and neutral/empty states using existing design tokens.
   - Keep front and back side by side on desktop and mobile, with portrait-safe responsive heights and no horizontal overflow. Allow the legend to use two columns on narrow screens if readable.
   - Ensure SVGs remain centered, preserve aspect ratio, and do not inherit unwanted pointer/selection affordances from the surrounding card.

## Validation

- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- Verify `/progress` with no completed sets shows two neutral maps and the empty guidance without hydration or browser-global errors.
- Verify a 7D range counts only completed primary-muscle sets in the last seven days, and switching to 30D/56D updates both maps and legend without a route reload.
- Verify incomplete sets, sets in incomplete sessions, secondary muscles, and unknown legacy muscle strings do not inflate displayed counts.
- Verify shared mappings sum correctly: `Lats` plus `Mid-Back` heat `upper-back`, and all delt variants heat `deltoids`, while the legend retains separate canonical rows.
- Verify the highest summed renderer region is hottest, lower nonzero regions scale proportionally, and no-count regions remain neutral.
- Verify profile sex selects female or male paths and an unset profile uses male paths for both views.
- Verify the maps are visual-only: no click/tap/keyboard selection, tooltip, zoom, or editing behavior is introduced.
- Check desktop and narrow mobile layouts for side-by-side maps, readable legend rows, keyboard focus behavior elsewhere on Progress, and no horizontal overflow.

## Final Git Delivery

- After implementation and all validation pass, inspect `git status`, `git diff`, `git diff --cached`, and `git log --oneline -10` before staging. Do not include unrelated worktree changes or secrets.
- Stage the complete feature implementation, including the promoted `src/lib/musclemap/` source, heatmap logic/tests, Progress query/component/styles, and any required package/config changes. Include `knowledge/musclemap/` only if it is part of the intended source-of-truth change; do not duplicate or stage unrelated files.
- Create one concise commit on the current branch, for example `Add Progress muscle heatmap`.
- Verify the commit with `git show --stat --oneline HEAD` and `git status --short`.
- Push the current branch to GitHub with `git push origin feature/tech-stack-upgrade` (or the actual current branch name if it changed). Do not force-push.
- Confirm the push succeeded and report the commit hash and remote branch in the final implementation response. If commit hooks or the push fail, fix the issue and create a new commit rather than amending a failed commit.

## Out Of Scope

- Database schema changes, migrations, seed changes, or new API routes.
- Counting secondary muscles, estimating muscle stimulus, weighting sets by reps/weight, or adding recovery/frequency logic.
- Interactive map selection, muscle detail dialogs, drag/zoom controls, or editable body annotations.
- Persisting heatmap snapshots or adding a user-configurable muscle taxonomy/color scale.
- Replacing the supplied map geometry or changing unrelated Progress charts and metrics.
