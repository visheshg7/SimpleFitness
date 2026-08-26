import { currentOwnerId } from "@/lib/auth";
import { dateKey, isDateInLoggingWindow } from "@/lib/metrics";
import { getTodayData } from "@/lib/queries/today";
import { TodayScreen } from "@/components/today-screen";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ action?: string | string[]; date?: string | string[] }> }) {
  const ownerId = await currentOwnerId();
  if (!ownerId) return null;
  const params = await searchParams;
  const requestedDate = typeof params.date === "string" ? params.date : undefined;
  const initialAction = params.action === "meal" || params.action === "body" || params.action === "workout" ? params.action : undefined;
  const today = dateKey(new Date());
  const selectedDate = requestedDate && isDateInLoggingWindow(requestedDate) ? requestedDate : today;
  return <TodayScreen data={await getTodayData(ownerId, selectedDate)} initialAction={initialAction} />;
}
