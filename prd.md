# PRD: Personal Workout, Nutrition & Discipline Tracker

## 1. Overview

**Problem:** Existing workout/diet apps are paid, cluttered, and optimized for feature breadth over daily usability. Logging a set — or a meal — requires too many taps, so logging gets skipped, and skipped logging kills momentum and discipline.

**Solution:** A minimal, single-user, mobile-first web app that makes logging a workout or a meal take seconds (including via voice/free-text parsed by an LLM), tracks streak/consistency, and shows clean progress dashboards — nothing else.

**Who it's for:** One person (the builder/owner). No multi-user, no social, no marketplace.

**Where it lives:** Web app, hosted on Vercel, accessed mostly from a phone at the gym or on the go.

## 2. Goals / Non-Goals

**Goals**
- Logging a set or a meal takes 2 taps, or one voice note, whichever is faster.
- Never lose data — private, persistent, accessible from any device.
- See streak/consistency and progress at a glance, without digging.
- Let an LLM handle the tedious parts: turning "3 sets of bench, 65kg, 8 reps" or "chicken bowl with rice and veg" into structured, chartable data.
- Feel clean and intentional, not like a spreadsheet or an enterprise dashboard.

**Non-Goals (explicitly out of scope)**
- Multi-user support, social features, sharing, leaderboards.
- Gamification (badges, XP, levels) — beyond streak and PR nudges, which are functional, not decorative.
- A large pre-built exercise database (800+ exercises) — user builds their own library, optionally starting from a few pre-saved standard splits.
- Mobile-friendly web interface
- Payment, subscriptions, monetization.
- Precise/clinical nutrition tracking (this is LLM-estimated macros for directional awareness, not a food-scale-accurate diet tool).

## 3. Core User Flows

### 3.1 Log a workout ("Today" screen — primary flow)
1. User opens the webpage on mobile
2. Sees today's suggested workout (from a template — Push/Pull/Legs/etc.) with the option to edit/customize it for today.
3. Two logging paths, user's choice per entry:
   - **Tap path:** tap exercise chip → enter weight/reps per set (reps field is optional/removable) → checkmark per set.
   - **Voice/text path:** speak or type free-form ("bench press 3x8 at 65kg") → LLM parses into structured sets and slots them into the session for review/confirm.
4. Last session's numbers shown as reference; if today's entry beats the prior best, a subtle PR nudge appears.
5. "Finish workout" → saves session, updates streak, updates weekly volume/muscle-group stats.

### 3.2 Log nutrition
1. User speaks or types what they ate ("chicken bowl with rice and veg, medium portion").
2. LLM estimates macros (calories, protein, carbs, fat) within seconds and returns a structured entry.
3. User can confirm as-is or adjust the estimate before saving.
4. Optionally, the app surfaces a light nudge ("you're low on protein today") — informational, not prescriptive/nagging.

### 3.3 Log body metrics
1. User logs weight, and optionally BMI/body fat % (manual entry, or auto-computed BMI from height+weight).
2. Plotted as line charts over time.

### 3.4 Manage workout templates & exercise library
1. Define/edit workout templates (Push, Pull, Legs, Shoulders, custom, etc.), optionally starting from pre-saved standard splits (PPL, Bro-split) as a starting point.
2. Each template contains an ordered list of exercises.
3. Each exercise is mapped to a primary muscle group and optional secondary muscle group(s) — this powers the "muscles targeted in last 7 days" view.

### 3.5 View dashboards
- **Workout streak** + days of the week with a completed workout.
- **Volume moved this week** (total weight × reps, or per-muscle-group breakdown).
- **Muscle groups targeted in the last 7 days** (so gaps are visible — e.g. "no leg work in a week").
- **Weight / BMI / body fat %** line charts over time.
- **Macro trends** (calories/protein/carbs/fat over time or daily totals).

### 3.6 View history
- Reverse-chronological list of past workout sessions and meals, each viewable in detail, editable/deletable.


## 5. Design Principles

- **Minimum touches to log.** Every screen is evaluated against: "could this be done in fewer taps, or by voice instead?"
- **LLM does the tedious translation, not the thinking.** It converts messy natural language into structured fields; it doesn't make decisions for the user or gate saving on its accuracy — user always sees/can correct the parsed result before it's saved.
- **No configuration for its own sake.** Settings only exist where they remove friction.
- **One primary action per screen.**
- **Nudges are quiet and functional.** PR/health nudges are a small inline signal, never a popup or interruption.

## 6. Technical Approach

Optimized for **fastest possible path from zero to a working, deployed app**, while staying "modern" and easy to extend later.

### Stack
| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Server Actions remove the need to hand-write API routes for most CRUD — big dev-speed win for a solo project. |
| Database | **Neon (serverless Postgres)** | Native Vercel integration, generous free tier, scales to zero — zero infra to manage. |
| ORM | **Drizzle ORM** | Lighter and faster than Prisma for serverless/edge, near-instant migrations, minimal build overhead — matters for iteration speed. |
| Auth | **Lightweight single-user auth** — a simple password/passcode gate with a signed session cookie (via Auth.js Credentials provider, or even simpler, a custom middleware check) | You're the only user — a full multi-provider auth system is unnecessary overhead. This can be built in under an hour instead of a day. |
| LLM parsing (voice/text → structured data) | Openrouter + Deepseek V4, using structured output / tool-calling with a Zod schema** | Both workout-set parsing and macro estimation are "unstructured text → typed JSON" problems — this is exactly what structured outputs are built for, and the AI SDK gives you this with a few lines of code. |
| Voice input | **Browser-native Web Speech API** for speech-to-text, fed as plain text into the same LLM parsing pipeline | Free, zero backend, no audio upload/storage — fastest possible implementation. (Fallback: Whisper API later if browser support/accuracy is a problem.) |
| Charts | **Recharts** | Simple line/bar charts, good enough for streak/volume/macro/body-metric views without a heavy charting library. |
| Hosting | **Vercel** | Matches the stated requirement; zero-config deploys from GitHub, instant preview URLs per commit. |

### Data model (high level, expanded from v1)
- `User` — single row.
- `Exercise` — name, unit (kg/lb), primary muscle group, secondary muscle group(s).
- `WorkoutTemplate` — name (e.g. "Push day"), ordered list of Exercises.
- `Session` — date, linked template (optional), marks day complete for streak.
- `SetLog` — session, exercise, set number, weight, reps (nullable), completed flag.
- `MealLog` — date/time, raw text/voice input, parsed items, calories, protein, carbs, fat.
- `BodyMetric` — date, weight, height (for BMI calc), body fat % (optional).

## 7. Success Criteria

- A workout or meal can be logged in under 20 seconds, tap or voice.
- Zero missed logs due to friction (the #1 stated reason for past app abandonment).
- Dashboards (streak, muscle coverage, macros, body metrics) are checked voluntarily.