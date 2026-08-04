# Simple Fitness

A private, single-user workout, nutrition, and body-metric journal built with Next.js, Drizzle, and Neon Postgres.

## Local setup

1. Copy `.env.example` to `.env` and fill in the five values.
2. Install dependencies with `npm install`.
3. Apply the schema with `npm run db:generate` and `npm run db:migrate`.
4. Seed the owner, Push/Pull/Legs templates, and starter exercise library with `npm run db:seed`.
5. Start the app with `npm run dev`.

The OpenRouter key and model are only used on the server. AI results are always presented for review before they are persisted. Speech uses the browser Web Speech API and never uploads audio.

## Deployment

Add the same environment variables to Vercel, run the migration against the production Neon database, run the idempotent seed once, and deploy. The login rate guard is intentionally in-memory and is suitable for a private single-user deployment, not a multi-region authentication boundary.
