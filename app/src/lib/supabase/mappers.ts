import type { UserProfile, UserStats } from "@/types/user";

interface ProfileRow {
  id: string;
  username?: string;
  display_name?: string;
  email?: string;
  bio?: string;
  avatar_url?: string;
  social_links?: Record<string, string>;
  wallet_address?: string;
  is_public?: boolean;
  email_notifications?: boolean;
  preferred_language?: string;
  preferred_theme?: string;
  created_at: string;
  updated_at: string;
}

interface StatsRow {
  user_id: string;
  current_streak?: number;
  longest_streak?: number;
  last_activity_date?: string | null;
  streak_freezes?: number;
  updated_at: string;
}

export function rowToProfile(row: ProfileRow): UserProfile {
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

export function rowToUserStats(row: StatsRow): UserStats {
  return {
    userId: row.user_id,
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    lastActivityDate: row.last_activity_date ?? null,
    streakFreezes: row.streak_freezes ?? 0,
    updatedAt: row.updated_at,
  };
}
