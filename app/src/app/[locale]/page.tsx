import { getCourseCards, getTracks } from "@/lib/courses";
import { testimonialService } from "@/services/testimonials";
import { getAdminClient } from "@/lib/supabase/admin";
import { countOnChainCredentials } from "@/lib/solana/credentials";
import LandingView from "./landing-view";

export const revalidate = 3600;

export default async function LandingPage() {
  const db = getAdminClient();

  const [courseCards, allTracks, testimonials, profileCount, xpSupply] =
    await Promise.all([
      getCourseCards(),
      getTracks(),
      testimonialService.getFeatured().catch(() => []),
      db
        ? db
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .then(({ count }) => count ?? 0)
        : Promise.resolve(0),
      import("@/lib/solana/on-chain")
        .then(({ getXPMintSupply }) => getXPMintSupply())
        .catch(() => 0),
    ]);

  const activeTrackNames = new Set(courseCards.map((c) => c.trackName).filter(Boolean));
  const activeTracks = allTracks.filter((t) => activeTrackNames.has(t.name));

  const collectionAddresses = allTracks
    .map((t) => t.collectionAddress)
    .filter(Boolean) as string[];
  const credentialCount = await countOnChainCredentials(collectionAddresses);

  const platformStats = {
    students: profileCount,
    activeCourses: courseCards.length,
    credentials: credentialCount,
    totalXp: xpSupply,
  };

  return (
    <LandingView
      courseCards={courseCards}
      activeTracks={activeTracks}
      testimonials={testimonials}
      platformStats={platformStats}
    />
  );
}
