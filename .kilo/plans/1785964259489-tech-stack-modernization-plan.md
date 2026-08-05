# Tech Stack Modernization: Verify + Migration Plan

## Verification result

The claim is **confirmed**. The project is several majors behind on most of its stack. Baseline is currently green: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass on the installed versions.

| Package | Installed | Latest (2026-08-06) | Action | Risk |
| --- | --- | --- | --- | --- |
| `next` | 15.5.22 | 16.3.0 | **Major** | High |
| `eslint-config-next` | 15.5.22 | 16.3.0 | **Major** (pair with Next) | High |
| `eslint` | 9.39.5 | 10.8.0 | **Major** | Low |
| `typescript` | 5.9.3 | 6.0.3 (bridge) / 7.0.2 (native) | **Major → 6 only** (7 deferred, user decision) | Medium |
| `zod` | 3.25.76 | 4.4.3 | **Major** | Low |
| `recharts` | 2.15.4 | 3.10.1 | **Major** | Medium |
| `lucide-react` | 0.468.0 | 1.28.0 | **Major** | Low |
| `vitest` | 3.2.7 | 4.1.10 | **Major** | Low |
| `drizzle-orm` | 0.44.7 | 0.45.2 | Minor (incl. SQL-injection fix) | Low |
| `jose` | 6.2.7 | 6.2.8 | Patch | Low |
| `tsx` | 4.23.5 | 4.23.8 | Patch | Low |
| `@types/node` | 22.20.1 | 25.9.5 (matches Node 25 runtime) | **Major** | Low |
| `react` / `react-dom` | 19.2.8 | 19.2.8 | None (current) | — |
| `@types/react` / `@types/react-dom` | 19.2.18 / 19.2.4 | current | None | — |
| `drizzle-kit` | 0.31.10 | 0.31.10 | None (current) | — |
| `@neondatabase/serverless` | 1.1.0 | 1.1.0 | None (current) | — |
| `dotenv` | 17.4.2 | 17.4.2 | None (current) | — |

### Architecture-level findings

1. **`src/middleware.ts` → `proxy.ts`**: Next 16 renamed the `middleware` convention to `proxy`. Codemod exists.
2. **ESLint config uses legacy `FlatCompat`**: `eslint.config.mjs` bridges eslintrc; Next 16 `eslint-config-next` ships native flat-config exports, and ESLint 10 defaults to flat config.
3. **`tsconfig.json` `target: "es5"`**: outdated and already wrong for a Next 19 app; deprecated in TS 6, a hard error in TS 7. Change to `es2022`.
4. **Already compliant** (no work needed): `cookies()` and `searchParams` are already awaited (Next 15 async APIs); all pages use `export const dynamic = "force-dynamic"`; `npm run lint` already calls `eslint .` (not `next lint`, which Next 16 removes); `experimental.serverActions.bodySizeLimit` in `next.config.ts` is still a valid key in Next 16.
5. No DB schema changes, so **no Drizzle migration** is needed for this upgrade.

## Decisions

- **TypeScript**: upgrade to 6.0.3 (last JS-based compiler, flags all TS 7 deprecations). Defer TS 7 native compiler (Corsa/tsgo) until ~7.1 when `typescript-eslint`/tooling matures.
- **Everything else migrates to latest** (as listed above).
- **Node**: keep local Node 25.1.0. Next 16 requires Node >=20.9; ESLint 10 requires ^20.19 || ^22.13 || >=24 — all satisfied.
- `@types/node`: pin to the major matching the deployed runtime. Default to `^25` (local runtime). If the Vercel project runs Node 24 LTS, use `^24` instead; adjust in Stage 6 after checking the platform.

## Migration stages

Each stage ends with the full quality gate: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.

### Stage 0 — Baseline and safety
- Create branch `feature/tech-stack-upgrade`.
- Confirm all four gates are green before touching anything.
- Note: deleting `.next/` and `tsconfig.tsbuildinfo` before the first post-upgrade build avoids stale cache issues.

### Stage 1 — Framework: Next.js 15 → 16 (+ ESLint 10, eslint-config-next 16)
1. `npm install next@^16.3.0 eslint@^10.8.0 eslint-config-next@^16.3.0`
2. Run the official codemod: `npx @next/codemod@latest middleware-to-proxy .`
   - Renames `src/middleware.ts` → `src/proxy.ts`, renames the exported function `middleware` → `proxy`, keeps `NextRequest`/`NextResponse` imports from `next/server`, keeps the `config.matcher` export.
3. Rewrite `eslint.config.mjs` to native flat config (remove `FlatCompat`):
   ```js
   import { defineConfig, globalIgnores } from "eslint/config";
   import nextVitals from "eslint-config-next/core-web-vitals";
   import nextTs from "eslint-config-next/typescript";

   export default defineConfig([
     ...nextVitals,
     ...nextTs,
     globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**"]),
   ]);
   ```
   Then `npm uninstall @eslint/eslintrc`.
