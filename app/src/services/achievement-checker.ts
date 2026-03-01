import type { SupabaseClient } from "@supabase/supabase-js";
import type { AchievementCheckerService } from "./interfaces";
import { getAdminClient } from "@/lib/supabase/admin";

// ── Types ────────────────────────────────────────────────────────────────────

interface UserStats {
  lessons_completed?: number;
  courses_completed?: number;
  longest_streak?: number;
  challenges_completed?: number;
  achievement_flags?: number[];
  created_at?: string;
  [key: string]: unknown;
}

interface RuleContext {
  userId: string;
  stats: UserStats;
  db: SupabaseClient;
}

interface AchievementRule {
  id: number;
  achievementId: string;
  name: string;
  type: "auto" | "manual";
  check: (ctx: RuleContext) => Promise<boolean> | boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hasCompletedCourseWithTag(ctx: RuleContext, tag: string): Promise<boolean> {
  const { data: completions } = await ctx.db
    .from("enrollments")
    .select("course_id")
    .eq("user_id", ctx.userId)
    .not("completed_at", "is", null);

  if (!completions?.length) return false;

  try {
    const { getTaggedCourseIds } = await import("@/lib/courses");
    const taggedIds = await getTaggedCourseIds(tag);
    return completions.some((e) => taggedIds.has(e.course_id));
  } catch {
    return false;
  }
}

async function hasCompletedAllCoursesWithTag(ctx: RuleContext, tag: string): Promise<boolean> {
  try {
    const { getTaggedCourseIds } = await import("@/lib/courses");
    const taggedIds = await getTaggedCourseIds(tag);
    if (taggedIds.size === 0) return false;

    const { data: completions } = await ctx.db
      .from("enrollments")
      .select("course_id")
      .eq("user_id", ctx.userId)
      .not("completed_at", "is", null);

    const completedIds = new Set((completions ?? []).map((e) => e.course_id));
    return [...taggedIds].every((id) => completedIds.has(id));
  } catch {
    return false;
  }
}

async function checkSpeedRunner(ctx: RuleContext): Promise<boolean> {
  const { data: speedRun } = await ctx.db
    .rpc("check_speed_runner" as never, { p_user_id: ctx.userId } as never)
    .maybeSingle();
  if ((speedRun as { exists?: boolean } | null)?.exists) return true;

  const { data: enrollments } = await ctx.db
    .from("enrollments")
    .select("enrolled_at, completed_at")
    .eq("user_id", ctx.userId)
    .not("completed_at", "is", null);

  return !!enrollments?.some((e) => {
    const enrolled = new Date(e.enrolled_at).getTime();
    const completed = new Date(e.completed_at).getTime();
    return completed - enrolled < 86400000;
  });
}

async function checkEarlyAdopter(ctx: RuleContext): Promise<boolean> {
  const { count } = await ctx.db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .lt("created_at", ctx.stats.created_at ?? new Date().toISOString());
  return count !== null && count < 100;
}

async function checkSocialButterfly(ctx: RuleContext): Promise<boolean> {
  const { data: profile } = await ctx.db
    .from("profiles")
    .select("social_links")
    .eq("id", ctx.userId)
    .single();
  const links = profile?.social_links as Record<string, string> | null;
  return !!(links?.twitter && links?.github && links?.discord);
}

// ── Rules Registry ───────────────────────────────────────────────────────────

const ACHIEVEMENT_RULES: AchievementRule[] = [
  {
    id: 0, achievementId: "first-steps", name: "First Steps", type: "auto",
    check: (ctx) => (ctx.stats.lessons_completed ?? 0) >= 1,
  },
  {
    id: 1, achievementId: "course-completer", name: "Course Completer", type: "auto",
    check: (ctx) => (ctx.stats.courses_completed ?? 0) >= 1,
  },
  {
    id: 2, achievementId: "speed-runner", name: "Speed Runner", type: "auto",
    check: checkSpeedRunner,
  },
  {
    id: 3, achievementId: "week-warrior", name: "Week Warrior", type: "auto",
    check: (ctx) => (ctx.stats.longest_streak ?? 0) >= 7,
  },
  {
    id: 4, achievementId: "monthly-master", name: "Monthly Master", type: "auto",
    check: (ctx) => (ctx.stats.longest_streak ?? 0) >= 30,
  },
  {
    id: 5, achievementId: "consistency-king", name: "Consistency King", type: "auto",
    check: (ctx) => (ctx.stats.longest_streak ?? 0) >= 100,
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
    check: checkEarlyAdopter,
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
    check: (ctx) => (ctx.stats.challenges_completed ?? 0) >= 50,
  },
];

export { ACHIEVEMENT_RULES };
export type { AchievementRule, RuleContext };

// ── Service ──────────────────────────────────────────────────────────────────

class SupabaseAchievementChecker implements AchievementCheckerService {
  private get db() {
    const client = getAdminClient();
    if (!client) throw new Error("Supabase admin client not configured");
    return client;
  }

  async checkEligibility(userId: string): Promise<number[]> {
    const { data: stats } = await this.db
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!stats) return [];

    const flags: number[] = stats.achievement_flags ?? [0, 0, 0, 0];
    const eligible: number[] = [];

    const isClaimed = (id: number): boolean => {
      const flagIndex = Math.floor(id / 64);
      const bit = id % 64;
      return flagIndex < flags.length && (flags[flagIndex] & (1 << bit)) !== 0;
    };

    const ctx: RuleContext = { userId, stats, db: this.db };

    for (const rule of ACHIEVEMENT_RULES) {
      if (rule.type === "manual" || isClaimed(rule.id)) continue;
      if (await rule.check(ctx)) eligible.push(rule.id);
    }

    return eligible;
  }
}

let instance: AchievementCheckerService | null = null;

export function getAchievementChecker(): AchievementCheckerService {
  if (instance) return instance;
  instance = new SupabaseAchievementChecker();
  return instance;
}
