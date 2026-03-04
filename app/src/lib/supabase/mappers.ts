import type { UserProfile, UserStats } from "@/types/user";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function rowToProfile(row: any): UserProfile {
  return {
    id: row.id,
    username: row.username ?? "",
    displayName: row.display_name ?? "",
    email: row.email ?? "",
    bio: row.bio ?? "",
    avatarUrl: row.avatar_url ?? "",
    socialLinks: row.social_links ?? {},
    walletAddress: row.wallet_address ?? undefined,
    isPublic: row.is_public ?? true,
    emailNotifications: row.email_notifications ?? true,
    preferredLanguage: row.preferred_language ?? "en",
    preferredTheme: row.preferred_theme ?? "dark",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToUserStats(row: any): UserStats {
  return {
    userId: row.user_id,
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    lastActivityDate: row.last_activity_date ?? null,
    streakFreezes: row.streak_freezes ?? 0,
    updatedAt: row.updated_at,
  };
}
