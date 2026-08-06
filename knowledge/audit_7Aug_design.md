Repository audited: /Users/vegtaco/MyProjects/SimpleFitnessv2
Scope included routes/screens, shared layout/components, CSS tokens, typography, spacing, colors, responsive rules, accessibility semantics, forms, interaction states, navigation, duplicated styling, and test coverage.
No files were modified. This was a static repository audit; browser rendering, screen-reader behavior, and real-device interaction were not executed.
Screen and route inventory
- / redirects to /today: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/page.tsx:3-5
- /login: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(auth)/login/page.tsx
- /today: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/today/page.tsx
- /progress: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/progress/page.tsx
- /history: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/history/page.tsx
- /library: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/library/page.tsx
- Shared authenticated shell: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/journal-shell.tsx
- Global design layer: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css
Confirmed implementation findings
1. Modal dialogs do not implement focus management
Severity: High
Confidence: High
Affected screens: Today, History, Progress, Library
The application uses role="dialog" and aria-modal="true", but dialogs do not:
- Move focus into the dialog when opened
- Trap focus inside the dialog
- Close on Escape
- Restore focus to the triggering control
- Prevent keyboard focus from reaching obscured page content
Examples:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:562-567
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:589-594
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:717
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:730
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:813-862
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:897-947
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:35
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/progress-screen.tsx:102
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:344-358
User impact: Keyboard and screen-reader users can lose context, tab behind an open modal, or be forced to manually locate the close button.
Recommended remediation:
- Create one shared Dialog/Sheet component.
- Focus the first meaningful control on open.
- Trap focus while open.
- Support Escape.
- Restore focus to the trigger on close.
- Add aria-describedby where explanatory text exists.
- Consider disabling page scroll while a dialog is open.
2. Several selection controls expose visual state but not semantic state
Severity: Medium
Confidence: High
Affected screens: Progress, History, Library, Today, global navigation
Visual active classes are used without equivalent state semantics:
- Progress range buttons have no aria-pressed:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/progress-screen.tsx:58-60
- Body metric buttons have no aria-pressed or group label:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/progress-screen.tsx:90
- History filter buttons have no aria-pressed:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:31
- Library tabs have role="tab" and aria-selected, but lack aria-controls, tab panels, and keyboard arrow navigation:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:117-128
- Desktop and mobile navigation use CSS classes for active state but do not expose aria-current="page":
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/journal-shell.tsx:12
- The Today routine selector uses aria-pressed, but its surrounding container is only a generic div:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:125-132
User impact: Screen-reader users may not know which range, filter, tab, metric, or route is active.
Recommended remediation:
- Use aria-pressed for toggle/button groups.
- Add role="group" and an accessible group name where appropriate.
- Implement complete tab semantics or use a simpler button-based switcher.
- Add aria-current="page" to active navigation links.
3. Some important form controls rely on placeholders instead of labels
Severity: Medium
Confidence: High
Affected screens: Today workout capture and meal capture
The following textareas have no associated label or explicit accessible name:
- Workout capture textarea:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:682
- Meal logging textarea:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:717
Their placeholders describe the expected input, but placeholders are not a reliable replacement for persistent labels.
Other fields are generally better labeled through wrapping <label> elements or aria-label.
User impact: Assistive technology users may hear only “edit text” or an unstable placeholder rather than “Workout description” or “Meal description.”
Recommended remediation:
- Add visible labels or visually hidden labels.
- Add aria-describedby for examples and input guidance.
- Add aria-invalid and aria-describedby links when validation errors are shown.
4. Progress indicators and charts lack a complete accessible alternative
Severity: Medium
Confidence: High
Affected screens: Today, Progress
The calorie guide is rendered as a generic div with an aria-label, but no progress semantics:
<div className="fuel-guide" aria-label="Daily calorie goal ...">
Reference: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/daily-fuel-card.tsx:36
It does not expose:
- role="progressbar"
- aria-valuenow
- aria-valuemin
- aria-valuemax
- A textual current-value summary
Similarly, Recharts visualizations do not have an adjacent data table or structured text alternative:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/progress-screen.tsx:81-90
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/progress-screen.tsx:100
The muscle heatmap has a legend, which is a positive partial mitigation, but the generated SVG is only assigned aria-label and is not explicitly given role="img":
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/muscle-heatmap.tsx:60-64
User impact: Users who cannot perceive the charts may not receive the same training-load, body-trend, or calorie-progress information.
Recommended remediation:
- Make calorie guides real progressbars with textual current/target values.
- Add screen-reader summaries for charts.
- Provide an expandable data table or list for chart values.
- Add role="img" and a meaningful accessible description to generated heatmap SVGs.
5. Mobile users have no visible logout action
Severity: Medium
Confidence: High
Affected screens: All authenticated screens at viewport widths ≤760px
The logout control is hidden on mobile:
.date-meta, .logout-button { display: none; }
Reference: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:674-676
The mobile navigation contains only Today, Progress, History, and Library:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/journal-shell.tsx:8-12
User impact: Users on phones cannot access the logout action through the visible interface.
Recommended remediation:
- Add an account/settings item to mobile navigation.
- Or add a compact mobile header menu containing logout.
- Ensure logout remains keyboard and touch accessible.
6. History has no explicit empty or no-results state
Severity: Medium
Confidence: High
Affected screen: History
The component calculates filtered and grouped entries, but no zero-result branch is present:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:21-31
When the history dataset is empty or a filter excludes all entries, the timeline map produces no rows.
User impact: Users see a mostly blank page and cannot distinguish “no entries exist” from a loading, rendering, or filtering failure.
Recommended remediation:
Add separate states for:
- No journal history yet
- No results for the selected type
- No results within the selected date range
- Invalid date range
Each state should include a concise explanation and a next action.
7. Invalid date-range state is calculated but never surfaced
Severity: Low/Medium
Confidence: High
Affected screen: History
invalidDateRange is computed but unused:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:21
There is also CSS for .date-filter-error, but no matching JSX was found:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:376,766
User impact: Users can receive an empty result without being told that the range is invalid, particularly where browser date constraints are bypassed or behave inconsistently.
Recommended remediation:
- Render an inline error under the date fields.
- Add aria-invalid to the affected input.
- Disable or guard filtering until the range is valid.
- Remove unused CSS if no error treatment is intended.
8. Library mutations reload the entire page and reset user context
Severity: Medium
Confidence: High
Affected screen: Library
The shared mutation helper performs a full browser reload after every successful action:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:74-79
This resets:
- The selected Library tab
- Search text
- Selected routine
- Scroll position
- Any unsaved local UI context
The initial tab always returns to "templates":
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:37
User impact: Editing or archiving a movement from the Exercises tab returns the user to the Templates tab. This is disruptive and makes multi-item catalog maintenance slow.
Recommended remediation:
- Use router.refresh() instead of window.location.reload().
- Preserve the current tab and selected entity.
- Keep search state locally or in the URL.
- Update only the affected list where practical.
- Display inline success/error status instead of relying on a page reload.
9. Library mutation feedback and disabled states are inconsistent
Severity: Medium
Confidence: High
Affected screen: Library
Some actions use pending, but several action buttons remain clickable during an in-flight mutation:
- Routine rename, delete, and removal:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:186-205
- Exercise edit and archive:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:257-258
Errors are shown through native window.alert():
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:77
User impact: Rapid clicks can trigger duplicate actions, while native alerts interrupt the visual flow and differ from the inline error treatment used elsewhere.
Recommended remediation:
- Disable all mutation controls while the relevant action is pending.
- Use inline status messages with aria-live="polite".
- Replace browser alerts/prompts with styled dialogs or inline validation.
- Use operation-specific loading labels where destructive actions take time.
10. History deletion ignores server errors
Severity: Medium
Confidence: High
Affected screen: History
The delete handler awaits deleteHistoryEntry() but ignores its result:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:30
The detail sheet is closed and the page refreshed regardless of whether deletion succeeds.
User impact: A failed deletion can appear successful, causing uncertainty and repeated attempts.
Recommended remediation:
- Inspect the returned { success, error }.
- Keep the dialog open on failure.
- Render the error inline with aria-live.
- Only close and refresh after confirmed success.
11. Repeated native dialogs create interaction and visual inconsistency
Severity: Low/Medium
Confidence: High
Affected screens: Today, History, Library
Native browser dialogs are used for destructive or editing flows:
- window.confirm() in Today:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:82,158
- window.confirm() in History:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:30
- window.prompt() and window.alert() in Library:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:77,84,94,189
User impact: Native dialogs do not match the dark visual system, offer limited context, and interrupt keyboard/screen-reader flow differently from the custom sheets.
Recommended remediation:
Create shared confirmation and text-entry dialogs with:
- Consistent visual treatment
- Destructive-action wording
- Focus handling
- Escape and cancel behavior
- Inline error support
12. Primary accent/text pairing likely fails normal-text contrast
Severity: High
Confidence: High
Affected screens: Today, Progress, History, Library
The primary accent is:
--accent: #E8402C;
--ink: #F2F0EA;
Reference: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:3-17
The light ink color is used on the red accent in several normal-sized controls:
- .button.citrus: lines 237-238
- .template-option.active: line 154
- .day-dot.selected: line 111
- .progress-range button.active: line 260
- .library-tab.active: line 415
- .settings-segmented button.active: line 500
- .tdee-target.active: lines 511-514
This pairing is approximately 3.5:1, below the 4.5:1 WCAG threshold for normal-sized text.
The muted --line token is also used as text in places such as small dates, indexes, chevrons, and labels:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:279,380,425,431,446
Those uses are likely too low contrast against the dark surfaces for small text.
User impact: Important button labels and secondary metadata may be difficult to read, especially on low-quality displays or in bright environments.
Recommended remediation:
- Use a lighter text color on the accent background, or darken/lighten the accent depending on the intended pairing.
- Reserve --line for borders and decorative elements.
- Use --text-muted or a dedicated accessible-secondary token for readable metadata.
- Run an automated contrast audit after token changes.
13. The design system has color and spacing drift
Severity: Medium
Confidence: High
Affected screens: Especially Today meal details, but also all screens
The repository has useful base tokens for colors, radii, and shadows, but many components bypass them.
Examples of hardcoded colors and custom surfaces:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:614-665
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/muscle-heatmap.tsx:16-23
- Inline colors in /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/progress-screen.tsx:127
- Inline spacing in /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:35
- Inline progress colors in /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/daily-fuel-card.tsx:36,41
The meal-details sheet uses a substantially different visual language:
- Custom near-black backgrounds
- Custom border colors
- Different radii
- Different macro colors
- Different shadow treatment
Reference: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:613-665
There are also no spacing or typography tokens comparable to the color/radius tokens. Many raw values are repeated throughout the stylesheet.
User impact: Future changes can make dialogs, cards, and controls feel like separate products. Small spacing or color changes require editing many unrelated selectors.
Recommended remediation:
Introduce semantic tokens such as:
--space-1 ... --space-8
--text-xs ... --text-display
--focus-ring
--surface-dialog
--border-subtle
--color-action-primary
--color-action-primary-foreground
Then build shared variants for cards, buttons, dialogs, tabs, and form controls.
14. Shared interaction primitives are missing, causing duplicated markup
Severity: Medium
Confidence: High
Affected screens: All
The repository has shared components for JournalShell, DailyFuelCard, MuscleSelect, and MuscleHeatmap, but not for repeated interaction primitives such as:
- Dialog/sheet
- Button variants
- Form fields and error messaging
- Tabs/segmented controls
- Empty states
- Confirmation dialogs
Sheet markup is duplicated across:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/progress-screen.tsx
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx
The CSS also contains duplicate or overlapping selectors, for example:
- .exercise-plan-row: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:163,572-573
- Generic .field plus workout-specific overrides: lines 203-208
- Generic .sheet plus multiple sheet-specific variants: lines 531-540 and 613-665
User impact: Accessibility fixes and interaction improvements must be repeated manually, increasing the likelihood of inconsistent behavior.
Recommended remediation:
Extract shared primitives before adding more screens. The dialog primitive should solve focus, Escape, scroll lock, labeling, and responsive sheet behavior once.
15. DM Sans is configured only through weight 700, while the UI requests 800
Severity: Low/Medium
Confidence: High
Affected screens: All
The font configuration requests weights 400, 500, 600, and 700:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/layout.tsx:5
The stylesheet frequently requests font-weight: 800, including:
- Eyebrows
- Buttons
- Form labels
- Navigation
- Statistic labels
- Table headings
Examples: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:94,152,267,395,446
User impact: Browsers may synthesize the 800 weight from 700, producing inconsistent boldness and different rendering between browsers.
Recommended remediation:
Either:
- Load weight 800 explicitly, if supported by the chosen font, or
- Standardize the UI on the loaded 700 weight.
16. Authenticated CTA styling differs from the main product action style
Severity: Low
Confidence: High
Affected screens: Login versus Today/Library
The login button uses the default light .button style:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/login-form.tsx:10
Main product actions frequently use the accent .citrus variant:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:232-240
User impact: The login screen feels visually disconnected from the authenticated product, and the primary action hierarchy changes between entry points.
Recommended remediation: Decide whether the login CTA should be part of the same primary-action system. If so, use the same accent variant and focus/disabled treatment.
17. Form constraints are primarily server-side and errors are not tightly associated with fields
Severity: Medium
Confidence: High
Affected screens: Today Body Check-in, Library Profile, Library New Movement, meal/workout review
Many numeric inputs do not provide browser-level constraints such as min, max, or step:
- Body check-in: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:730
- Profile settings: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:297-317
- Meal review fields: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:717
- Workout review fields: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:697-698
Validation errors are usually rendered as standalone live text without aria-describedby or aria-invalid.
User impact: Users can submit obviously invalid values and receive a generic error after the interaction. Assistive technology users may not know which field caused the error.
Recommended remediation:
- Mirror safe server constraints in the input attributes.
- Add field-specific error IDs.
- Set aria-invalid="true" when invalid.
- Associate errors using aria-describedby.
- Focus the first invalid field after submission.
Items requiring visual or runtime review
These are implementation risks or likely inconsistencies that cannot be fully confirmed without rendering the application in a browser.
A. Narrow viewport layout may be cramped
Severity: Medium, pending visual confirmation
Confidence: Medium
Affected screens: Today, Progress, Library, History
Relevant rules:
- Two-column quick actions remain active on mobile:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:723-728
- Set rows retain multiple fixed-width action and stepper columns:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:705-714
- Library routine cards use a fixed 174px width on mobile:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:781-783
- Desktop navigation remains active until 760px:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:670
Review at:
- 320px
- 360px
- 390px
- 480px
- 760px
- 768px
- 1024px
Specific checks:
- Quick-card text wrapping and CTA visibility
- Exercise set controls and delete buttons
- Long exercise names and last-session references
- History values colliding with chevrons
- Tablet layout with sidebar plus reduced content width
- Library catalog row overflow
B. Meal-details sheet visually diverges from other sheets
Severity: Medium, source evidence high; rendered impact requires visual confirmation
Confidence: High
Affected screen: Today meal details
The meal-details modal uses its own dark palette, radii, border colors, and macro colors:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:613-665
Review whether it feels intentionally distinct or accidentally disconnected from:
- Generic .sheet
- .centered-sheet
- Exercise details sheet
- History detail sheet
If it is not intentionally branded as a special report view, it should use the shared dialog tokens.
C. Dialogs and sticky mobile actions need real-device review
Severity: Medium, pending runtime confirmation
Confidence: Medium
Affected screens: All sheets on mobile
Relevant rules:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:819-823
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:860-861
Review:
- Keyboard behavior when the on-screen keyboard opens
- Sticky action bars obscuring content
- Safe-area behavior on iOS
- Nested scrolling inside centered sheets
- Whether the close button remains visible at maximum content height
- Whether 100dvh fallback behavior is acceptable on older browsers
D. Date and greeting behavior may vary by server/client timezone
Severity: Medium, pending timezone review
Confidence: Medium
Affected screens: Journal shell and Today
The header and Today screen use local Date formatting in client components:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/journal-shell.tsx:12
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:86-99
The route also computes the current date server-side:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/today/page.tsx:13-15
Review around midnight and across time zones. The header date, greeting, selected Today date, and server query date should all use the same explicitly defined timezone policy.
E. Speech input needs browser and permission testing
Severity: Medium, pending runtime review
Confidence: Medium
Affected screens: Today workout capture and meal logging
Speech support is detected using browser-specific APIs:
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/speech-input.ts:9-37
Review:
- Unsupported browsers
- Permission denial
- Starting recognition twice
- Recognition errors thrown synchronously by start()
- Microphone state after navigating away
- Screen-reader announcement of listening/error state
- Whether transcript replacement or insertion is expected
Positive consistency observations
- A dark-first palette is established centrally in /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:1-57.
- Radius and shadow tokens are present and used widely.
- :focus-visible is globally defined: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:69.
- Reduced-motion support is included: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:881-883.
- Mobile navigation accounts for bottom safe-area insets: /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/globals.css:677,679.
- Many destructive icon buttons have meaningful aria-label values.
- Today’s date strip and routine buttons use aria-pressed.
- Login, body, and many Library fields have persistent labels.
- Empty states exist for Progress, Muscle Heatmap, Library, and workout areas, although History is missing one.
- Existing data-layer tests cover important unit conversion, metric, streak, logging-window, and heatmap behavior.
Test coverage
Existing tests
Metrics
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/metrics.test.ts
Covers:
- kg/lb conversion
- BMI
- BMR and TDEE
- Activity multipliers
- Calorie targets
- Streak calculation
- Week completion
- Logging window
- Weighted training volume
- Macro aggregation
- Template position rotation
Muscle heatmap
/Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/muscle-heatmap.test.ts
Covers:
- Muscle-to-renderer mapping
- Fallback muscle groups
- Intensity normalization
- Legend ordering
- Unknown muscle handling
- Shared-region aggregation
Test command and configuration:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/package.json:9-14
- /Users/vegtaco/MyProjects/SimpleFitnessv2/vitest.config.ts:4-8
The test environment is Node-based; no browser DOM test setup is present.
Missing high-value tests
Accessibility and interaction
- Dialog focus placement, focus trap, Escape, and focus restoration
- Active navigation semantics
- Keyboard operation of Library tabs
- Keyboard operation of date/range/filter controls
- Screen-reader labeling of workout and meal capture fields
- Calorie guide progress semantics
- Generated heatmap SVG accessibility
Today screen
- Date strip selection and route replacement
- Starting, cancelling, and finishing a workout
- Autosave debounce behavior
- Saving while newer input is typed
- Set deletion and set-number reindexing
- Invalid set values
- Meal and body-sheet validation
- Speech unsupported/error states
History
- Empty history
- No-results filters
- Invalid date ranges
- Successful deletion
- Failed deletion preserving the dialog and showing an error
- Body-entry display behavior
Library
- Keeping the current tab after a mutation
- Preserving selected routine/search state
- Pending action disabling
- Duplicate-click protection
- Inline server error handling
- Profile and TDEE validation
Progress
- Range filtering
- Empty chart states
- Metric switching when a metric has no data
- Chart data formatting and accessible summaries
- Movement sheet behavior
Responsive and visual regression
No Playwright, Cypress, Storybook, or visual regression setup was found. Add viewport coverage for at least:
- 320px
- 390px
- 768px
- 1024px
- 1440px
Prioritize screenshots and interaction checks for Today’s set editor, mobile navigation, Library catalog rows, History filters, and all sheet variants.
Recommended remediation order
1. Build a shared accessible dialog/sheet primitive.
2. Fix mobile logout access.
3. Correct accent and muted-text contrast.
4. Add semantic state to tabs, filters, ranges, metrics, and navigation.
5. Add History empty/error states and handle deletion failures.
6. Replace Library full reloads with refresh/preserved state.
7. Consolidate typography, spacing, color, and dialog tokens.
8. Add component-level accessibility and interaction tests.
9. Run browser-based responsive, visual, and screen-reader review.