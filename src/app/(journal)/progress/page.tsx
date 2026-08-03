import { currentOwnerId } from "@/lib/auth";
import { getProgressData } from "@/lib/queries/progress";
import { ProgressScreen } from "@/components/progress-screen";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const ownerId = await currentOwnerId();
  if (!ownerId) return null;
  return <ProgressScreen data={await getProgressData(ownerId)} />;
}
