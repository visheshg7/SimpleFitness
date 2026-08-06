Performance audit — SimpleFitnessv2
Scope: static, read-only inspection of rendering, data fetching, database access, network calls, bundles/assets, caching, repeated work, list scalability, loading states, mobile CSS/interaction paths, and tests.
Repository: /Users/vegtaco/MyProjects/SimpleFitnessv2
No files were modified. This was a static audit; production timings, database query plans, and production bundle sizes require runtime profiling.
Executive summary
The most important performance risks are:
1. Every journal route fetches the complete Today dataset in the shared layout, then fetches its own page dataset. /today can execute the expensive Today query twice, while /progress, /history, and /library each perform unnecessary Today queries solely to obtain the streak.
2. Today loads all historical completed sets without a date limit and repeatedly scans them in JavaScript. This will grow with the user's history.
3. History eagerly loads set details for up to 100 workouts even though details are only needed after opening one entry.
4. Workout logging uses many sequential server/database round trips. AI-confirmed workouts, session seeding, quick logging, and set autosave can generate substantial request chatter.
5. Set autosave performs database validation, writes, and invalidates three routes for individual edits.
6. The client bundle contains heavyweight or low-frequency functionality up front: Recharts, both sides and all genders of the muscle-map data, and a large Today client component containing every modal and AI flow.
7. There are no route loading boundaries or Suspense fallbacks. Initial route transitions wait on database work without an application-level skeleton.
8. Only two utility test files exist. There are no query, action, component, E2E, bundle-size, or performance regression tests.
Confirmed code findings
The code pattern is confirmed from source. The exact user-visible magnitude still requires profiling with realistic data and network conditions.
PERF-01 — Full Today query is duplicated by the journal layout
Severity: High
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/layout.tsx:6-12
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/today/page.tsx:6-15
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/progress/page.tsx:5-10
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/history/page.tsx:5-10
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/library/page.tsx:5-10
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/today.ts:6-37
JournalLayout calls:
const today = await getTodayData(ownerId);
The Today page calls getTodayData again. The other journal pages also cause the layout to execute getTodayData, even though they do not render Today data. The layout uses only today.streak.
getTodayData performs six parallel queries initially, followed by up to four additional queries for the selected template, session exercises, current sets, and historical sets.
Likely bottleneck:
- Up to approximately 10 database statements per getTodayData invocation.
- /today can perform the work twice.
- /progress, /history, and /library perform a complete Today data load merely to calculate the streak.
- The layout's result is mostly discarded after the streak is extracted.
User impact:
- Slower first render and route transitions.
- Extra database latency and database compute.
- Unnecessary server-side processing and data transfer.
- The selected historical date on Today can differ from the date loaded by the layout, so the layout query is not even always equivalent to the page query.
Recommended remediation:
1. Replace the layout call with a narrow getJournalShellData(ownerId) query returning only the streak, or preferably a compact streak summary.
2. Use request-level memoization for identical owner/date queries if both layout and page must access the same data.
3. Keep page-specific queries in the page.
4. Consider splitting the Today data query into focused summaries and detail queries.
PERF-02 — All authenticated routes are forced dynamic with no caching strategy
Severity: High
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/layout.tsx:6
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/today/page.tsx:6
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/progress/page.tsx:5
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/history/page.tsx:5
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/library/page.tsx:5
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:57-79
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:74-80
Every journal route declares dynamic = "force-dynamic". There is no use of cache, unstable_cache, route revalidation, or a data cache.
The application also performs broad refreshes after mutations:
- Today actions call router.refresh() in /src/components/today-screen.tsx:61,76,556,583,667,716,729,889.
- Library mutations call window.location.reload() in /src/components/library-screen.tsx:74-80.
Likely bottleneck:
- Every navigation re-runs database queries.
- Every refresh re-executes the shared layout query plus page query.
- The current invalidation calls provide little benefit because the routes are explicitly dynamic.
User impact:
- Repeated latency after logging sets, starting workouts, adding exercises, or saving profile data.
- No reuse of stable library/template data between navigations.
- Full document reloads from Library reset tab, search, selection, and scroll state.
Recommended remediation:
- Keep personalized pages dynamic where necessary, but use request-level memoization and owner-scoped cache tags for data that can safely be cached.
- Cache or memoize relatively stable library and template data.
- Replace window.location.reload() with targeted router.refresh() or optimistic local state updates.
- Revalidate only the affected route/data tag instead of invalidating Today, Progress, and History for every individual set edit.
PERF-03 — Historical Today set query is unbounded and repeatedly scanned in JavaScript
Severity: High
Confidence: High
Classification: Confirmed code finding; production severity depends on history size
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/today.ts:14
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/today.ts:37
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/today.ts:55-78
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/schema.ts:73-89
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/schema.ts:108-124
The completed-session summary is limited to 120 rows, but previousSets has no limit or lower date bound:
const previousSets = await db
  .select({ set: setLogs, session: sessions })
  ...
  .where(and(
    eq(sessions.ownerId, ownerId),
    lt(sessions.sessionDate, today),
    isNotNull(sessions.completedAt),
    eq(setLogs.completed, true)
  ))
