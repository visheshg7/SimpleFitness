# Three-Lens Audit Remediation Plan

## Scope and baseline

- Application: Next.js App Router with Server Actions, Drizzle ORM, Neon Postgres, shared-passcode JWT sessions, and server-side OpenRouter calls.
- Product boundary: explicitly private and single-user today. Global exercises/templates are therefore a product assumption, not tenant-safe authorization.
- Current validation baseline: `npm run test` passes 19 tests in 2 files; `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- Full `npm audit` reports four moderate development dependency findings in the `drizzle-kit`/`esbuild` chain; `npm audit --omit=dev` reports no production dependency findings.
- No browser accessibility tests, end-to-end flows, database query-plan benchmarks, production profiling, or deployment configuration verification are present.

## Priority findings

### Security

1. Replace the process-local global login limiter with distributed/IP-aware throttling and progressive delay. The current `Map` keyed by `single-login` creates a global lockout and is bypassable across instances.
2. Enforce production secret strength at startup. Require a high-entropy `SESSION_SECRET`, use a high-entropy password or Argon2id/scrypt hash for `APP_PASSWORD`, and reject weak/reused values.
3. Add revocable server-side sessions or a server-maintained session/password version. Logout currently only deletes the browser cookie while a 14-day JWT remains valid if stolen.
4. Add browser security headers: CSP, frame protection, `nosniff`, strict referrer policy, HSTS after HTTPS verification, and a restrictive permissions policy that accounts for microphone use.
5. Add authenticated AI quotas/rate limits, provider spending alerts, guidance caching, and explicit user consent/privacy disclosure before sending health/nutrition text to OpenRouter.
6. Validate every exported Server Action at runtime, including UUIDs, booleans, bounded strings, and login input. Replace raw database/internal exception messages with stable client-safe errors and redacted server logs.
7. Enforce the singleton deployment assumption or introduce ownership on global exercise/template data before supporting more than one user. Add explicit session-plan membership checks to `saveSet` and `saveSets`.
8. Complete secret-file protection with `.env*` plus `.env.example` exception, add secret scanning, and review/rotate any credentials that may exist in tracked history.
9. Fix privacy operations: expose owner-scoped body-metric deletion in History and define export/deletion/retention behavior for raw meal and workout text.
10. Remove or constrain the body-map `innerHTML` tooltip API, and narrow proxy exemptions to explicit public/static routes rather than dotted paths and all `/api` paths.

### Performance

1. Remove `getTodayData` from the shared journal layout. Add a narrow streak query or memoized shell query; `/today` currently performs the full Today load twice and every other journal route performs it unnecessarily.
2. Replace unbounded `previousSets` retrieval with SQL aggregates/latest-session queries. If JavaScript aggregation remains, index/group once rather than filtering the full history once per exercise.
3. Make History summary-only on initial load, fetch `getWorkoutDetail` when a row is opened, and add SQL-level filtering plus cursor pagination.
4. Batch session-plan initialization, quick-log writes, and AI workout imports. Avoid re-seeding an existing plan and use a transaction or retry-safe operation model for multi-step imports.
5. Coalesce set autosaves, use workout-level or explicit save boundaries, and defer Progress/History invalidation until completed work or workout completion.
6. Replace Library `window.location.reload()` with targeted refresh or optimistic local state updates that preserve tab/search/selection/scroll context.
7. Add route-level `loading.tsx`, Suspense boundaries, and error boundaries. Keep dynamic behavior where required but use owner-scoped/request-level caching for stable library data.
8. Measure and split heavyweight client paths: Recharts, all body-map genders, and low-frequency Today sheets/AI flows. Add production chunk budgets before making a library replacement decision.
9. Reduce client/query payloads with explicit projections, `Set`-based membership checks, server-side catalog search/pagination, and bounded template/set counts.
10. Verify indexes with representative Neon fixtures and `EXPLAIN (ANALYZE, BUFFERS)`. Consider a completed-session/date index and remove the redundant body-metric index only after plan confirmation.

### UI/UX consistency and accessibility

1. Build one shared accessible Dialog/Sheet primitive used by Today, History, Progress, and Library. It must move focus on open, trap focus, close on Escape/backdrop policy, restore trigger focus, label/describe content, and manage mobile scroll.
2. Add semantic state to controls: `aria-current="page"` for navigation, `aria-pressed` and named groups for range/filter/metric controls, and complete tab semantics or a simpler button switcher for Library.
3. Add persistent accessible labels and field error associations to workout/meal capture and numeric forms. Mirror safe server constraints with `min`, `max`, and `step`; use `aria-invalid` and `aria-describedby`.
4. Make calorie guides real progressbars with current/target text and provide text/table alternatives for Recharts. Mark the generated heatmap SVG as an accessible image with a meaningful description.
5. Restore mobile account access by adding logout/settings to the mobile navigation or header menu.
6. Add History empty, no-results, and invalid-date-range states. Surface deletion failures and only close/refresh after a confirmed successful response. Expose body-metric deletion.
7. Replace native `window.alert`, `confirm`, and `prompt` with shared styled confirmation/text-entry patterns and consistent inline `aria-live` status/error feedback. Disable all relevant mutation controls while pending.
8. Correct contrast tokens: avoid light text on the current `#E8402C` accent for normal text unless measured compliant, and do not use `--line` as readable small text. Add automated contrast checks.
9. Consolidate semantic color, spacing, typography, focus, dialog, card, and button tokens. Unify the bespoke meal-details sheet with the shared visual system unless the divergence is an intentional report-view pattern.
10. Standardize font weights to loaded DM Sans weights or load 800 explicitly. Run responsive and visual review at 320, 390, 768, 1024, and 1440px, including keyboard, safe-area, long-name, and speech-permission scenarios.

