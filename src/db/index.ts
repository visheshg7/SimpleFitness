import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  if (!db) {
    const pool = new Pool({
      connectionString: url,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      maxLifetimeSeconds: 300,
    });
    db = drizzle({ client: pool, schema });
  }
  return db;
}
