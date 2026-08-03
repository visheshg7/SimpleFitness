"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { mealLogs, sessions } from "@/db/schema";
import { requireSession } from "@/lib/auth";

export async function deleteHistoryEntry(type: "workout" | "meal", id: string) {
  try {
    const ownerId = await requireSession();
    const db = getDb();
    if (type === "meal") await db.delete(mealLogs).where(and(eq(mealLogs.id, id), eq(mealLogs.ownerId, ownerId)));
    else await db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.ownerId, ownerId)));
    revalidatePath("/history"); revalidatePath("/progress"); revalidatePath("/today");
    return { success: true as const };
  } catch (error) { return { success: false as const, error: error instanceof Error ? error.message : "Entry could not be deleted." }; }
}
