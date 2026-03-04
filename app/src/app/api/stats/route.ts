import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCourseCards, getTracks } from "@/lib/courses";
import { countOnChainCredentials } from "@/lib/solana/credentials";

export async function GET() {
  const db = getAdminClient();

  const [courseCards, profileCount, tracks, xpSupply] =
    await Promise.all([
      getCourseCards().catch(() => []),
      db
        ? db
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .then(({ count }) => count ?? 0)
        : Promise.resolve(0),
      getTracks().catch(() => []),
      import("@/lib/solana/on-chain")
        .then(({ getXPMintSupply }) => getXPMintSupply())
        .catch(() => 0),
    ]);

  const collectionAddresses = tracks
    .map((t) => t.collectionAddress)
    .filter(Boolean) as string[];
  const credentialCount = await countOnChainCredentials(collectionAddresses);

  return NextResponse.json(
    { students: profileCount, activeCourses: courseCards.length, credentials: credentialCount, totalXp: xpSupply },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } },
  );
}