The complete historical set result is then repeatedly filtered once per current exercise:
const sets = currentSets.filter(...)
const previous = previousSets.filter(...)
Personal-best calculations also rescan each exercise's historical set list.
Likely bottleneck:
- Database result size grows with every historical completed set.
- Server memory and serialization work grow with history.
- JavaScript work is approximately proportional to current exercises × historical sets.
- The query selects complete setLogs and sessions rows when only a small amount of derived information is needed.
User impact:
- Today becomes slower for users with long workout histories.
- More noticeable on serverless deployments and cold starts.
- Increased Neon data transfer and database work.
- The effect occurs on every Today load, including switching among the 15-day logging window.
Recommended remediation:
- Compute historical PR values in SQL using grouped aggregates or DISTINCT ON queries.
- Query only the latest previous session's sets per exercise.
- If exact all-time PRs are required, return one aggregate row per exercise rather than every historical set.
- Build a Map<exerciseId, ...> once if JavaScript aggregation remains necessary.
- Add appropriate date/owner indexes and verify with EXPLAIN ANALYZE.
PERF-04 — History eagerly loads all workout details for 100 workouts
Severity: High
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/history.ts:7-20
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/history.ts:23-29
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:13-30
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:34-35
getHistoryData loads up to 100 workouts, then loads every set and exercise for all those workouts:
const workoutSets = workoutIds.length
  ? await db.select(...)
      .from(setLogs)
      ...
      .where(inArray(setLogs.sessionId, workoutIds))
  : [];