## Recommended implementation sequence

1. **Safety boundary:** harden secrets/session validation, action schemas, ownership/session-plan checks, security headers, proxy rules, `.env` ignores, and AI rate/privacy controls.
2. **Data correctness:** fix set membership authorization, singleton enforcement, deletion behavior, and error handling before changing query shapes.
3. **Data/query performance:** split shell streak data from Today data, bound/aggregate Today history, lazy-load History details, batch writes, and validate indexes with realistic fixtures.
4. **Interaction foundation:** introduce shared Dialog/Sheet, Button/status/form primitives, then migrate all screens to remove native dialogs and duplicated modal behavior.
5. **Accessibility and responsive polish:** semantic control states, labels/errors, progress/chart alternatives, mobile logout, empty states, contrast/token cleanup, and viewport review.
6. **Performance measurement:** add bundle analysis, React/browser profiling, query-count assertions, route timing, and mobile throttling before deciding on deeper rewrites.

## Validation plan

- Unit/integration: authentication token tampering/expiry/revocation, weak-secret startup, every action's malformed input, IDOR/ownership, session-plan membership, delete failures, AI quotas/upstream failures, and batch idempotency.
- Database: fixture-backed query tests and Neon `EXPLAIN (ANALYZE, BUFFERS)` for Today, History, Progress, completed-session ordering, and set-log joins.
- Browser/E2E: login/logout, all journal routes, workout lifecycle, autosave/batch save, AI review, meal/body flows, History filtering/deletion, Library mutation state preservation, dotted paths/API auth, headers, and cross-origin Server Action behavior.
- Accessibility: automated axe/contrast checks plus keyboard tests for dialogs, tabs, filters, ranges, navigation, forms, and chart/heatmap alternatives.
- Responsive/visual: screenshots and interaction checks at 320, 390, 768, 1024, and 1440px; test mobile keyboard, safe areas, sheet scrolling, long labels, and speech permissions.
- Performance budgets: query count/bytes per route, History payload size, set-edit request count, AI prompt size/latency, production JS transfer/parse/hydration, and LCP/INP/TBT on throttled mobile.
- Supply chain: resolve the development `drizzle-kit`/`esbuild` audit findings without applying the breaking `npm audit fix --force` recommendation blindly; add lockfile and secret scanning in CI.

## Deployment verification required

- Confirm HTTPS redirect, Secure cookie behavior, canonical host, no caching of authenticated responses, Server Action origin checks, preview/production database separation, least-privileged Neon role, TLS connection, branch permissions, backups, and alerting.
- Confirm OpenRouter/model retention, training, geographic processing, contractual/privacy requirements, and browser Web Speech behavior.
- Confirm `NODE_ENV=production`, strong unique environment secrets, runtime Node version compatible with Next.js 16.3, and no secret/input leakage in logs or monitoring.

## Out of scope unless product direction changes

- Multi-tenant redesign, account-based authentication, row-level security, and owner-scoped global exercise/template schema are not required for the current private single-user product, but the deployment must enforce that boundary and must not be treated as future-proof authorization.
