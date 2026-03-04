import type { LeaderboardService } from "./interfaces";
import type { LeaderboardEntry } from "@/types/gamification";
import { calculateLevel } from "@/types/gamification";
import { getAdminClient } from "@/lib/supabase/admin";
import { getSyncService } from "./onchain-sync";
import type { XpMintRecord } from "./onchain-sync";

interface ProfileRow {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

function resolveProfile(raw: ProfileRow | ProfileRow[]): ProfileRow | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function toEntry(userId: string, xp: number, profile: ProfileRow, streak: number, rank = 0): LeaderboardEntry {
  return {
    rank,
    userId,
    username: profile.username || "",
    displayName: profile.display_name || "Anonymous",
    avatarUrl: profile.avatar_url || "",
    totalXP: xp,
    level: calculateLevel(xp).level,
    currentStreak: streak,
  };
}

function ranked(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries
    .sort((a, b) => b.totalXP - a.totalXP)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

class SupabaseLeaderboardService implements LeaderboardService {
  private get db() {
    const client = getAdminClient();
    if (!client) throw new Error("Supabase admin client not configured");
    return client;
  }

  private async getLastSyncedAt(): Promise<string | null> {
    const { data } = await this.db
      .from("system_config")
      .select("value")
      .eq("key", "leaderboard_last_synced_at")
      .single();
    return data?.value ?? null;
  }

  async getLeaderboard(params: {
    timeframe: "weekly" | "monthly" | "alltime";
    courseId?: string;
    source?: string;
    achievementId?: string;
  }): Promise<{ entries: LeaderboardEntry[]; lastSyncedAt: string | null }> {
    const lastSyncedAt = await this.getLastSyncedAt();
    const entries = await this.fromTransactions(params);
    return { entries, lastSyncedAt };
  }

  private async fromTransactions(params: {
    timeframe: string;
    courseId?: string;
    source?: string;
    achievementId?: string;
  }): Promise<LeaderboardEntry[]> {
    const { timeframe, courseId, source, achievementId } = params;
    const query = this.db
      .from("xp_transactions")
      .select("user_id, amount, profiles!inner(username, display_name, avatar_url)");

    if (courseId) query.eq("course_id", courseId);
    if (source) query.eq("source", source);
    if (achievementId) query.eq("achievement_id", achievementId);

    if (timeframe === "weekly" || timeframe === "monthly") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (timeframe === "weekly" ? 7 : 30));
      query.gte("transaction_at", cutoff.toISOString());
    }

    const { data: txData, error } = await query;
    if (error || !txData?.length) return [];

    // Group XP by user
    const groups = new Map<string, { xp: number; profile: ProfileRow }>();
    for (const tx of txData) {
      const profile = resolveProfile(tx.profiles);
      if (!profile) continue;
      const g = groups.get(tx.user_id) || { xp: 0, profile };
      g.xp += Number(tx.amount || 0);
      groups.set(tx.user_id, g);
    }

    // Fetch user_stats for streak
    const userIds = Array.from(groups.keys());
    const { data: statsData } = await this.db
      .from("user_stats")
      .select("user_id, current_streak")
      .in("user_id", userIds);

    const streakMap = new Map<string, number>();
    for (const row of statsData ?? []) {
      streakMap.set(row.user_id, row.current_streak ?? 0);
    }

    return ranked(Array.from(groups.entries()).map(([userId, { xp, profile }]) =>
      toEntry(userId, xp, profile, streakMap.get(userId) ?? 0)
    ));
  }

  async getUserRank(params: {
    userId: string;
    timeframe: "weekly" | "monthly" | "alltime";
    courseId?: string;
  }): Promise<number> {
    const { entries } = await this.getLeaderboard({ timeframe: params.timeframe, courseId: params.courseId });
    return entries.find((e) => e.userId === params.userId)?.rank ?? -1;
  }

  async syncLeaderboardWithOnchainData(): Promise<{ processed: number; lastSignature: string | null }> {
    const syncService = getSyncService();

    const { data: config } = await this.db
      .from("system_config")
      .select("value")
      .eq("key", "leaderboard_last_synced_signature")
      .single();

    const lastSig = config?.value || undefined;
    const { records, latestSignature } = await syncService.syncXpTransactions(lastSig);

    let processed = 0;
    for (const record of [...records].reverse()) {
      if (await this.recordXpEvent(record)) processed++;
    }

    if (latestSignature && (processed > 0 || !config?.value)) {
      await this.db.from("system_config").upsert([
        { key: "leaderboard_last_synced_signature", value: latestSignature },
        { key: "leaderboard_last_synced_at", value: new Date().toISOString() },
      ]);
    }

    return { processed, lastSignature: latestSignature };
  }

  private async recordXpEvent(record: XpMintRecord): Promise<boolean> {
    const { data: profile } = await this.db
      .from("profiles")
      .select("id")
      .eq("wallet_address", record.walletAddress)
      .single();

    if (!profile) return false;

    const { data: existing } = await this.db
      .from("xp_transactions")
      .select("id")
      .eq("tx_signature", record.signature)
      .eq("user_id", profile.id)
      .maybeSingle();

    if (existing) return false;

    const transactionAt = new Date(record.timestamp * 1000).toISOString();

    const { error } = await this.db.from("xp_transactions").insert({
      user_id: profile.id,
      amount: record.amount,
      source: record.source,
      course_id: record.courseId,
      achievement_id: record.achievementId,
      tx_signature: record.signature,
      transaction_at: transactionAt,
    });

    if (error) {
      console.error(`[Leaderboard] Insert failed for ${record.signature}:`, error);
      return false;
    }

    const { data: stats } = await this.db
      .from("user_stats")
      .select("total_xp")
      .eq("user_id", profile.id)
      .single();

    const newTotal = (stats?.total_xp || 0) + record.amount;
    await this.db.from("user_stats").upsert({
      user_id: profile.id,
      total_xp: newTotal,
      last_activity_date: transactionAt.slice(0, 10),
    });

    return true;
  }
}

let instance: LeaderboardService | null = null;

export function getLeaderboardService(): LeaderboardService {
  if (instance) return instance;
  instance = new SupabaseLeaderboardService();
  return instance;
}

export const leaderboardService = getLeaderboardService();
