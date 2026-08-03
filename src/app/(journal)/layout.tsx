import { redirect } from "next/navigation";
import { getTodayData } from "@/lib/queries/today";
import { currentOwnerId } from "@/lib/auth";
import { JournalShell } from "@/components/journal-shell";

export const dynamic = "force-dynamic";

export default async function JournalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ownerId = await currentOwnerId();
  if (!ownerId) redirect("/login");
  const today = await getTodayData(ownerId);
  return <JournalShell streak={today.streak}>{children}</JournalShell>;
}
