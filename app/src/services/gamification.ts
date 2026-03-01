import type { GamificationService } from "./interfaces";
import type {
  StreakData,
  Achievement,
  XPTransaction,
} from "@/types/gamification";
import { calculateLevel } from "@/types/gamification";
import { getAdminClient } from "@/lib/supabase/admin";
import { rowToUserStats } from "@/lib/supabase/mappers";
import { getCoursePDA, getAchievementReceiptPDA } from "@/lib/solana/on-chain";

const DAILY_XP_CAP = 2000;

/** Calculate the number of missed days between lastActivityDate and yesterday. */
function getMissedDays(lastActivityDate: string): number {
  const last = new Date(lastActivityDate + "T00:00:00Z");
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const diffMs = yesterday.getTime() - last.getTime();
  return Math.max(0, Math.round(diffMs / 86400000));
}

/** Update streak accounting for gap days and available freezes. */
function computeNewStreak(
  lastActivityDate: string | null,
  today: string,
  currentStreak: number,
  freezes: number,
): { newStreak: number; freezesUsed: number } {
  if (!lastActivityDate) return { newStreak: 1, freezesUsed: 0 };

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  if (lastActivityDate === yesterdayStr) {
    return { newStreak: currentStreak + 1, freezesUsed: 0 };
  }

  const missed = getMissedDays(lastActivityDate);
  if (missed > 0 && missed <= freezes) {
    return { newStreak: currentStreak + 1, freezesUsed: missed };
  }

  return { newStreak: 1, freezesUsed: 0 };
}

const ACHIEVEMENT_DEFINITIONS: Omit<Achievement, "unlocked" | "unlockedAt">[] =
  [
    { id: 0, achievementId: "first-steps", name: "First Steps", description: "Complete your first lesson", icon: "footprints", category: "progress", xpReward: 50 },
    { id: 1, achievementId: "course-completer", name: "Course Completer", description: "Complete your first course", icon: "graduation-cap", category: "progress", xpReward: 200 },
    { id: 2, achievementId: "speed-runner", name: "Speed Runner", description: "Complete a course in one day", icon: "zap", category: "progress", xpReward: 500 },
    { id: 3, achievementId: "week-warrior", name: "Week Warrior", description: "Maintain a 7-day streak", icon: "flame", category: "streak", xpReward: 100 },
    { id: 4, achievementId: "monthly-master", name: "Monthly Master", description: "Maintain a 30-day streak", icon: "calendar", category: "streak", xpReward: 300 },
    { id: 5, achievementId: "consistency-king", name: "Consistency King", description: "Maintain a 100-day streak", icon: "crown", category: "streak", xpReward: 1000 },
    { id: 6, achievementId: "rust-rookie", name: "Rust Rookie", description: "Complete a Rust course", icon: "code", category: "skill", xpReward: 150 },
    { id: 7, achievementId: "anchor-expert", name: "Anchor Expert", description: "Complete all Anchor courses", icon: "anchor", category: "skill", xpReward: 500 },
    { id: 8, achievementId: "early-adopter", name: "Early Adopter", description: "Among the first 100 users", icon: "star", category: "special", xpReward: 250 },
    { id: 9, achievementId: "bug-hunter", name: "Bug Hunter", description: "Report a verified bug", icon: "bug", category: "special", xpReward: 200 },
    { id: 10, achievementId: "social-butterfly", name: "Social Butterfly", description: "Connect all social accounts", icon: "users", category: "special", xpReward: 100 },
    { id: 11, achievementId: "challenge-champion", name: "Challenge Champion", description: "Complete 50 code challenges", icon: "trophy", category: "progress", xpReward: 400 },
  ];

export { ACHIEVEMENT_DEFINITIONS };

// --- Supabase Implementation ---

class SupabaseGamificationService implements GamificationService {
  private get db() {
    const client = getAdminClient();
    if (!client) throw new Error("Supabase admin client not configured");
    return client;
  }

  async getXP(userId: string): Promise<number> {
    const { data } = await this.db
      .from("user_stats")
      .select("total_xp")
      .eq("user_id", userId)
      .single();
    return data?.total_xp ?? 0;
  }

  async getLevel(userId: string): Promise<number> {
    const xp = await this.getXP(userId);
    return calculateLevel(xp).level;
  }

