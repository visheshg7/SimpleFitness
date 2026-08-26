import { redirect } from "next/navigation";
import { currentOwnerId } from "@/lib/auth";
import { JournalShell } from "@/components/journal-shell";
import { getStreak } from "@/lib/queries/streak";

export const dynamic = "force-dynamic";

export default async function JournalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ownerId = await currentOwnerId();
  if (!ownerId) redirect("/login");
  const streak = await getStreak(ownerId);
  return <JournalShell streak={streak}>{children}</JournalShell>;
}
