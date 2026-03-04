export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
  streakFreezes: number;
  isActiveToday: boolean;
  /** Dates (YYYY-MM-DD) with activity in the last 28 days, used by the calendar. */
  activityDates?: string[];
  /** Dates (YYYY-MM-DD) within the current streak where a freeze was used. */
  frozenDates?: string[];
}

export interface Achievement {
  id: number;
  achievementId: string;
  name: string;
  description: string;
  xpReward: number;
  maxSupply: number;
  currentSupply: number;
  criteria?: string;
  supplyExhausted: boolean;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface XPTransaction {
  id: string;
  userId: string;
  amount: number;
  source: "lesson" | "course" | "creator_reward" | "achievement" | "reward";
  courseId?: string;
  achievementId?: string;
  transactionAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  totalXP: number;
  level: number;
  currentStreak: number;
}

export interface LevelInfo {
  level: number;
  currentXP: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  progress: number;
}

export function calculateLevel(totalXP: number): LevelInfo {
  const level = Math.floor(Math.sqrt(totalXP / 100));
  const xpForCurrentLevel = level * level * 100;
  const xpForNextLevel = (level + 1) * (level + 1) * 100;
  const progress = totalXP - xpForCurrentLevel;
  const needed = xpForNextLevel - xpForCurrentLevel;
  return {
    level,
    currentXP: totalXP,
    xpForCurrentLevel,
    xpForNextLevel,
    progress: needed > 0 ? progress / needed : 1,
  };
}
