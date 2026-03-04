import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { profileService } from "@/services/profile";
import { skillsService } from "@/services/skills";
import { getCourseTitleMap, getTracks } from "@/lib/courses";
import { redirect } from "@/i18n/routing";
import ProfileView from "./profile-view";

/** Build lookup maps from Sanity course/track data */
async function buildMaps() {
  const [courseMap, tracks] = await Promise.all([getCourseTitleMap(), getTracks()]);
  const trackMap: Record<number, string> = {};
  for (const t of tracks) {
    if (t.trackId != null) trackMap[t.trackId] = t.name;
  }
  return { courseMap, trackMap };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string; username: string }>;
}) {
  const { locale, username } = await params;
  const session = await auth();

  // "me" → own profile, requires auth
  if (username === "me") {
    if (!session?.user?.id) {
      redirect({ href: "/auth/signin", locale });
      return null;
    }

    const profile = await profileService.getProfileById(session.user.id);
    if (!profile) notFound();

    const [stats, skills, { courseMap, trackMap }] = await Promise.all([
      profileService.getProfileStats(session.user.id),
      skillsService.getSkills(profile.walletAddress),
      buildMaps(),
    ]);

    return (
      <ProfileView
        profile={profile}
        stats={stats}
        courseMap={courseMap}
        trackMap={trackMap}
        skills={skills}
        isOwner={true}
      />
    );
  }

  // Public profile by username
  const profile = await profileService.getProfileByUsername(username);
  if (!profile) notFound();

  // Privacy check
  if (!profile.isPublic) {
    const isOwner = session?.user?.id === profile.id;
    if (!isOwner) notFound();
  }

  const isOwner = session?.user?.id === profile.id;
  const [stats, skills, { courseMap, trackMap }] = await Promise.all([
    profileService.getProfileStats(profile.id),
    skillsService.getSkills(profile.walletAddress),
    buildMaps(),
  ]);

  return (
    <ProfileView
      profile={profile}
      stats={stats}
      courseMap={courseMap}
      trackMap={trackMap}
      skills={skills}
      isOwner={isOwner}
    />
  );
}