  async getStreak(userId: string): Promise<StreakData> {
    const today = new Date().toISOString().split("T")[0];
    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 27);
    const sinceDate = twentyEightDaysAgo.toISOString().split("T")[0];

    const [{ data }, { data: txRows }] = await Promise.all([
      this.db
        .from("user_stats")
        .select("current_streak, longest_streak, last_activity_date, streak_freezes")
        .eq("user_id", userId)
        .single(),
      this.db
        .from("xp_transactions")
        .select("transaction_at")
        .eq("user_id", userId)
        .gte("transaction_at", `${sinceDate}T00:00:00Z`),
    ]);

    // Extract unique dates from transactions
    const activityDates = [
      ...new Set(
        (txRows ?? []).map((r: { transaction_at: string }) =>
          r.transaction_at.split("T")[0],
        ),
      ),
    ].sort();

    if (!data) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
        streakFreezes: 3,
        isActiveToday: false,
        activityDates,
      };
    }

    return {
      currentStreak: data.current_streak ?? 0,
      longestStreak: data.longest_streak ?? 0,
      lastActivityDate: data.last_activity_date ?? null,
      streakFreezes: data.streak_freezes ?? 0,
      isActiveToday: data.last_activity_date === today,
      activityDates,
    };
  }

  async awardXP(
    userId: string,
    amount: number,
    source: string,
    sourceId?: string,
  ): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    // Check daily cap
    const { data: todayTxs } = await this.db
      .from("xp_transactions")
      .select("amount")
      .eq("user_id", userId)
      .gte("transaction_at", `${today}T00:00:00Z`);

    const todayXP = (todayTxs ?? []).reduce(
      (sum: number, t: { amount: number }) => sum + t.amount,
      0,
    );
    const cappedAmount = Math.min(amount, DAILY_XP_CAP - todayXP);
    if (cappedAmount <= 0) return;

    // Convert slug to PDA if provided for consistent indexing
    let coursePdaString: string | undefined = undefined;
    if (sourceId) {
      try {
        coursePdaString = getCoursePDA(sourceId)[0].toBase58();
      } catch (err) {
        // Achievement IDs or other non-slug sourceIds fall back to original
        coursePdaString = sourceId;
      }
    }

    // Insert XP transaction
    await this.db.from("xp_transactions").insert({
      user_id: userId,
      amount: cappedAmount,
      source,
      course_pda: coursePdaString,
    });

    // Get current stats
    const { data: stats } = await this.db
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!stats) return;

    const currentStats = rowToUserStats(stats);
    const newXP = currentStats.totalXP + cappedAmount;
    const newLevel = calculateLevel(newXP).level;

    // Update streak
    let newStreak = currentStats.currentStreak;
    let newLongest = currentStats.longestStreak;
    let newFreezes = currentStats.streakFreezes;

    if (currentStats.lastActivityDate !== today) {
      const result = computeNewStreak(
        currentStats.lastActivityDate,
        today,
        currentStats.currentStreak,
        newFreezes,
      );
      newStreak = result.newStreak;
      newFreezes -= result.freezesUsed;
      if (newStreak > newLongest) newLongest = newStreak;
    }

    await this.db
      .from("user_stats")
      .update({
        total_xp: newXP,
        level: newLevel,
        current_streak: newStreak,
        longest_streak: newLongest,
        last_activity_date: today,
        streak_freezes: newFreezes,
      })
      .eq("user_id", userId);
  }

  async recordActivity(userId: string): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const { data: stats } = await this.db
      .from("user_stats")
      .select("current_streak, longest_streak, last_activity_date, streak_freezes")
      .eq("user_id", userId)
      .single();
    if (!stats) {
      await this.db.from("user_stats").upsert(
        { user_id: userId, current_streak: 1, longest_streak: 1, last_activity_date: today, streak_freezes: 3 },
        { onConflict: "user_id" },
      );
      return;
    }
    if (stats.last_activity_date === today) return;
    let newLongest = stats.longest_streak ?? 0;
    let newFreezes = stats.streak_freezes ?? 0;
    const result = computeNewStreak(
      stats.last_activity_date,
      today,
      stats.current_streak ?? 0,
      newFreezes,
    );
    const newStreak = result.newStreak;
    newFreezes -= result.freezesUsed;
    if (newStreak > newLongest) newLongest = newStreak;
    await this.db
      .from("user_stats")
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_activity_date: today,
        streak_freezes: newFreezes,
      })
      .eq("user_id", userId);
  }

  async getAchievements(userId: string, walletAddress?: string): Promise<Achievement[]> {
    // Build achievement list from on-chain types + hardcoded metadata fallbacks
    let allDefs: (Omit<Achievement, "unlocked" | "unlockedAt"> & { isActive: boolean })[];

    try {
      const { program } = await import("@/lib/solana/program");
      const onChainAccounts = await program.account.achievementType.all();

      const hardcodedMap = new Map(
        ACHIEVEMENT_DEFINITIONS.map((d) => [d.achievementId, d]),
      );

      allDefs = onChainAccounts.map((a, i) => {
        const hc = hardcodedMap.get(a.account.achievementId);
        return {
          id: hc?.id ?? 100 + i,
          achievementId: a.account.achievementId,
          name: hc?.name ?? a.account.name,
          description: hc?.description ?? a.account.name,
          icon: hc?.icon ?? "trophy",
          category: hc?.category ?? "special",
          xpReward: a.account.xpReward,
          isActive: a.account.isActive,
        };
      });
    } catch {
      allDefs = ACHIEVEMENT_DEFINITIONS.map((d) => ({ ...d, isActive: true }));
    }

    if (!walletAddress) {
      // No wallet: show only active achievements (can't check receipts)
      return allDefs
        .filter((def) => def.isActive)
        .map(({ isActive: _, ...def }) => ({
          ...def,
          unlocked: false,
          unlockedAt: undefined,
        }));
    }

    const { PublicKey } = await import("@solana/web3.js");
    const { connection } = await import("@/lib/solana/on-chain");
    const recipient = new PublicKey(walletAddress);

    const pdas = allDefs.map((def) =>
      getAchievementReceiptPDA(def.achievementId, recipient)[0],
    );

    const accounts = await connection.getMultipleAccountsInfo(pdas);

    // Show active achievements + any inactive ones the user has already earned
    return allDefs
      .map(({ isActive, ...def }, i) => ({
        ...def,
        unlocked: accounts[i] !== null,
        unlockedAt: accounts[i] ? new Date().toISOString() : undefined,
        _isActive: isActive,
      }))
      .filter((ach) => ach._isActive || ach.unlocked)
      .map(({ _isActive, ...ach }) => ach);
  }

  async claimAchievement(
    userId: string,
    achievementIndex: number,
    walletAddress?: string,
  ): Promise<{ success: boolean; signature?: string; asset?: string; error?: string }> {
    const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === achievementIndex);
    if (!def) return { success: false, error: "Unknown achievement" };

    if (!walletAddress) {
      return { success: false, error: "Wallet required to claim achievements on-chain" };
    }

    // Check not already claimed on-chain
    const { PublicKey } = await import("@solana/web3.js");
    const { connection } = await import("@/lib/solana/on-chain");
    const receiptPDA = getAchievementReceiptPDA(
      def.achievementId,
      new PublicKey(walletAddress),
    )[0];
    const existing = await connection.getAccountInfo(receiptPDA);
    if (existing) {
      return { success: false, error: "Achievement already claimed" };
    }

    // Call backend to award on-chain
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
    const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

    // Build a minimal JWT for backend auth
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ sub: userId })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(authSecret));

    const response = await fetch(`${backendUrl}/award-achievement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        achievementId: def.achievementId,
        recipientWallet: walletAddress,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Backend error" }));
      return { success: false, error: err.error || "Failed to award achievement on-chain" };
    }

    const result = await response.json();

    return {
      success: true,
      signature: result.signature,
      asset: result.asset,
    };
  }

  async getXPHistory(userId: string, limit = 20): Promise<XPTransaction[]> {
    const { data, error } = await this.db
      .from("xp_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("transaction_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map(
      (row: Record<string, unknown>): XPTransaction => ({
        id: row.id as string,
        userId: row.user_id as string,
        amount: row.amount as number,
        source: row.source as XPTransaction["source"],
        sourceId: (row.course_pda as string) || undefined,
        createdAt: row.transaction_at as string,
      }),
    );
  }
}

// --- Singleton ---

export const gamificationService: GamificationService = new SupabaseGamificationService();
