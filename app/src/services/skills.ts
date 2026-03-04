import { sanityClient } from "@/lib/sanity/client";
import type { SkillsService, SkillScore } from "./interfaces";

// Maps Sanity course tags → skill axis names shown on the profile radar.
// Tags not in this map are ignored for skill computation.
const TAG_TO_SKILL: Record<string, string> = {
  solana: "Solana Core",
  blockchain: "Solana Core",
  rust: "Rust",
  anchor: "Anchor",
  defi: "DeFi",
  nft: "NFTs",
  nfts: "NFTs",
  metaplex: "NFTs",
  web3: "Web3 Frontend",
  nextjs: "Web3 Frontend",
  react: "Web3 Frontend",
};

export const SKILL_NAMES = [
  "Solana Core",
  "Rust",
  "Anchor",
  "DeFi",
  "NFTs",
  "Web3 Frontend",
];

// Total XP earned in a skill axis that maps to 100% mastery.
const MAX_SKILL_XP = 300;

const ZERO_SKILLS: SkillScore[] = SKILL_NAMES.map((name) => ({ name, value: 0 }));

interface CourseTagRow {
  courseId: string;
  tags: string[] | null;
  xpPerLesson: number | null;
  lessonCount: number | null;
}

// Sanity query: all published courses with tags and XP info
const ALL_COURSES_TAGS_QUERY = `*[_type == "course" && published == true] {
  "courseId": courseId.current,
  tags,
  xpPerLesson,
  lessonCount
}`;

class SkillsServiceImpl implements SkillsService {
  async getSkills(walletAddress?: string): Promise<SkillScore[]> {
    if (!walletAddress) return ZERO_SKILLS;

    try {
      // 1. Fetch all published courses from Sanity (tags + XP metadata)
      const courses: CourseTagRow[] = await sanityClient
        .fetch(ALL_COURSES_TAGS_QUERY)
        .catch(() => []);

      if (!courses.length) return ZERO_SKILLS;

      // 2. Batch-fetch on-chain enrollments for this wallet
      const { PublicKey } = await import("@solana/web3.js");
      const { fetchEnrollments, fetchCredentialCompletedCourseIds } = await import(
        "@/lib/solana/enrollments"
      );
      const learner = new PublicKey(walletAddress);

      const [enrollments, credentialCourseIds] = await Promise.all([
        fetchEnrollments(
          courses.map((c) => ({
            courseId: c.courseId,
            totalLessons: c.lessonCount ?? 0,
          })),
          learner,
        ),
        fetchCredentialCompletedCourseIds(walletAddress),
      ]);

      // 3. Build courseId → enrollment progress map
      const enrollmentMap = new Map(
        enrollments.map((e) => [e.courseId, e.progressPct]),
      );

      // Merge credentialed courses as 100% progress
      for (const courseId of credentialCourseIds) {
        if (!enrollmentMap.has(courseId)) {
          enrollmentMap.set(courseId, 100);
        }
      }

      if (enrollmentMap.size === 0) return ZERO_SKILLS;

      // 4. Accumulate XP per skill axis
      const accumulated: Record<string, number> = {};

      for (const course of courses) {
        const progressPct = enrollmentMap.get(course.courseId);
        if (progressPct === undefined || !course.tags?.length) continue;

        const earnedXp =
          (progressPct / 100) *
          (course.xpPerLesson ?? 0) *
          (course.lessonCount ?? 0);

        for (const tag of course.tags) {
          const skill = TAG_TO_SKILL[tag.toLowerCase()];
          if (!skill) continue;
          accumulated[skill] = (accumulated[skill] ?? 0) + earnedXp;
        }
      }

      return SKILL_NAMES.map((name) => ({
        name,
        value: Math.min(
          100,
          Math.round(((accumulated[name] ?? 0) / MAX_SKILL_XP) * 100),
        ),
      }));
    } catch {
      return ZERO_SKILLS;
    }
  }
}

export const skillsService: SkillsService = new SkillsServiceImpl();
