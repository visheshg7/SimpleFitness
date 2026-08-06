import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { exercises } from "./schema";
import { normalizeMuscle } from "../lib/muscles";

async function fixMuscles() {
  const db = getDb();
  const list = await db.select().from(exercises);
  let updated = 0;
  for (const exercise of list) {
    const primaryMuscle = normalizeMuscle(exercise.primaryMuscle);
    const secondaryMuscles = exercise.secondaryMuscles.map((value) => normalizeMuscle(value) ?? value);
    if (!primaryMuscle) continue;
    const changed = primaryMuscle !== exercise.primaryMuscle || JSON.stringify(secondaryMuscles) !== JSON.stringify(exercise.secondaryMuscles);
    if (changed) {
      await db.update(exercises).set({ primaryMuscle, secondaryMuscles, updatedAt: new Date() }).where(eq(exercises.id, exercise.id));
      updated += 1;
    }
  }
  console.log(`Normalized target muscles for ${updated} exercise(s).`);
}

fixMuscles().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
