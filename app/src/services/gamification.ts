import type { GamificationService } from "./interfaces";
import type {
  StreakData,
  Achievement,
  XPTransaction,
} from "@/types/gamification";
import { getAdminClient } from "@/lib/supabase/admin";
import { getAchievementReceiptPDA } from "@/lib/solana/on-chain";

/** UTC today as YYYY-MM-DD. */
function getUTCTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

/** Calculate the number of missed days between lastActivityDate and yesterday (UTC). */
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
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
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


// --- Supabase Implementation ---

class SupabaseGamificationService implements GamificationService {
  private get db() {
    const client = getAdminClient();
    if (!client) throw new Error("Supabase admin client not configured");
    return client;
  }

  async getStreak(userId: string): Promise<StreakData> {
    const today = getUTCTodayStr();
    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setUTCDate(twentyEightDaysAgo.getUTCDate() - 27);
    const sinceDate = twentyEightDaysAgo.toISOString().split("T")[0];

    const [{ data }, { data: txRows }] = await Promise.all([
      this.db
        .from("user_stats")
        .select("current_streak, longest_streak, last_activity_date, streak_freezes, streak_freezes_refreshed_at")
        .eq("user_id", userId)
        .single(),
      this.db
        .from("xp_transactions")
        .select("transaction_at")
        .eq("user_id", userId)
        .gte("transaction_at", `${sinceDate}T00:00:00Z`),
    ]);

    // Extract unique dates from transactions
    const txDates = new Set(
      (txRows ?? []).map((r: { transaction_at: string }) =>
        r.transaction_at.split("T")[0],
      ),
    );

    // If last_activity_date is today but xp_transactions hasn't synced yet,
    // inject today so the calendar shows it as active (not frozen).
    if (data?.last_activity_date === today) {
      txDates.add(today);
    }

    const activityDates = [...txDates].sort();

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

    // Read-side freeze refresh: if different month, show 3 (will be persisted on next recordActivity)
    const refreshedMonth = data.streak_freezes_refreshed_at?.slice(0, 7);
    const currentMonth = today.slice(0, 7);
    const streakFreezes = (!refreshedMonth || refreshedMonth !== currentMonth)
      ? 3
      : (data.streak_freezes ?? 0);

    // Compute frozenDates: walk backward from last_activity_date finding gap days
    // that were bridged by freezes within the current streak.
    // current_streak counts ACTIVE days only, so the calendar span is wider when freezes were used.
    const frozenDates: string[] = [];
    const currentStreak = data.current_streak ?? 0;
    if (currentStreak > 1 && data.last_activity_date) {
      const activitySet = new Set(activityDates);
      const cursor = new Date(data.last_activity_date + "T00:00:00Z");
      let activeCount = 0;
      const pendingGaps: string[] = [];

      for (let safety = 0; safety < 365 && activeCount < currentStreak; safety++) {
        const dStr = cursor.toISOString().split("T")[0];
        if (activitySet.has(dStr)) {
          activeCount++;
          frozenDates.push(...pendingGaps);
          pendingGaps.length = 0;
        } else {
          pendingGaps.push(dStr);
          if (pendingGaps.length > 3) break;
        }
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
    }

    return {
      currentStreak,
      longestStreak: data.longest_streak ?? 0,
      lastActivityDate: data.last_activity_date ?? null,
      streakFreezes,
      isActiveToday: data.last_activity_date === today,
      activityDates,
      frozenDates,
    };
  }

  async recordActivity(userId: string): Promise<void> {
    const today = getUTCTodayStr();
    const currentMonth = today.slice(0, 7);

    const { data: stats } = await this.db
      .from("user_stats")
      .select("current_streak, longest_streak, last_activity_date, streak_freezes, streak_freezes_refreshed_at")
      .eq("user_id", userId)
      .single();

    if (!stats) {
      await this.db.from("user_stats").upsert(
        { user_id: userId, current_streak: 1, longest_streak: 1, last_activity_date: today, streak_freezes: 3, streak_freezes_refreshed_at: today },
        { onConflict: "user_id" },
      );
      return;
    }

    // Monthly freeze replenishment — before early-exit check
    const refreshedMonth = stats.streak_freezes_refreshed_at?.slice(0, 7);
    let newFreezes = stats.streak_freezes ?? 0;
    let freezeRefreshed = false;
    if (!refreshedMonth || refreshedMonth !== currentMonth) {
      newFreezes = 3;
      freezeRefreshed = true;
      await this.db
        .from("user_stats")
        .update({ streak_freezes: 3, streak_freezes_refreshed_at: today })
        .eq("user_id", userId);
    }

    if (stats.last_activity_date === today) return;

    let newLongest = stats.longest_streak ?? 0;
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
        ...(freezeRefreshed ? {} : { streak_freezes_refreshed_at: stats.streak_freezes_refreshed_at ?? today }),
      })
      .eq("user_id", userId);
  }

  async getAchievements(userId: string, walletAddress?: string): Promise<Achievement[]> {
    const { getAllCriteria } = await import("@/services/achievement-criteria");
    const criteriaMap = getAllCriteria();

    let allDefs: (Omit<Achievement, "unlocked" | "unlockedAt"> & { isActive: boolean })[];

    try {
      const { program } = await import("@/lib/solana/program");
      const onChainAccounts = await program.account.achievementType.all();

      allDefs = onChainAccounts.map((a, i) => {
        const maxSupply = a.account.maxSupply ?? 0;
        const currentSupply = a.account.currentSupply ?? 0;
        return {
          id: i,
          achievementId: a.account.achievementId,
          name: a.account.name,
          description: a.account.name,
          xpReward: a.account.xpReward,
          maxSupply,
          currentSupply,
          criteria: criteriaMap[a.account.achievementId],
          supplyExhausted: maxSupply > 0 && currentSupply >= maxSupply,
          isActive: a.account.isActive,
        };
      });
    } catch {
      return [];
    }

    if (!walletAddress) {
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
    achievementId: string,
    walletAddress?: string,
  ): Promise<{ success: boolean; signature?: string; asset?: string; error?: string }> {
    if (!walletAddress) {
      return { success: false, error: "Wallet required to claim achievements on-chain" };
    }

    // Check not already claimed on-chain
    const { PublicKey } = await import("@solana/web3.js");
    const { connection } = await import("@/lib/solana/on-chain");
    const receiptPDA = getAchievementReceiptPDA(
      achievementId,
      new PublicKey(walletAddress),
    )[0];
    const existing = await connection.getAccountInfo(receiptPDA);
    if (existing) {
      return { success: false, error: "Achievement already claimed" };
    }

    // Call backend to award on-chain
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
    const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

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
        achievementId,
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
        courseId: (row.course_id as string) || undefined,
        achievementId: (row.achievement_id as string) || undefined,
        transactionAt: row.transaction_at as string,
      }),
    );
  }
}

// --- Singleton ---

export const gamificationService: GamificationService = new SupabaseGamificationService();