It then embeds full workout details in every history entry. The client receives all details even though the detail sheet is opened for only one selected entry.
There is already a getWorkoutDetail query, but it is not used by the screen.
Likely bottleneck:
- Server query and response size scale with the total sets in the 100 most recent workouts.
- RSC/client payload includes details that most users never inspect.
- Line 17 repeatedly calls workoutSets.filter(...) twice for every workout.
User impact:
- Slower History initial load.
- Larger RSC payload and client hydration cost.
- More memory and CPU spent rendering/retaining data not currently visible.
- Date/type filters cannot recover entries older than the per-category limit because filtering happens after the capped query.
Recommended remediation:
1. Initial History query should return only summary fields.
2. Load workout details on demand when a workout row is selected.
3. Group workoutSets once by sessionId if eager loading must remain.
4. Move type/date filters to query parameters and apply them in SQL.
5. Add pagination or cursor-based loading.
PERF-05 — Workout start, quick logging, and AI confirmation contain sequential database round trips
Severity: High
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/session.ts:14-40
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/session.ts:59-78
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/session.ts:110-124
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/session.ts:209-241
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:648-665
seedSessionPlan:
- Checks for an existing plan.
- Queries template rows.
- Inserts the plan.
- Queries the plan again.
- Performs one setLogs insert per exercise.
addExerciseToSession calls seedSessionPlan again when a template exists. Even when the plan already exists, seedSessionPlan queries the session plan and attempts a set insert for every planned exercise.
logQuickSets then:
- Calls addExerciseToSession.
- Queries existing sets.
- Performs one upsert per parsed set sequentially.
AI workout confirmation processes parsed exercises in a sequential for...of loop. A workout with many exercises and sets therefore produces many server-action/database round trips.
Likely bottleneck:
- Latency accumulates across remote Neon HTTP requests.
- One AI-confirmed workout can perform dozens of database operations.
- Repeated idempotent onConflictDoNothing writes add unnecessary work.
User impact:
- “Saving…” state can remain visible for a long time on realistic workouts.
- Higher sensitivity to database/serverless latency.
- More opportunities for partial completion if a later exercise fails.
Recommended remediation:
- Make session-plan seeding idempotent with one bulk operation and avoid re-seeding an existing plan.
- Insert initial sets for all exercises in one bulk insert.
- Batch all parsed exercises and sets into a single server action.
- Use one bulk upsert for quick-log sets.
- Use a transaction or an explicit operation-status model so partial AI imports can be safely retried.
- Avoid querying the same session, exercise, and plan repeatedly within one action.
PERF-06 — Individual set autosave causes database and invalidation chatter
Severity: High
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:267-293
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/session.ts:266-305
Each edited set is saved after a 450 ms debounce. saveSet then:
1. Verifies the session.
2. Queries the exercise.
3. Performs an insert/upsert.
4. Revalidates /today, /progress, and /history.
The debounce is per set, not a workout-wide queue. Editing weight and reps can produce multiple independent actions.
Likely bottleneck:
- Multiple server-action requests during a workout.
- Two validation queries plus a write for each set save.
- Three route invalidations for changes that may affect only Today immediately.
User impact:
- Network activity and server load rise as a workout is edited.
- Slower or unreliable connections can show repeated “Saving” states.
- Progress and History are invalidated even when the user is still entering a draft.
Recommended remediation:
- Keep edits local and save on explicit “log set,” blur, or a longer workout-level debounce.
- Queue and coalesce changes by session/exercise.
- Use the existing saveSets endpoint as the normal path, not only as a finish-workout fallback.
- Defer Progress/History invalidation until a set becomes completed or the workout is finished.
- Combine session ownership and exercise validation into fewer queries where possible.
PERF-07 — Library mutations perform a full document reload
Severity: Medium
Confidence: High
Classification: Confirmed code finding
Reference:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:74-80
Successful Library mutations call:
window.location.reload();
Likely bottleneck:
- Full document navigation instead of an RSC refresh or local update.
- Re-execution of authentication, layout, Today data, and Library data.
- Rehydration of the entire client tree.
User impact:
- Noticeably slower create/edit/archive/reorder interactions.
- Search text, selected tab, selected template, and scroll position are lost.
- The reload also triggers the duplicate layout/page data work described above.
Recommended remediation:
- Update local state optimistically for simple mutations.
- Otherwise call router.refresh() inside the existing transition.
- Preserve tab, selection, and search state in the URL or component state.
PERF-08 — AI prompt size and repeated AI requests scale with library size
Severity: Medium
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/ai.ts:10-16
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/ai.ts:48-56
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:789-807
Workout parsing loads every active exercise name and places the entire list into the model prompt:
The available exercise names are: ${exerciseNames.join(", ")}.
Opening exercise details automatically requests AI guidance once:
useEffect(() => {
  ...
  requestGuidance();
}, []);
There is no cache for guidance. Reopening the same exercise can trigger the same external request again.
The OpenRouter request also buffers the full response and allows up to 20 seconds:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/ai.ts:13-45
Likely bottleneck:
- Prompt token count grows with the exercise library.
- Model latency and cost increase as the prompt grows.
- Exercise detail dialogs incur an external request even if the user only wants the last workout or PR.
- Closed dialogs do not cancel the underlying server-side request.
User impact:
- AI parsing and exercise details can take seconds.
- Large libraries make parsing slower and less reliable.
- Repeated guidance requests increase external API cost.
Recommended remediation:
- Use local exact/fuzzy matching first and send only the top candidate exercise names.
- Cap candidate names passed to the model.
- Cache guidance by exercise ID plus exercise updatedAt.
- Make guidance explicitly user-triggered or defer it until the guidance section is visible.
- Add cancellation/timeout handling across the client/server boundary where possible.
- Consider streaming only if the response format and UX support it.
PERF-09 — Today’s client component is not isolated or memoized at the exercise-row boundary
Severity: Medium
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:34-202
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:152-164
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:205-249
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:438-463
TodayScreen contains the workout, AI capture, meal, body, exercise details, swap, add-exercise, and meal-details flows in one client module.
ExerciseRow uses forwardRef but is not wrapped in memo. Opening a modal, changing action state, setting an error, or changing pending state rerenders the parent and invokes every visible ExerciseRow.
SetRow is memoized, but that does not prevent its parent ExerciseRow from rendering.
ExerciseRow also performs render-phase synchronization:
if (prevServerSets !== data.sets) {
  setPrevServerSets(data.sets);
  setSets(...);
}
Likely bottleneck:
- Parent-level state changes cause all exercise rows to be revisited.
- Large workouts with many sets pay the cost of recreating row-level calculations and callbacks.
- Server refreshes cause local/server merge work for every exercise.
User impact:
- Modal opening and route refreshes can cause visible UI work.
- Low-end mobile devices are more sensitive when a workout contains many rows and sets.
Recommended remediation:
- Wrap ExerciseRow in memo.
- Move modal/sheet components into separate modules and isolate their state.
- Keep stable callbacks where possible.
- Replace render-phase synchronization with an effect or a carefully designed reducer/store.
- Profile with React DevTools Profiler before and after; the current structural risk is confirmed, but the actual frame cost is not.
PERF-10 — Progress bundle includes Recharts, and muscle-map data statically includes all bodies
Severity: Medium
Confidence: High for bundle inclusion; actual size requires build analysis
Classification: Confirmed code finding, production verification required for magnitude
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/package.json:16-26
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/progress-screen.tsx:1-10
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/musclemap/data/bodyPathData.ts:7-12
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/musclemap/index.ts:8-80
ProgressScreen is a client component and imports Recharts unconditionally. The muscle-map entry point exports path data, and bodyPathData.ts statically imports:
- Male front
- Male back
- Female front
- Female back
The heatmap renders only one gender, but the module graph statically references all four datasets.
TodayScreen is also a large client module importing all icons, speech input, AI interactions, and all sheets.
Likely bottleneck:
- Progress route JavaScript includes a charting library for two relatively simple charts.
- The progress client graph may include unused gender/path data.
- Today’s initial route graph includes low-frequency modal and AI code.
User impact:
- Higher JavaScript download, parse, and hydration cost, especially on mobile.
- Slower first interaction on the Progress and Today routes.
- Memory retained for SVG path data that is not currently displayed.
Recommended remediation:
- Measure production client chunks with a bundle analyzer.
- Lazy-load the Progress chart region or replace simple charts with lightweight SVG/CSS implementations.
- Split muscle-map data by gender and load only the selected gender.
- Split low-frequency Today sheets and AI flows with dynamic imports.
- Avoid treating the presence of a dependency as proof of a specific byte cost until the production build is measured.
PERF-11 — Muscle heatmap rebuilds two full SVG trees on each relevant update
Severity: Medium
Confidence: High for repeated work; impact requires profiling
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/muscle-heatmap.tsx:40-74
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/musclemap/render/bodyRenderer.ts:108-252
The effect builds a complete front SVG and back SVG, then replaces both DOM subtrees:
front.replaceChildren(buildMap("front"));
back.replaceChildren(buildMap("back"));
buildBodySvg creates SVG elements and paths for every body part each time.
This occurs when bodyGender or highlights changes. The heatmap changes when the selected progress range changes or when refreshed data creates a new heatmap.
Likely bottleneck:
- DOM allocation and SVG path construction.
- Layout/paint work for complex SVGs.
- Repeated replacement rather than updating only changed fill attributes.
User impact:
- Progress range switching may momentarily consume more CPU.
- Lower-end mobile devices may show frame drops during heatmap updates.
Recommended remediation:
- Cache static SVG geometry per gender/side.
- Update fills/opacities in place when only intensity changes.
- Defer or lazy-render the back view if it is below the fold.
- Profile SVG construction and paint time before optimizing further.
PERF-12 — Library and Today list data are broader than the UI needs
Severity: Medium
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/today.ts:10-17
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/library.ts:7-14
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/schema.ts:29-42
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:225
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:691-701
Several queries use select().from(...), returning all columns, including timestamps and fields not needed by the particular screen.
Examples:
- Today loads full active exercise rows for its library selectors.
- Library loads full exercise rows, full templates, and all template assignments.
- Today serializes the entire library to the client for dropdowns, AI mapping, and datalist options.
The add-to-template option also performs:
data.exercises.filter(... !selectedTemplate.exercises.some(...))
This is an O(exercises × assignments) render-time operation.
Likely bottleneck:
- Larger RSC payloads and hydration data than necessary.
- Repeated filtering on every render.
- Library and template data grows without pagination.
User impact:
- More client memory and render work as the library grows.
- Slower Library and Today hydration with large exercise catalogs.
Recommended remediation:
- Project only required fields per query.
- Build Set objects for assigned exercise IDs.
- Memoize filtered options.
- Search or paginate the exercise catalog server-side for large libraries.
- Keep AI matching data separate from UI display data.
PERF-13 — Database indexes do not fully match the history/progress query patterns
Severity: Medium
Confidence: Medium
Classification: Structural finding; query-plan verification required
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/schema.ts:73-89
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/today.ts:13-14,37
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/progress.ts:12-17
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/schema.ts:145-159
The sessions table has:
index("sessions_owner_completed_idx").on(table.ownerId, table.completedAt)
But the main history/progress queries filter on owner, completed status, and session date, and often order by session date. The existing index does not directly support the session-date ordering/filtering pattern.
There are also two indexes covering the same body metric key:
uniqueIndex("body_metrics_owner_date_unique")
index("body_metrics_owner_date_idx")
The non-unique body metric index is redundant because the unique index already covers (owner_id, metric_date).
Likely bottleneck:
- Sorting or scanning completed sessions as data grows.
- Unnecessary write/storage overhead from the redundant body metric index.
Recommended remediation:
- Verify with EXPLAIN (ANALYZE, BUFFERS) against realistic row counts.
- Consider a partial/composite index shaped around completed sessions and session date, such as owner/date with a completed predicate.
- Remove the redundant body metric index through a migration if query plans confirm the unique index is sufficient.
- Avoid adding indexes solely from static inspection; confirm workload and planner behavior first.
PERF-14 — Set deletion and template reordering use sequential update loops
Severity: Medium
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/session.ts:309-328
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/library.ts:16
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/schema.ts:56-70
Deleting a set selects all following set numbers and updates them one at a time. Template reordering performs two sequential update loops over every template.
These operations are likely small today, but each iteration is a separate database call over the Neon HTTP driver.
User impact:
- Set deletion latency grows with the number of following sets.
- Template reorder latency grows with the number of templates.
- Unique-index workaround updates amplify write traffic.
Recommended remediation:
- Use a single SQL update for set-number shifts where safe.
- Use a transactional bulk reorder operation.
- Consider sparse ordering keys or a database-side reorder procedure if template counts become large.
PERF-15 — No route-level loading boundaries or Suspense fallbacks
Severity: Medium
Confidence: High
Classification: Confirmed missing capability
References:
- Dynamic route files under /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/
- No loading.tsx files were found.
- No Suspense usage was found in the application source.
The page components await database queries before rendering their client screens. The existing pending states cover mutations and AI operations, but not initial route data fetching.
Likely bottleneck:
- Perceived latency equals database/auth/query latency before meaningful content appears.
- There is no progressive rendering for charts, history details, or the Today workout.
User impact:
- Route transitions can feel stalled on slow networks or cold database compute.
- Users receive no immediate skeleton or content placeholder.
Recommended remediation:
- Add /src/app/(journal)/loading.tsx for a shared shell skeleton.
- Add route-specific loading states for Progress, History, Library, and Today.
- Split expensive sections with Suspense boundaries where possible.
- Add error boundaries for database and AI failures.
PERF-16 — No virtualization or pagination for growing lists
Severity: Medium
Confidence: High
Classification: Confirmed code finding
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/history.ts:9-12
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:22-27
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/library.ts:9-14
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/library-screen.tsx:251-262
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:152-166,419-430
History renders up to 300 combined entries in one client tree: 100 workouts, 100 meals, and 100 body metrics. Library renders every exercise. Today renders every exercise and every set in the active workout.
There is no virtualization, cursor pagination, or incremental loading.
Recommended remediation:
- Keep the current caps as a short-term guard.
- Add server-side cursor pagination for History.
- Load workout details only when selected.
- Add search/pagination or windowing for large exercise libraries.
- Set practical limits on template exercise counts and set counts, with tests for the limits.
Items requiring profiling or production verification
These are plausible risks where static inspection cannot establish the actual bottleneck magnitude.
Bundle and asset verification
Run a production build with a bundle analyzer and inspect:
- Progress route client chunk size with Recharts.
- Muscle-map path data contribution.
- Today route chunk size from the monolithic client component.
- DM Sans font transfer size for four weights from /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/layout.tsx:2-5.
- JavaScript parse/hydration time on a mid-range and low-end mobile device.
No raster image assets or public directory were found, so image decoding or image optimization is not currently a significant repository concern.
Database verification
Use representative fixtures:
- 1,000 exercises.
- 500 completed sessions.
- 10,000–50,000 set logs.
- 500 meals and body metrics.
- 50–100 templates/assignments.
Measure:
- EXPLAIN (ANALYZE, BUFFERS) for Today, History, and Progress queries.
- Neon query latency and cold-start latency.
- Rows returned and bytes transferred per query.
- Query count per route and mutation.
- Whether the current indexes avoid sort or sequential scan plans.
The likely highest-value query measurements are:
- getTodayData historical previousSets.
- Completed sessions ordered by sessionDate.
- History's IN (...) set detail query.
- Progress's joined workoutSets query.
Rendering verification
Use React DevTools Profiler and Chrome Performance:
- Open/close Today sheets with 10, 20, and 30 exercises.
- Change modal/pending/error state while a workout is populated.
- Drag number inputs on a 320px or 375px mobile viewport.
- Switch Progress ranges repeatedly.
- Compare heatmap SVG construction and paint time.
Network and AI verification
With throttled 3G and production-like Neon latency, measure:
- Initial /today, /history, /progress, and /library navigation.
- Number of RSC/server-action requests per route.
- Requests generated by editing one set.
- Save duration for a 5-exercise and 10-exercise AI workout.
- OpenRouter prompt token count as the exercise library grows.
- P50/P95 AI parsing and guidance latency.
- Behavior when the user closes a dialog while an AI request is pending.
Existing tests
Only two test files were found:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/metrics.test.ts
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/muscle-heatmap.test.ts
They cover:
- Unit conversion.
- BMI/BMR/TDEE calculations.
- Calorie targets.
- Streak and date-window logic.
- Volume and macro aggregation.
- Template position selection.
- Muscle-map aggregation and normalization.
The repository defines test/typecheck/lint/build scripts in:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/package.json:5-14
I did not claim those commands passed because shell execution was unavailable in this audit environment.
Missing tests with performance value
Query and database tests
Add fixture-backed tests for:
- getTodayData with empty, active, completed, and historical sessions.
- Today behavior with thousands of historical set logs.
- History summary query versus lazy workout detail query.
- Progress query row limits and date boundaries.
- Query result projections to prevent accidental select() overfetch.
- Query count assertions for route-level data loaders.
- Ownership filters and date filters.
Server-action integration tests
Cover:
- seedSessionPlan idempotence.
- Starting a session with many exercises.
- Adding an exercise to an already-seeded session without re-seeding every plan set.
- Batch saveSets.
- Autosave/upsert behavior.
- AI workout import with multiple exercises and partial failure.
- Set deletion and number shifting.
- Template reorder behavior with unique indexes.
- Library mutation behavior without full page reload.
Component tests
Cover:
- Exercise-row rerender behavior using React Profiler or render counters.
- Local set drafts surviving server refreshes.
- Meal and exercise detail sheets.
- Large History and Library lists.
- Progress chart fallback/loading states.
- Mobile layouts at 320px, 375px, and 390px widths.
E2E and performance tests
Add Playwright or equivalent scenarios for:
- Cold login to Today.
- Navigation across all journal routes.
- Starting a workout, editing sets, and finishing it.
- Logging a multi-exercise AI workout.
- History filtering and opening details.
- Mobile 3G route navigation.
- Offline/slow AI behavior.
- Production bundle-size budgets.
- Lighthouse/Web Vitals budgets, especially LCP, INP, TBT, and JavaScript transfer size.
Priority remediation order
1. Remove the full getTodayData call from the shared journal layout.
2. Replace unbounded historical set loading with SQL aggregates/latest-session queries.
3. Make History summary-only and lazy-load workout details.
4. Batch workout/session writes and reduce autosave request frequency.
5. Replace Library full reloads with targeted refresh/local updates.
6. Add route loading boundaries.
7. Measure and split Recharts, muscle-map data, and Today’s low-frequency client modules.
8. Add query/action integration tests and large-fixture performance tests.