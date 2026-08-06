Repository: /Users/vegtaco/MyProjects/SimpleFitnessv2
Audit date: 2026-08-07
Modification status: No files were modified.
Executive summary
The application has a reasonable baseline for a deliberately private, single-user MVP:
- Protected pages re-check the signed session cookie.
- Server Actions generally call requireSession() before mutation.
- Owner-scoped tables use the authenticated owner ID.
- Drizzle queries are parameterized; no obvious SQL injection path was found.
- Most mutation payloads use bounded Zod schemas.
- The OpenRouter key is server-only.
- AI responses are schema-validated before persistence.
- User-controlled text is generally rendered through React text nodes rather than raw HTML.
- The session cookie is HTTP-only, SameSite=Lax, and Secure when NODE_ENV=production.
The most important risks are:
 1. The shared-passcode login guard is process-local and globally locks out all users on an instance.
 2. Password and session-secret strength are not enforced strongly enough.
 3. Stolen session cookies remain valid for up to 14 days and cannot be revoked individually.
 4. No application security headers are configured.
 5. Authenticated AI operations have no meaningful rate, quota, or cost controls.
 6. Sensitive nutrition, body-metric, and workout text is sent to OpenRouter without an explicit privacy boundary in code.
 7. Several Server Actions rely on TypeScript types instead of runtime validation.
 8. Global exercises/templates and incomplete session-plan authorization are safe only under the stated single-user assumption.
 9. Secret-file ignore rules are incomplete.
