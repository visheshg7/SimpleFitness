import { currentOwnerId } from "@/lib/auth";
import { getTodayData } from "@/lib/queries/today";
import { TodayScreen } from "@/components/today-screen";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const ownerId = await currentOwnerId();
  if (!ownerId) return null;
  return <TodayScreen data={await getTodayData(ownerId)} />;
}
