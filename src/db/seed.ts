import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { exercises, templateExercises, users, workoutTemplates } from "./schema";

const starterExercises = [
  ["Bench press", "chest", ["triceps", "front delts"]],
  ["Incline dumbbell press", "chest", ["front delts", "triceps"]],
  ["Overhead press", "shoulders", ["triceps", "chest"]],
  ["Lateral raise", "shoulders", []],
  ["Triceps pushdown", "triceps", []],
  ["Pull-up", "back", ["biceps"]],
  ["Barbell row", "back", ["biceps"]],
  ["Lat pulldown", "back", ["biceps"]],
  ["Face pull", "rear delts", ["upper back"]],
  ["Barbell squat", "quads", ["glutes", "hamstrings"]],
  ["Romanian deadlift", "hamstrings", ["glutes", "lower back"]],
  ["Leg press", "quads", ["glutes"]],
  ["Leg curl", "hamstrings", []],
  ["Calf raise", "calves", []],
] as const;

const templates = [
  ["Push", ["Bench press", "Incline dumbbell press", "Overhead press", "Lateral raise", "Triceps pushdown"]],
  ["Pull", ["Pull-up", "Barbell row", "Lat pulldown", "Face pull"]],
  ["Legs", ["Barbell squat", "Romanian deadlift", "Leg press", "Leg curl", "Calf raise"]],
] as const;

async function seed() {
  const db = getDb();
  const existingOwner = await db.select().from(users).limit(1);
  const owner = existingOwner[0] ?? (await db.insert(users).values({ displayName: "Training journal" }).returning())[0];
  if (!owner) throw new Error("Could not create owner");

  for (const [name, primaryMuscle, secondaryMuscles] of starterExercises) {
    await db.insert(exercises).values({ name, primaryMuscle, secondaryMuscles: Array.from(secondaryMuscles), defaultUnit: "kg" }).onConflictDoNothing();
  }

  for (let position = 0; position < templates.length; position += 1) {
    const [name, exerciseNames] = templates[position];
    let template = (await db.select().from(workoutTemplates).where(eq(workoutTemplates.name, name)).limit(1))[0];
    if (!template) {
      template = (await db.insert(workoutTemplates).values({ name, position }).returning())[0];
    }
    if (!template) continue;
    const library = await db.select().from(exercises);
    for (let orderIndex = 0; orderIndex < exerciseNames.length; orderIndex += 1) {
      const exercise = library.find((item) => item.name === exerciseNames[orderIndex]);
      if (!exercise) continue;
      await db.insert(templateExercises).values({ templateId: template.id, exerciseId: exercise.id, orderIndex, targetSets: 3, targetReps: 8 }).onConflictDoNothing();
    }
  }
  console.log(`Seeded owner ${owner.id}, starter library, and PPL templates.`);
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
