import "server-only";
import { mealParseSchema, rawTextSchema, workoutParseSchema, type MealParse, type WorkoutParse } from "./validation";
import { MUSCLES } from "./muscles";

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

async function askOpenRouter(system: string, user: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey || !model) throw new AiError("AI parsing is not configured yet. Add the OpenRouter settings to continue.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", "X-Title": "Simple Fitness" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new AiError("The parser could not reach the model. Your draft is still here to retry.");
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new AiError("The parser returned no usable result. Edit the text or retry.");
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new AiError("The parser returned an invalid result. Edit the text or retry.");
    }
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError("The parser timed out. Your draft is still here to retry.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseWorkout(rawText: string, exerciseNames: string[]): Promise<WorkoutParse> {
  const text = rawTextSchema.parse(rawText);
  const result = await askOpenRouter(
    `You parse workout notes into JSON. Return exactly {"exercises":[{"name":string,"primaryMuscle":string,"sets":[{"weight":number|null,"unit":"kg"|"lb"|null,"reps":number|null}],"notes":string?}]}. Use one or more sets. Reps may be null. Never invent an exercise not present in the note. Use an exact available exercise name when the note clearly matches one. If it does not match an available name, preserve the exercise name from the note and infer its primary target muscle in primaryMuscle so it can be reviewed before being added. primaryMuscle must be exactly one of: ${MUSCLES.join(", ")}. The available exercise names are: ${exerciseNames.join(", ")}.`,
    text,
  );
  const parsed = workoutParseSchema.safeParse(result);
  if (!parsed.success) throw new AiError("The workout result was missing a field. Edit the text or retry.");
  return parsed.data;
}

export async function parseMeal(rawText: string): Promise<MealParse> {
  const text = rawTextSchema.parse(rawText);
  const result = await askOpenRouter(
    "You estimate everyday meal nutrition directionally. Return exactly {summary:string,items:[{name:string,quantity:string,calories:number,protein:number,carbs:number,fat:number}],calories:number,protein:number,carbs:number,fat:number}. Use non-negative numbers. Make clear these are estimates, not clinical measurements.",
    text,
  );
  const parsed = mealParseSchema.safeParse(result);
  if (!parsed.success) throw new AiError("The meal result was missing a field. Edit the text or retry.");
  return parsed.data;
}
