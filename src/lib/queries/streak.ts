import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { calculateStreak } from "@/lib/metrics";

export async function getStreak(ownerId: string) {
  const completedSessions = await getDb()
    .select({ sessionDate: sessions.sessionDate })
    .from(sessions)
    .where(and(eq(sessions.ownerId, ownerId), isNotNull(sessions.completedAt)))
    .orderBy(desc(sessions.sessionDate))
    .limit(400);

  return calculateStreak(completedSessions.map((session) => session.sessionDate));
}
