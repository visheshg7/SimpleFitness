import { currentOwnerId } from "@/lib/auth";
import { getHistoryData } from "@/lib/queries/history";
import { HistoryScreen } from "@/components/history-screen";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const ownerId = await currentOwnerId();
  if (!ownerId) return null;
  return <HistoryScreen data={await getHistoryData(ownerId)} />;
}
