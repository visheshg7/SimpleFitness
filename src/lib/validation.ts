import { z } from "zod";
import { MUSCLES, normalizeMuscle, type Muscle } from "@/lib/muscles";

const finiteNumber = z.number().finite();

export const muscleSchema = z
  .string()
  .trim()
  .refine((value) => normalizeMuscle(value) !== null, {
    message: `Target muscle must be one of: ${MUSCLES.join(", ")}`,
  })
  .transform((value) => normalizeMuscle(value) as Muscle);

export const muscleInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .transform((value) => normalizeMuscle(value) ?? value);

export const unitSchema = z.enum(["kg", "lb"]);
export const setInputSchema = z.object({
  id: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  setNumber: z.number().int().min(1).max(30),
  weight: finiteNumber.min(0).max(2000).nullable().optional(),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  unit: unitSchema.default("kg"),
  completed: z.boolean(),
});

export const parserSetSchema = z.object({
  weight: finiteNumber.min(0).max(2000).nullable(),
  unit: unitSchema.nullable().optional(),
  reps: z.number().int().min(1).max(1000).nullable(),
});

export const workoutParseSchema = z.object({
  exercises: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    primaryMuscle: muscleInputSchema,
    sets: z.array(parserSetSchema).min(1).max(30),
    notes: z.string().max(500).optional(),
  })).min(1).max(30),
});

export const mealParseSchema = z.object({
  summary: z.string().trim().min(1).max(240),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    quantity: z.string().max(80).optional(),
    calories: finiteNumber.min(0).max(10000).optional(),
    protein: finiteNumber.min(0).max(1000).optional(),
    carbs: finiteNumber.min(0).max(1000).optional(),
    fat: finiteNumber.min(0).max(1000).optional(),
  })).min(1).max(30),
  calories: finiteNumber.min(0).max(20000),
  protein: finiteNumber.min(0).max(2000),
  carbs: finiteNumber.min(0).max(2000),
  fat: finiteNumber.min(0).max(2000),
});

export const rawTextSchema = z.string().trim().min(1, "Write a little more so it can be parsed.").max(2000);
export const mealConfirmSchema = mealParseSchema.extend({ rawInput: rawTextSchema, mealDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export const bodyMetricSchema = z.object({
  metricDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weight: finiteNumber.min(20).max(500),
  unit: unitSchema,
  heightCm: finiteNumber.min(80).max(250).nullable().optional(),
  bodyFatPercent: finiteNumber.min(1).max(80).nullable().optional(),
});
export const profileSchema = z.object({
  heightCm: finiteNumber.min(80).max(250).nullable().optional(),
  preferredUnit: unitSchema.optional(),
  sex: z.enum(["male", "female"]).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "veryActive"]).nullable().optional(),
  calorieGoal: z.enum(["cut", "maintain", "bulk"]).nullable().optional(),
  dailyCalorieGoal: finiteNumber.int().min(0).max(20000).nullable().optional(),
});
export const templateSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  primaryMuscle: muscleSchema,
  secondaryMuscles: z.array(muscleInputSchema).max(8),
  defaultUnit: unitSchema,
});

export type WorkoutParse = z.infer<typeof workoutParseSchema>;
export type MealParse = z.infer<typeof mealParseSchema>;
