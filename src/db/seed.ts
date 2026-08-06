import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import { getDb } from "./index";
import { exercises, templateExercises, users, workoutTemplates } from "./schema";

const starterExercises = [
  ["Bench press", "Chest", ["Triceps", "Front Delts"]],
  ["Incline dumbbell press", "Chest", ["Front Delts", "Triceps"]],
  ["Overhead press", "Front Delts", ["Triceps", "Chest"]],
  ["Lateral raise", "Side Delts", []],
  ["Triceps pushdown", "Triceps", []],
  ["Pull-up", "Lats", ["Biceps"]],
  ["Barbell row", "Mid-Back", ["Biceps"]],
  ["Lat pulldown", "Lats", ["Biceps"]],
  ["Face pull", "Rear Delts", ["Traps"]],
  ["Barbell squat", "Quads", ["Glutes", "Hamstrings"]],
  ["Romanian deadlift", "Hamstrings", ["Glutes", "Lower Back"]],
  ["Leg press", "Quads", ["Glutes"]],
  ["Leg curl", "Hamstrings", []],
  ["Calf raise", "Calves", []],
  ["Barbell or DB Bench Press", "Chest", ["Triceps", "Front Delts"]],
  ["Incline DB Press", "Chest", ["Front Delts", "Triceps"]],
  ["Weighted Dips or Push-ups", "Chest", ["Triceps", "Front Delts"]],
  ["Cable Fly or Pec Deck", "Chest", []],
  ["Overhead DB Extension (triceps)", "Triceps", []],
  ["Pull-ups or Lat Pulldown", "Lats", ["Biceps"]],
  ["Barbell or DB Row", "Mid-Back", ["Biceps"]],
  ["Single-Arm Cable Row", "Mid-Back", ["Biceps"]],
  ["Face Pulls", "Rear Delts", ["Traps"]],
  ["Barbell or DB Curl", "Biceps", []],
  ["Squat (Barbell or Goblet)", "Quads", ["Glutes", "Hamstrings"]],
  ["Walking Lunges", "Quads", ["Glutes", "Hamstrings"]],
  ["Standing Calf Raise", "Calves", []],
  ["Standing Overhead Press", "Front Delts", ["Triceps", "Chest"]],
  ["Rear Delt Fly", "Rear Delts", ["Traps"]],
  ["Close-Grip Bench or Dips (triceps)", "Triceps", ["Chest"]],
  ["Incline DB Curl (biceps)", "Biceps", []],
  ["Deadlift or Rack Pull", "Lower Back", ["Hamstrings", "Glutes"]],
  ["Chest-Supported Row", "Mid-Back", ["Biceps"]],
  ["Wide-Grip Lat Pulldown", "Lats", ["Biceps"]],
  ["Shrugs", "Traps", []],
  ["Hanging Leg Raise", "Abs", []],
  ["Cable Woodchop or Plank", "Abs", ["Obliques"]],
] as const;

const templates = [
  {
    name: "Push",
    exercises: [["Bench press", 3, 8], ["Incline dumbbell press", 3, 8], ["Overhead press", 3, 8], ["Lateral raise", 3, 8], ["Triceps pushdown", 3, 8]],
  },
  {
    name: "Pull",
    exercises: [["Pull-up", 3, 8], ["Barbell row", 3, 8], ["Lat pulldown", 3, 8], ["Face pull", 3, 8]],
  },
  {
    name: "Legs",
    exercises: [["Barbell squat", 3, 8], ["Romanian deadlift", 3, 8], ["Leg press", 3, 8], ["Leg curl", 3, 8], ["Calf raise", 3, 8]],
  },
  {
    name: "Day 1 - Push (Chest Focus)",
    exercises: [
      ["Barbell or DB Bench Press", 4, 8],
      ["Incline DB Press", 3, 10],
      ["Weighted Dips or Push-ups", 3, 12],
      ["Cable Fly or Pec Deck", 2, 15],
      ["Overhead DB Extension (triceps)", 3, 12],
    ],
  },
  {
    name: "Day 2 - Pull (Back Width Focus)",
    exercises: [
      ["Pull-ups or Lat Pulldown", 4, 10],
      ["Barbell or DB Row", 4, 10],
      ["Single-Arm Cable Row", 3, 12],
      ["Face Pulls", 3, 15],
      ["Barbell or DB Curl", 3, 12],
    ],
  },
  {
    name: "Day 3 - Legs (Keep the Foundation)",
    exercises: [
      ["Squat (Barbell or Goblet)", 4, 8],
      ["Romanian deadlift", 3, 10],
      ["Walking Lunges", 2, 12],
      ["Leg curl", 3, 12],
      ["Standing Calf Raise", 3, 15],
    ],
  },
  {
    name: "Day 4 - Shoulders & Arms (Broad Shoulders Priority)",
    exercises: [
      ["Standing Overhead Press", 4, 8],
      ["Lateral raise", 4, 15],
      ["Rear Delt Fly", 3, 15],
      ["Close-Grip Bench or Dips (triceps)", 3, 10],
      ["Incline DB Curl (biceps)", 3, 12],
    ],
  },
  {
    name: "Day 5 - Back Thickness (Back Priority)",
    exercises: [
      ["Deadlift or Rack Pull", 3, 6],
      ["Chest-Supported Row", 4, 10],
      ["Wide-Grip Lat Pulldown", 3, 12],
      ["Shrugs", 3, 15],
      ["Hanging Leg Raise", 3, 15],
      ["Cable Woodchop or Plank", 2, 15],
    ],
  },
] as const;

async function seed() {
  const db = getDb();
  const existingOwner = await db.select().from(users).limit(1);
  const owner = existingOwner[0] ?? (await db.insert(users).values({ displayName: "Training journal" }).returning())[0];
  if (!owner) throw new Error("Could not create owner");

  for (const [name, primaryMuscle, secondaryMuscles] of starterExercises) {
    await db.insert(exercises).values({ name, primaryMuscle, secondaryMuscles: Array.from(secondaryMuscles), defaultUnit: "kg" }).onConflictDoNothing();
  }

  let nextPosition = ((await db.select({ position: workoutTemplates.position }).from(workoutTemplates).orderBy(desc(workoutTemplates.position)).limit(1))[0]?.position ?? -1) + 1;
  for (const templateData of templates) {
    const { name, exercises: exerciseTargets } = templateData;
    let template = (await db.select().from(workoutTemplates).where(eq(workoutTemplates.name, name)).limit(1))[0];
    if (!template) {
      template = (await db.insert(workoutTemplates).values({ name, position: nextPosition }).returning())[0];
      nextPosition += 1;
    }
    if (!template) continue;
    const library = await db.select().from(exercises);
    for (let orderIndex = 0; orderIndex < exerciseTargets.length; orderIndex += 1) {
      const [exerciseName, targetSets, targetReps] = exerciseTargets[orderIndex];
      const exercise = library.find((item) => item.name === exerciseName);
      if (!exercise) continue;
      await db.insert(templateExercises).values({ templateId: template.id, exerciseId: exercise.id, orderIndex, targetSets, targetReps }).onConflictDoNothing();
    }
  }
  console.log(`Seeded owner ${owner.id}, starter library, and workout templates.`);
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