10. There are no authentication, authorization, integration, browser, or deployment security tests.
Confirmed findings
F-01 — Login rate limiting is ineffective across instances and enables global lockout
Severity: Medium; High if the application is publicly reachable and relies on this as its primary brute-force control
Confidence: High
Status: Confirmed
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(auth)/login/actions.ts:9-17
- /Users/vegtaco/MyProjects/SimpleFitnessv2/README.md:17
The limiter is an in-memory Map keyed by the constant "single-login":
const attempts = new Map<string, { count: number; expires: number }>();
After eight failed attempts, it blocks all login attempts handled by that process for five minutes. It is not keyed by IP, client, account, or risk context.
Impact scenario:
- An attacker sends eight incorrect login attempts.
- All legitimate users on that instance are blocked for five minutes.
- On Vercel or another multi-instance deployment, each instance has a separate limiter, so an attacker can bypass the control by reaching different instances.
- Instance restarts reset the limiter.
- The shared passcode remains vulnerable to distributed guessing.
Recommended remediation:
- Add edge/WAF rate limiting by source IP and route.
- Add a distributed limiter backed by Redis, a managed rate-limit service, or a carefully designed database table.
- Use progressive delays rather than a single global lockout.
- Add a global account-level threshold without allowing one source to lock out every legitimate user.
- Consider restricting the application behind an identity-aware proxy, VPN, or access gateway if it remains single-user.
F-02 — Weak credential requirements and low session-secret minimum
Severity: Medium
Confidence: High
Status: Confirmed weakness; exploitability depends on deployed values
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/auth.ts:7-10
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(auth)/login/actions.ts:11-17
- /Users/vegtaco/MyProjects/SimpleFitnessv2/.env.example:2-3
The application only requires SESSION_SECRET to be 24 characters. APP_PASSWORD has no minimum length or entropy validation beyond being nonempty during comparison.
The JWT signing key directly controls access because the token contains the owner ID:
new SignJWT({ ownerId })
Impact scenario:
- A human-readable or reused SESSION_SECRET can be brute-forced offline if a session token is obtained.
- A guessed signing secret permits forged JWTs and complete authenticated access.
- A weak APP_PASSWORD can be guessed online, especially because the current limiter is not distributed.
- The .env.example recommendation of 32 characters is not enforced by the application.
Recommended remediation:
- Require a cryptographically random secret generated from at least 32 random bytes.
- Fail startup in production if the secret does not meet a stronger entropy/length requirement.
- Use a high-entropy passphrase or store a password hash, preferably Argon2id or scrypt.
- Compare password hashes rather than raw environment strings.
- Do not reuse APP_PASSWORD or SESSION_SECRET across environments or applications.
- Add issuer, audience, and a unique application-specific cookie name to the JWT validation policy.
F-03 — Session tokens cannot be revoked before their 14-day expiry
Severity: Medium
Confidence: High
Status: Confirmed
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/auth.ts:4-18
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/auth.ts:21-28
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(auth)/login/actions.ts:21-28
The JWT is self-contained and valid for 14 days. Logout only deletes the browser cookie. There is no server-side session record, token identifier, revocation list, or password-generation/version claim.
Impact scenario:
- An attacker steals a session cookie.
- The legitimate user logs out or changes APP_PASSWORD.
- The stolen token remains accepted until expiry or until SESSION_SECRET is rotated.
- Every authenticated Server Action remains available to the attacker during that period.
Recommended remediation:
- Use server-side sessions with hashed session identifiers and revocation.
- Alternatively, add a server-maintained session-version/password-version claim and reject old versions.
- Use shorter access-token lifetimes with rotation.
- Provide a “revoke all sessions” operation.
- Use a __Host--prefixed cookie name in production to reduce cookie-tossing risks.
F-04 — No application-level browser security headers
Severity: Medium
Confidence: High
Status: Confirmed absent in repository; hosting-platform defaults require verification
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/next.config.ts:3-10
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/layout.tsx:12-14
No headers are configured for:
- Content Security Policy
- Clickjacking protection
- HSTS
- MIME sniffing protection
- Referrer policy
- Permissions policy
Impact scenario:
- If the site can be framed, an attacker may trick an authenticated user into clicking destructive controls such as delete, cancel, or archive actions.
- Without CSP, a future XSS bug has a larger blast radius.
- Without HSTS, the first HTTP request may be exposed to downgrade or interception if the deployment does not enforce HTTPS independently.
- The browser may send more referrer information than necessary.
Recommended remediation:
Configure headers through next.config.ts or the deployment platform, including at minimum:
- Content-Security-Policy
- frame-ancestors 'none' or an appropriate allowlist
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Strict-Transport-Security after HTTPS is confirmed
- Permissions-Policy, with microphone access explicitly limited if speech input requires it
Test CSP in report-only mode first because Next.js fonts, React development behavior, and any inline styles may require policy adjustments.
F-05 — Authenticated AI operations have no rate, quota, or cost controls
Severity: Medium
Confidence: High
Status: Confirmed
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/ai.ts:10-41
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/meal.ts:12-17
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/ai.ts:13-45
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/today-screen.tsx:789-793
All AI actions require authentication, but there is no per-session, per-IP, per-action, or per-day limit. Exercise guidance is automatically requested when an exercise details sheet opens.
Impact scenario:
- Anyone holding a valid session cookie can repeatedly invoke:
- workout parsing,
- meal parsing,
- exercise guidance,
- exercise question answering.
- This can consume OpenRouter quota and incur unexpected charges.
- Repeated requests can consume server concurrency and database resources.
- A large exercise library increases the prompt sent to the model.
Recommended remediation:
- Add server-side rate limits and daily quotas.
- Cache exercise guidance by exercise ID and model/version.
- Require an explicit user action before expensive guidance generation.
- Add provider-side spending limits and alerting.
- Track request counts and failures without logging raw health data.
- Consider separate limits for parsing and free-form question answering.
F-06 — Sensitive health and nutrition data is sent to a third-party AI provider
Severity: Medium from privacy/compliance perspective
Confidence: High
Status: Confirmed data flow; provider retention/training behavior requires verification
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/ai.ts:20-27
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/ai.ts:48-67
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/ai.ts:80-85
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/meal.ts:12-26
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/schema.ts:127-143
Raw workout and meal text is sent to OpenRouter. The database also persistently stores raw meal input and parsed nutrition data.
This data may include:
- body weight,
- body-fat percentage,
- sex and birth year,
- dietary information,
- workout and injury-related notes,
- free-form health context entered by the user.
Impact scenario:
- A user enters sensitive information in a meal or workout note.
- The full text is transmitted to OpenRouter.
- Provider retention, logging, training use, geographic processing, and contractual handling determine the resulting privacy exposure.
The README says audio is never uploaded, but the browser Web Speech API may process audio through a browser vendor depending on browser implementation. The application itself does not directly upload audio.
Recommended remediation:
- Document the AI data transfer prominently before use.
- Verify OpenRouter/model-provider retention and training policies.
- Use a provider agreement appropriate for health-related data if required.
- Minimize prompts and avoid sending unnecessary identifiers or personal details.
- Consider local or self-hosted inference for sensitive data.
- Add a configurable “disable external AI” setting.
- Define retention and deletion behavior for stored raw input.
F-07 — Several Server Actions lack runtime validation and return raw exception messages
Severity: Low to Medium
Confidence: High
Status: Confirmed
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/library.ts:11-22
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/session.ts:42-79
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/session.ts:332-357
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/meal.ts:32-34
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/body.ts:26-27
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/delete.ts:9-17
Examples include:
- chooseTemplate() and startSession() use a TypeScript input type rather than parsing unknown with Zod.
- finishSession(), cancelSession(), deleteMeal(), and deleteBodyMetric() accept IDs without UUID validation.
- login() accepts an unbounded string.
- archiveExercise() trusts the runtime type of archived.
- Several wrappers return error.message directly to the client.
Server Action inputs are network inputs; TypeScript types do not exist at runtime.
Impact scenario:
- A direct Server Action request sends malformed IDs, missing fields, oversized strings, or wrong primitive types.
- The request reaches Drizzle/Postgres or throws before the intended validation layer.
- Database constraint names or internal error text may be exposed to the caller.
- Repeated malformed requests can generate noisy errors and unnecessary database work.
This is not an SQL injection finding. Drizzle’s parameterized expressions prevent the identified values from becoming SQL syntax.
Recommended remediation:
- Define a Zod schema for every exported Server Action.
- Validate UUIDs, enums, booleans, strings, and maximum lengths at the first line after authentication.
- Cap login input length explicitly.
- Convert database errors to stable generic messages.
- Log detailed errors server-side with sensitive values redacted.
- Add tests that invoke actions with malformed direct POST payloads.
F-08 — Global template and exercise data is only authorized by the single-user assumption
Severity: Low for the current product; High if the application is later exposed to multiple users
Confidence: High
Status: Conditional but architecturally important
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/schema.ts:29-71
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/library.ts:13-21
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/queries/library.ts:7-14
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(auth)/login/actions.ts:19-21
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/seed.ts:112-116
workoutTemplates, exercises, and templateExercises have no owner relationship. Any authenticated session can mutate them. The login system itself is a shared passcode and selects the first user row.
This is consistent with the stated single-user design, but it is not a multi-tenant authorization model.
Impact scenario if the deployment evolves:
- A second authenticated principal could rename, delete, reorder, archive, or replace data belonging to every other principal.
- A compromised shared passcode grants full application-wide administrative access.
- If multiple rows exist in users, both seeding and login use an arbitrary first row rather than enforcing a singleton.
Recommended remediation:
If the app remains strictly single-user:
- Enforce the singleton assumption operationally.
- Add a database singleton constraint or configuration check.
- Fail startup if more than one owner exists.
- Protect the deployment behind an access gateway where practical.
If multi-user support is planned:
- Add owner_id to templates, exercises, and assignment tables.
- Add ownership checks to every mutation and query.
- Add database row-level security or equivalent defense in depth.
- Replace the shared passcode with account-based authentication.
F-09 — Set logging does not verify that the exercise belongs to the session plan
Severity: Medium for data integrity
Confidence: High
Status: Confirmed
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/session.ts:266-306
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/db/schema.ts:91-124
saveSet() confirms that the session belongs to the authenticated owner and that the exercise exists, but it does not confirm that the exercise is present in session_exercises.
saveSets() has the same issue: it verifies that exercise IDs exist but not that they are assigned to the supplied session.
The database foreign key only guarantees that the exercise exists; it does not guarantee session-plan membership.
Impact scenario:
A caller with a valid session can submit a valid session ID and any existing exercise ID. The resulting set is associated with the workout and appears in history/progress even though that movement was never part of the session plan.
This is primarily an integrity issue in the current single-user product, but it makes auditability and historical correctness weaker.
Recommended remediation:
- Before saving, query session_exercises for every (sessionId, exerciseId) pair.
- Permit the explicit quick-log path only when it atomically creates the session-plan row first.
- Consider a database design that represents valid session exercises more directly.
- Add tests for unknown-to-session exercises, archived exercises, and duplicate batch entries.
F-10 — Environment-file ignore rules do not cover common deployment-specific secret files
Severity: Medium secret-management risk
Confidence: High
Status: Confirmed repository configuration gap
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/.gitignore:6-7
- /Users/vegtaco/MyProjects/SimpleFitnessv2/drizzle.config.ts:5-9
- /Users/vegtaco/MyProjects/SimpleFitnessv2/.env.example:1-5
Only .env and .env.local are ignored. Files such as the following are not covered:
- .env.production
- .env.development
- .env.test
- .env.production.local
- .env.development.local
The application and migration tooling explicitly load several of these names.
An .env file is present in the workspace, but its contents were not inspected. No hardcoded non-placeholder secret was found in the inspected source and documentation.
Impact scenario:
A developer creates .env.production or .env.development.local with database credentials or API keys and accidentally commits it.
Recommended remediation:
Use a pattern such as:
.env*
!.env.example
Then verify that all intended environment files remain ignored. Add:
- secret scanning in CI,
- pre-commit secret detection,
- repository history scanning,
- credential rotation procedures.
F-11 — Body-metric deletion is implemented but not exposed in the history UI
Severity: Low to Medium privacy risk
Confidence: High
Status: Confirmed
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/body.ts:26-27
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/components/history-screen.tsx:30-35
deleteBodyMetric() exists, but the History UI only renders deletion for entries other than body. The body entry path is therefore not removable from the visible history interface.
Impact scenario:
A user cannot remove a previously saved weight, BMI, or body-fat record through the normal UI. This conflicts with privacy expectations for personal health data.
Recommended remediation:
- Add an owner-scoped body-metric delete control.
- Confirm deletion behavior and revalidate progress/history.
- Add an account-wide data deletion and export path if this becomes a hosted service.
- Define retention rules for raw meal and workout text.
F-12 — Generic innerHTML sink in the body-map library
Severity: Low; Medium if reused with user-controlled tooltip content
Confidence: High for the sink, low for current exploitability
Status: Conditional
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/musclemap/view/bodyView.ts:36
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/musclemap/view/bodyView.ts:750-762
The library accepts a TooltipRenderer that may return a string, then inserts that string with innerHTML.
The current application’s MuscleHeatmap uses buildBodySvg() directly and does not provide a tooltip renderer, so no current stored-XSS path was found. User values elsewhere are rendered through React text nodes.
Impact scenario if later connected to user data:
A custom exercise name, note, or database-backed label reaches a tooltip renderer and is interpreted as HTML/JavaScript.
Recommended remediation:
- Prefer textContent or DOM node construction.
- Remove the string-returning tooltip API if possible.
- If HTML is a deliberate feature, sanitize with a well-maintained sanitizer and enforce CSP.
- Add a regression test containing HTML and event-handler payloads.
F-13 — Proxy authentication contains fail-open path patterns
Severity: Low currently; Medium if new routes are added
Confidence: High for code behavior; low for current data exposure
Status: Conditional
References:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/proxy.ts:4-14
The proxy skips authentication when:
pathname === "/login" ||
pathname.startsWith("/_next") ||
pathname.includes(".")
The matcher also excludes every /api path:
matcher: ["/((?!api).*)"]
There are currently no application API routes, and the journal layout/server pages independently check the session. Therefore, this is not a confirmed current data leak.
Impact scenario:
A future file-like route such as /account/export.json, /admin.backup, or an API route could bypass proxy authentication if the route itself does not implement a second check.
Recommended remediation:
- Match only explicitly public routes and static framework assets.
- Do not use pathname.includes(".") as a general authentication exemption.
- Keep authorization in the route/action/data layer, not only in proxy code.
- Add tests for dotted paths and future /api routes.
Positive security observations
These controls were present and reduce current risk:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/auth.ts:21-28 catches invalid or expired JWTs.
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/auth.ts:42-48 uses HTTP-only, SameSite=Lax cookies and enables Secure in production.
- Protected pages call currentOwnerId() in:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/layout.tsx:8-12
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/today/page.tsx:8-15
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/history/page.tsx:7-10
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/library/page.tsx:7-10
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/app/(journal)/progress/page.tsx:7-10
- Destructive owner-owned records use owner predicates, for example:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/delete.ts:11-14
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/body.ts:26-27
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/actions/meal.ts:32-33
- Drizzle eq, and, and tagged sql expressions are parameterized. No obvious SQL injection sink was found.
- Input bounds are generally good in /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/validation.ts.
- AI output is validated with safeParse() before use in /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/ai.ts:54-67 and :75-88.
- No dangerouslySetInnerHTML was found in the React components.
- The OpenRouter API key is not exposed via NEXT_PUBLIC_*.
Runtime and deployment verification required
These items cannot be confirmed safely from source alone.
D-01 — Production secret and environment verification
Verify:
- APP_PASSWORD is high entropy and unique.
- SESSION_SECRET is generated randomly and not reused.
- .env or other environment files are not tracked in Git history.
- Vercel environment scopes are separated for development, preview, and production.
- NEXT_PUBLIC_APP_URL is the canonical HTTPS origin.
- No secrets are printed in deployment logs or error monitoring.
D-02 — HTTPS, cookie, proxy, and host behavior
Verify:
- Production runs with NODE_ENV=production.
- HTTP redirects to HTTPS before authentication.
- Secure cookies are actually set in production.
- Reverse proxies do not cache authenticated dynamic responses.
- Forwarded host headers are normalized to the canonical domain.
- Next.js Server Action Origin/Host checks operate correctly through the production proxy.
- No alternate Vercel preview or custom-domain hostname exposes the same production database.
There is no explicit CSRF token or application-level Origin allowlist. SameSite=Lax and Next.js Server Action protections provide mitigation, but this should be verified with browser tests against the real deployment topology.
D-03 — Neon database security
Verify:
- DATABASE_URL uses TLS and the intended production branch.
- The application uses a least-privileged database role.
- Migration credentials are not used at runtime.
- Preview environments cannot access production data.
- Neon IP controls, branch permissions, backups, restore history, and alerting are configured.
- Database access is not exposed through an unintended Data API or public endpoint.
- No row-level security requirement is being hidden by the current single-user assumption.
/Users/vegtaco/MyProjects/SimpleFitnessv2/drizzle.config.ts:15-17 falls back to a placeholder URL when DATABASE_URL is missing. This should fail closed rather than allowing an operator to run migrations against an unintended or placeholder target.
D-04 — Dependency security
The lockfile is present and includes integrity hashes. The inspected versions include:
- Next.js 16.3.0
- React 19.2.8
- React DOM 19.2.8
- jose 6.2.8
- Zod 4.4.3
- Drizzle ORM 0.45.2
- Neon serverless driver 1.1.0
The official Next.js July 2026 security release listed patched 15.5 and 16.2 lines and indicated that fixes would be included in stable 16.3.0. The current version is therefore not reported here as a confirmed vulnerable dependency based solely on repository inspection.
However:
- no dependency audit result was available from this read-only review,
- no Dependabot/Renovate configuration was found,
- no CI workflow was found,
- no automated lockfile security gate exists.
Run npm audit, OSV/GitHub Advisory scanning, and a production dependency scanner in CI. Use npm ci for deterministic deployment installs.
Next.js 16.3 also requires Node >=20.9.0, as recorded in the lockfile at /Users/vegtaco/MyProjects/SimpleFitnessv2/package-lock.json:6692-6694. The runtime version should be explicitly pinned in deployment documentation.
D-05 — Privacy and provider behavior
Verify:
- OpenRouter and selected model retention/training settings.
- Geographic processing and contractual requirements for health-related data.
- Browser-specific Web Speech behavior.
- Whether production logs include raw input, AI prompts, or database errors.
- Whether a user can export and delete all stored data.
Tests currently present
Only two test files were found:
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/metrics.test.ts:1-80
- /Users/vegtaco/MyProjects/SimpleFitnessv2/src/lib/muscle-heatmap.test.ts:1-67
They cover pure calculations and heatmap mapping. They do not exercise authentication, authorization, persistence, server actions, browser security, or deployment configuration.
No test files were found for:
- login/session handling,
- JWT tampering or expiry,
- cookie flags,
- logout or session revocation,
- rate limiting,
- direct Server Action requests,
- CSRF/origin behavior,
- ownership/IDOR cases,
- session-plan membership,
- database queries,
- migration/seed safety,
- AI provider failures or privacy behavior,
- security headers,
- browser end-to-end flows,
- dependency or secret scanning.
Recommended security test additions
Priority tests should include:
1. Authentication
- Wrong, expired, malformed, and algorithm-confusion JWTs.
- Missing/weak production secrets.
- Logout and revocation behavior.
- Cookie flags under production configuration.
2. Server Actions
- Direct malformed inputs for every exported action.
- Unauthenticated action calls.
- Invalid UUIDs and oversized strings.
- Generic error responses without database internals.
3. Authorization and integrity
- Owner A cannot read, update, or delete Owner B data.
- saveSet rejects an exercise absent from the session plan.
- Session completion and deletion ownership checks.
- Global template/exercise behavior under an explicit singleton invariant.
4. Rate limits and abuse
- Login attempts across multiple application instances.
- AI request quotas.
- OpenRouter timeout, invalid JSON, oversized response, and upstream error behavior.
5. Browser security
- Required response headers.
- Dotted-path and /api proxy behavior.
- Cross-origin Server Action POST attempts.
- Clickjacking prevention.
- XSS payloads in exercise names, meal text, template names, and tooltip content.
6. Deployment integration
- Disposable Neon branch migrations.
- Production/preview environment separation.
- Dynamic authenticated responses not being publicly cached.
- HTTPS and Secure cookie behavior.
The repository is suitable for a private single-user deployment only if that assumption is enforced operationally. The highest-priority improvements are distributed login protection, stronger secret validation, revocable sessions, security headers, AI quotas/privacy controls, complete Server Action schemas, and security-focused integration tests.
▣  Explore · OpenAI: GPT-5.6 Luna · 13m 33s