import type { SupabaseClient } from "@supabase/supabase-js";
import type { AchievementCheckerService } from "./interfaces";
import { getAdminClient } from "@/lib/supabase/admin";

// ── Types ────────────────────────────────────────────────────────────────────

interface RuleContext {
  userId: string;
  walletAddress: string | null;
  db: SupabaseClient;
  /** Lazy-loaded on-chain enrollments (only fetched if a rule needs them). */
  getOnChainEnrollments: () => Promise<OnChainEnrollmentSummary[]>;
  /** Lazy-loaded user_stats row. */
  getStats: () => Promise<{ longest_streak: number; created_at: string } | null>;
}

interface OnChainEnrollmentSummary {
  courseId: string;
  enrolledAt: number; // unix ms
  completedAt: number | null; // unix ms
  lessonCount: number; // popcount of lesson_flags
}

interface AchievementRule {
  id: number;
  achievementId: string;
  name: string;
  type: "auto" | "manual";
  check: (ctx: RuleContext) => Promise<boolean> | boolean;
}

// ── On-chain enrollment loader ──────────────────────────────────────────────

async function loadOnChainEnrollments(walletAddress: string): Promise<OnChainEnrollmentSummary[]> {
  try {
    const { PublicKey } = await import("@solana/web3.js");
    const { program } = await import("@/lib/solana/program");
    const anchor = await import("@coral-xyz/anchor");

    const learner = new PublicKey(walletAddress);

    // Fetch all enrollment accounts filtered by learner via memcmp on the
    // `course` field is tricky because the account layout starts with
    // discriminator(8) + course(32) + enrolled_at(8) ...  The learner isn't
    // stored in the account — it's part of the PDA seeds.
    // So we fetch ALL enrollments and derive expected PDAs to match.
    // For a better approach we'd use getProgramAccounts with seeds filter,
    // but Anchor's .all() with memcmp on course field isn't helpful here.
    //
    // Instead: get the list of all courses, derive enrollment PDAs, and
    // batch-fetch them.
    const allCourses = await program.account.course.all();
    if (!allCourses.length) return [];

    const { PROGRAM_ID } = await import("@/lib/solana/program");
    const pdas = allCourses.map((c) => {
      const courseId = c.account.courseId as string;
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("enrollment"), Buffer.from(courseId), learner.toBuffer()],
        PROGRAM_ID,
      );
      return pda;
    });

    const accounts = await program.account.enrollment.fetchMultiple(pdas);

    const results: OnChainEnrollmentSummary[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const raw = accounts[i];
      if (!raw) continue;

      const flags = raw.lessonFlags as InstanceType<typeof anchor.BN>[];
      let lessonCount = 0;
      for (const f of flags) {
        let v = f.clone();
        while (!v.isZero()) {
          if (v.isOdd()) lessonCount++;
          v = v.shrn(1);
        }
      }

      type BN = InstanceType<typeof anchor.BN>;
      results.push({
        courseId: allCourses[i].account.courseId as string,
        enrolledAt: (raw.enrolledAt as BN).toNumber() * 1000,
        completedAt: raw.completedAt
          ? (raw.completedAt as BN).toNumber() * 1000
          : null,
        lessonCount,
      });
    }

    // Merge credential-completed courseIds that no longer have enrollment PDAs
    const { fetchCredentialCompletedCourseIds } = await import(
      "@/lib/solana/enrollments"
    );
    const credentialCourseIds = await fetchCredentialCompletedCourseIds(walletAddress);
    const existingIds = new Set(results.map((r) => r.courseId));

    for (const courseId of credentialCourseIds) {
      if (existingIds.has(courseId)) continue;
      results.push({
        courseId,
        enrolledAt: 0,
        completedAt: Date.now(), // synthetic — timestamps lost when PDA closed
        lessonCount: 1, // at least 1 lesson was completed
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hasCompletedCourseWithTag(ctx: RuleContext, tag: string): Promise<boolean> {
  const enrollments = await ctx.getOnChainEnrollments();
  const completed = enrollments.filter((e) => e.completedAt !== null);
  if (!completed.length) return false;

  try {
    const { getTaggedCourseIds } = await import("@/lib/courses");
    const taggedIds = await getTaggedCourseIds(tag);
    return completed.some((e) => taggedIds.has(e.courseId));
  } catch {
    return false;
  }
}

async function hasCompletedAllCoursesWithTag(ctx: RuleContext, tag: string): Promise<boolean> {
  try {
    const { getTaggedCourseIds } = await import("@/lib/courses");
    const taggedIds = await getTaggedCourseIds(tag);
    if (taggedIds.size === 0) return false;

    const enrollments = await ctx.getOnChainEnrollments();
    const completedIds = new Set(
      enrollments.filter((e) => e.completedAt !== null).map((e) => e.courseId),
    );
    return [...taggedIds].every((id) => completedIds.has(id));
  } catch {
    return false;
  }
}

async function checkSpeedRunner(ctx: RuleContext): Promise<boolean> {
  const enrollments = await ctx.getOnChainEnrollments();
  return enrollments.some((e) => {
    if (e.completedAt === null) return false;
    return e.completedAt - e.enrolledAt < 86400000; // < 24 hours
  });
}

async function checkEarlyAdopter(): Promise<boolean> {
  try {
    const { program } = await import("@/lib/solana/program");
    const allTypes = await program.account.achievementType.all();
    const earlyAdopter = allTypes.find((a) => a.account.achievementId === "early-adopter");
    if (!earlyAdopter) return false;
    const maxSupply = earlyAdopter.account.maxSupply ?? 0;
    if (maxSupply === 0) return true;
    const currentSupply = earlyAdopter.account.currentSupply ?? 0;
    return currentSupply < maxSupply;
  } catch {
    return false;
  }
}

async function checkSocialButterfly(ctx: RuleContext): Promise<boolean> {
  const [{ data: accounts }, { data: profile }] = await Promise.all([
    ctx.db
      .from("accounts")
      .select("provider")
      .eq("user_id", ctx.userId),
    ctx.db
      .from("profiles")
      .select("wallet_address")
      .eq("id", ctx.userId)
      .single(),
  ]);
  const providers = new Set((accounts ?? []).map((a: { provider: string }) => a.provider));
  return providers.has("google") && providers.has("github") && !!profile?.wallet_address;
}

async function checkChallengeChampion(ctx: RuleContext): Promise<boolean> {
  const { count } = await ctx.db
    .from("daily_challenge_completions")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", ctx.userId);
  return count !== null && count >= 50;
}

// ── Rules Registry ───────────────────────────────────────────────────────────

const ACHIEVEMENT_RULES: AchievementRule[] = [
  {
    id: 0, achievementId: "first-steps", name: "First Steps", type: "auto",
    check: async (ctx) => {
      const enrollments = await ctx.getOnChainEnrollments();
      return enrollments.some((e) => e.lessonCount >= 1);
    },
  },
  {
    id: 1, achievementId: "course-completer", name: "Course Completer", type: "auto",
    check: async (ctx) => {
      const enrollments = await ctx.getOnChainEnrollments();
      return enrollments.some((e) => e.completedAt !== null);
    },
  },
  {
    id: 2, achievementId: "speed-runner", name: "Speed Runner", type: "auto",
    check: checkSpeedRunner,
  },
  {
    id: 3, achievementId: "week-warrior", name: "Week Warrior", type: "auto",
    check: async (ctx) => {
      const stats = await ctx.getStats();
      return (stats?.longest_streak ?? 0) >= 7;
    },
  },
  {
    id: 4, achievementId: "monthly-master", name: "Monthly Master", type: "auto",
    check: async (ctx) => {
      const stats = await ctx.getStats();
      return (stats?.longest_streak ?? 0) >= 30;
    },
  },
  {
    id: 5, achievementId: "consistency-king", name: "Consistency King", type: "auto",
    check: async (ctx) => {
      const stats = await ctx.getStats();
      return (stats?.longest_streak ?? 0) >= 100;
    },
  },
  {
    id: 6, achievementId: "rust-rookie", name: "Rust Rookie", type: "auto",
    check: (ctx) => hasCompletedCourseWithTag(ctx, "rust"),
  },
  {
    id: 7, achievementId: "anchor-expert", name: "Anchor Expert", type: "auto",
    check: (ctx) => hasCompletedAllCoursesWithTag(ctx, "anchor"),
  },
  {
    id: 8, achievementId: "early-adopter", name: "Early Adopter", type: "auto",
    check: () => checkEarlyAdopter(),
  },
  {
    id: 9, achievementId: "bug-hunter", name: "Bug Hunter", type: "manual",
    check: () => false,
  },
  {
    id: 10, achievementId: "social-butterfly", name: "Social Butterfly", type: "auto",
    check: checkSocialButterfly,
  },
  {
    id: 11, achievementId: "challenge-champion", name: "Challenge Champion", type: "auto",
    check: checkChallengeChampion,
  },
];

export { ACHIEVEMENT_RULES };
export type { AchievementRule, RuleContext };

// ── Service ──────────────────────────────────────────────────────────────────

class AchievementChecker implements AchievementCheckerService {
  private get db() {
    const client = getAdminClient();
    if (!client) throw new Error("Supabase admin client not configured");
    return client;
  }

  async checkEligibility(userId: string, walletAddress?: string): Promise<string[]> {
    let enrollmentsCache: OnChainEnrollmentSummary[] | null = null;
    let statsCache: { longest_streak: number; created_at: string } | null | undefined = undefined;

    const db = this.db;

    const ctx: RuleContext = {
      userId,
      walletAddress: walletAddress ?? null,
      db,
      getOnChainEnrollments: async () => {
        if (enrollmentsCache !== null) return enrollmentsCache;
        if (!walletAddress) {
          enrollmentsCache = [];
          return enrollmentsCache;
        }
        enrollmentsCache = await loadOnChainEnrollments(walletAddress);
        return enrollmentsCache;
      },
      getStats: async () => {
        if (statsCache !== undefined) return statsCache;
        const { data } = await db
          .from("user_stats")
          .select("longest_streak, last_activity_date, streak_freezes")
          .eq("user_id", userId)
          .single();
        const { data: profile } = await db
          .from("profiles")
          .select("created_at")
          .eq("id", userId)
          .single();
        statsCache = data
          ? { longest_streak: data.longest_streak ?? 0, created_at: profile?.created_at ?? "" }
          : null;
        return statsCache;
      },
    };

    const eligible: string[] = [];
    for (const rule of ACHIEVEMENT_RULES) {
      if (rule.type === "manual") continue;
      try {
        if (await rule.check(ctx)) eligible.push(rule.achievementId);
      } catch {
        // Skip rules that fail (e.g. RPC errors)
      }
    }

    return eligible;
  }
}

let instance: AchievementCheckerService | null = null;

export function getAchievementChecker(): AchievementCheckerService {
  if (instance) return instance;
  instance = new AchievementChecker();
  return instance;
}