4. `next.config.ts`: **no change** — `experimental.serverActions.bodySizeLimit` is still valid; Turbopack is the default dev/build bundler in Next 16 and this app has no webpack config to convert.
5. Verify nothing else from the Next 16 upgrade guide applies (async request APIs already done; no `unstable_` APIs; no `experimental_ppr`; no `next lint` usage).
6. Gates. Expect possible new ESLint 10 recommended-rule hits (e.g. `no-useless-assignment`, `preserve-caught-error`, `no-unassigned-vars`) — fix them.

### Stage 2 — TypeScript 5.9 → 6.0.3 + tsconfig cleanup
1. `npm install -D typescript@^6.0.3`
2. In `tsconfig.json` change `"target": "es5"` → `"es2022"`. Keep `strict`, `module: "esnext"`, `moduleResolution: "bundler"`.
3. Fix any deprecations TS 6 flags. Do **not** install TS 7 (deferred).
4. Gates.

### Stage 3 — zod 3 → 4
1. `npm install zod@^4.4.3`
2. Audit `src/lib/validation.ts` and action files: all APIs used (`.safeParse`, `.parse`, `.string().trim()`, `.uuid()`, `.regex()`, `.default()`, `.optional()`, `.nullable()`, `.enum()`, `.int().min().max()`, `.finite()`, `.extend()`, `.refine()`, `z.infer`, string custom messages like `min(1, "...")`) are preserved in v4.
3. Known behavioral changes to accept: `ZodError` issue/message shape differs (code only surfaces `error.message` from thrown parse errors — acceptable); `.string().uuid()` is deprecated in favor of `z.uuid()` (optional modernization, not required).
4. Gates.

### Stage 4 — recharts 2 → 3
1. `npm install recharts@^3.10.1`
2. Audit `src/components/progress-screen.tsx`: `Tooltip` `formatter` (v3 signature returns `ReactNode | [ReactNode, ReactNode]` — current tuple usage is compatible), `labelFormatter`, `cursor={{ fill }}`, `contentStyle`, `Line` `connectNulls`/`dot`, `ResponsiveContainer`, `BarChart`/`LineChart` — all supported. Removed APIs (`activeIndex`, `ResponsiveContainer` `ref.current.current`, `isFront`) are **not** used.
3. Expect minor strictness fixes on Tooltip formatter types.
4. Gates.

### Stage 5 — lucide-react 0.x → 1.x
1. `npm install lucide-react@^1.28.0`
2. Confirm all imported icons still exist (ArrowRightLeft, BarChart3, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Dumbbell, Flame, House, Mic, Pencil, PersonStanding, Plus, RotateCcw, Scale, SlidersHorizontal, Sparkles, Trash2, Utensils, UtensilsCrossed, X) — grep imports and fix any renamed ones.
3. Accept v1 behavior change: icons now get `aria-hidden="true"` by default (all usage here is decorative; no a11y regression).
4. Gates.

### Stage 6 — Remaining deps: drizzle-orm, jose, tsx, @types/node, vitest
1. `npm install drizzle-orm@^0.45.2 jose@^6.2.8 tsx@^4.23.8`
   - `drizzle-orm` 0.45.x has no breaking API changes; 0.45.2 hardens `sql.identifier()`/`sql.as()` against SQL injection. App does not use those helpers, but the bump is still recommended.
2. `npm install -D @types/node@^25.9.5 vitest@^4.1.10`
   - `@types/node`: align major with the deployed Node runtime (see Decisions).
3. `vitest.config.ts`: only uses `test.environment: "node"`; Vitest 4 removed `workspace`, `poolOptions`, and coverage options that this project does not use — no config change expected.
4. Gates.

### Stage 7 — Final validation and rollout
1. Full gates (lint, typecheck, test, build). `npm ls` to confirm resolved versions.
2. Manual dev smoke: `/login`, `/today` load, start a workout, save a set, confirm `/progress` charts render, `/history`, `/library`, logout.
3. No Drizzle migration and no seed changes required (schema untouched).
4. Deploy as before (Vercel env vars, `db:migrate` unchanged, idempotent seed once). Confirm the Vercel project's Node runtime is >=20.9 for Next 16.
5. Commit per stage (or one squashed commit) only when the user asks; do not auto-commit.

## Risks and mitigations

- **Next 16 + Turbopack default bundler**: no webpack config in this app; validate `next build` in Stage 1. Delete `.next/` before first build.
- **ESLint 10 new recommended rules** may surface existing code — fix in Stage 1 rather than disabling rules.
- **recharts 3 stricter types** on Tooltip — minor type annotations.
- **zod 4 error shape changes** — only `error.message` is surfaced to users; re-read action error strings after the bump.
- **lucide-react v1 `aria-hidden` default** — decorative icons only.
- **TS 6 deprecations** — fix; TS 7 deferred deliberately to avoid native-compiler/tooling churn.
- **`@types/node` major mismatch** — match to runtime, verify in Stage 6.

## Out of scope

- TypeScript 7 (deferred; revisit at 7.1+ when `typescript-eslint` and Next tooling support the native compiler).
- Any feature, schema, or route changes — this is purely a version/architecture upgrade.
- The empty root `components/` directory (dead folder; noted, not part of this change).
