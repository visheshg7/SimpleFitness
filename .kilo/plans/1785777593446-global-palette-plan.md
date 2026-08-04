# Global Palette Implementation Plan

## Goal

Convert the application from its current light canvas/deep-green workout treatment to a global dark visual system based on:

- Base: `#16171A`
- Surface/cards: `#212226`
- Primary ink: `#F2F0EA`
- Iron: `#E8402C` for workouts, PRs, and streaks
- Fuel: `#F5C24C` for meals and macros
- Muted/rules: `#55585F`

Preserve the existing layout, typography, spacing, radii, responsive behavior, and interaction behavior. Allow contrast and surface treatment adjustments required by the dark theme.

## Decisions

- Apply the palette globally to login, shell/navigation, Today, Progress, History, Library, sheets, forms, and charts.
- Keep the existing CSS variable names to minimize selector churn. Reassign the existing workout `--lime`/`--lime-deep` semantic tokens to Iron variants and add the minimum Fuel token needed for nutrition UI.
- Keep separate `--danger`, `--coral`, and `--success` semantic colors where error, destructive, and success states need distinction. They may be derived or retained as semantic variants rather than treated as additional brand accents.
- Keep `#55585F` exact for rules, borders, scrollbars, and genuinely low-emphasis UI. Use lighter derived neutral tokens for readable secondary copy instead of using it as normal text on `#16171A`.
- Do not add a theme switch or persistence/migration; this is a single global theme change.

## Implementation Steps

1. **Rebuild the shared token layer in `src/app/globals.css`.**
   - Set `--canvas`/base and workout `--night` to `#16171A`, `--surface`/`--night-raised` to `#212226`, and `--ink` to `#F2F0EA`.
   - Set `--muted` and the default rule token to `#55585F`; define readable light neutral variants for `--ink-soft`, `--line-strong`, and `--night-muted`.
   - Map `--lime` to exact Iron and `--lime-deep` to a darker Iron variant for existing workout/streak selectors. Add `--fuel` as exact Fuel and a restrained Fuel variant for borders/hover states.
   - Update shadows, focus rings, overlays, translucent backgrounds, and `color-scheme` for dark controls so they are based on the new surfaces rather than white/green assumptions.

2. **Convert all stylesheet surfaces and state treatments in `src/app/globals.css`.**
   - Replace remaining light-only backgrounds (`rgba` white/off-white, `#fff`, and the old canvas/surface values) across the shell, cards, navigation, auth card, sheets, fields, notices, empty states, and mobile bottom navigation.
   - Replace hard-coded deep-green workout borders, card fills, scrollbars, and completed-set colors with semantic tokens or alpha variants of the dark surface and Iron.
   - Ensure normal copy, labels, placeholders, disabled controls, hover states, dashed rules, and focus outlines remain legible on both `--canvas` and `--surface`.
   - Keep the workout panel visually grouped as the active-workout surface, but restyle it as a surface/base treatment within the global dark theme instead of preserving the old forest palette.

3. **Represent Iron and Fuel meaning in Today UI in `src/components/today-screen.tsx`.**
   - Add a semantic class to the meal quick-capture card without changing the body check-in card, allowing meal affordances to use Fuel while workout actions continue using Iron.
   - Add a nutrition/Fuel hook for the macro review boxes and related meal confirmation treatment.
   - Leave all action handlers, data flow, save behavior, and review-before-save behavior unchanged.

4. **Add entry-type styling hooks in `src/components/history-screen.tsx`.**
   - Add a class based on the history entry type to the type badge or equivalent semantic element.
   - Style workout/history badges with Iron, meal badges with Fuel, and body entries with neutral/status tokens; preserve the existing delete and detail-sheet behavior.

5. **Replace hard-coded chart colors in `src/components/progress-screen.tsx`.**
   - Remove the old citrus/cream chart constants and old literal grid, cursor, tooltip, fill, and stroke colors.
   - Use the shared palette/semantic tokens for chart props: Iron for weekly volume/workout series, Fuel for macro series, readable muted neutral for axes/grid text, and surface/ink tokens for tooltip backgrounds and borders.
   - Keep body-metric charts neutral or mapped to retained semantic status colors rather than incorrectly presenting body data as workout or nutrition data.
   - Verify chart labels, tooltips, stacked bars, and line series remain readable in the dark theme.

6. **Audit and tune responsive states.**
   - Check the desktop shell, mobile fixed navigation, Today set-entry cards, auth form, all bottom sheets, and disabled/loading/error states at narrow widths.
   - Remove or replace every obsolete palette literal in the touched UI paths, retaining only intentional semantic status variants and the six requested brand values.

## Validation

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build` to catch server/client and chart rendering issues.
- Manually inspect `/login`, `/today`, `/progress`, `/history`, and `/library` in desktop and mobile widths, including open sheets, empty states, completed workout sets, PR/streak states, meal/macros, errors, and focus-visible controls.
- Confirm `#55585F` is limited to rules/low-emphasis uses and that secondary text, chart labels, form placeholders, Iron, and Fuel meet practical contrast expectations against the new dark surfaces.

## Scope / Risk Notes

- No database, server action, route, or persistence changes are required.
- The existing `README.md` has unrelated working-tree changes and must not be modified or reverted as part of this work.
- Recharts currently contains color literals in a client component; those values must be updated alongside CSS or the Progress page will remain visually inconsistent even if the global stylesheet is correct.
