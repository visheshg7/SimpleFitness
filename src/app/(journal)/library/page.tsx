import { currentOwnerId } from "@/lib/auth";
import { getLibraryData } from "@/lib/queries/library";
import { LibraryScreen } from "@/components/library-screen";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const ownerId = await currentOwnerId();
  if (!ownerId) return null;
  return <LibraryScreen data={await getLibraryData(ownerId)} />;
}
