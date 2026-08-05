import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Match Next.js' precedence so migrations target the same database as the app.
const environment = process.env.NODE_ENV ?? "development";
loadEnv({ path: `.env.${environment}.local` });
loadEnv({ path: ".env.local" });
loadEnv({ path: `.env.${environment}` });
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost/placeholder",
  },
  strict: true,
  verbose: true,
});
