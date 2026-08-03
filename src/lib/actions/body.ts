"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { bodyMetrics } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { calculateBmi, kgFromUnit } from "@/lib/metrics";
import { bodyMetricSchema } from "@/lib/validation";

export async function saveBodyMetric(input: unknown) {
  try {
    const ownerId = await requireSession();
    const parsed = bodyMetricSchema.parse(input);
    const weightKg = kgFromUnit(parsed.weight, parsed.unit);
    if (!weightKg) throw new Error("Weight is required.");
    const bmi = calculateBmi(weightKg, parsed.heightCm);
    const db = getDb();
    await db.insert(bodyMetrics).values({ ownerId, metricDate: parsed.metricDate, weightKg, heightCm: parsed.heightCm ?? null, bodyFatPercent: parsed.bodyFatPercent ?? null, bmi }).onConflictDoUpdate({ target: [bodyMetrics.ownerId, bodyMetrics.metricDate], set: { weightKg, heightCm: parsed.heightCm ?? null, bodyFatPercent: parsed.bodyFatPercent ?? null, bmi, updatedAt: new Date() } });
    revalidatePath("/today"); revalidatePath("/progress"); revalidatePath("/history");
    return { success: true as const };
  } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : "Body metric could not be saved." }; }
}

export async function deleteBodyMetric(id: string) {
  try { const ownerId = await requireSession(); await getDb().delete(bodyMetrics).where(and(eq(bodyMetrics.id, id), eq(bodyMetrics.ownerId, ownerId))); revalidatePath("/progress"); revalidatePath("/history"); return { success: true as const }; } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : "Body metric could not be deleted." }; }
}
