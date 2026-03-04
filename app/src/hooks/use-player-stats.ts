"use client";

import { useState, useEffect, useRef } from "react";
import type { StreakData } from "@/types/gamification";
import { calculateLevel } from "@/types/gamification";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { PublicKey } from "@solana/web3.js";

export interface PlayerStats {
  xp: number;
  level: number;
  streak: StreakData | null;
  loading: boolean;
}

const DEFAULT_STREAK: StreakData = {
  currentStreak: 0,
  longestStreak: 0,
  lastActivityDate: null,
  streakFreezes: 0,
  isActiveToday: false,
};

/**
 * Shared hook that fetches on-chain XP (Token-2022 ATA) and off-chain streak.
 * Used by both Dashboard and Profile pages for consistent stats.
 */
const STREAK_MILESTONES = [3, 7, 14, 30];

export function usePlayerStats(walletAddress?: string | null): PlayerStats {
  const [stats, setStats] = useState<PlayerStats>({
    xp: 0,
    level: 0,
    streak: null,
    loading: true,
  });
  const prevStreakRef = useRef<number | null>(null);

  useEffect(() => {
    // undefined = session still loading, keep skeleton; null = no wallet linked
    if (walletAddress === undefined) return;
    if (walletAddress === null) {
      setStats({ xp: 0, level: 0, streak: null, loading: false });
      return;
    }

    let cancelled = false;

    async function fetchStats() {
      try {
        const [xpResult, apiResult] = await Promise.all([
          import("@/lib/solana/on-chain").then(({ getXPBalance }) =>
            getXPBalance(new PublicKey(walletAddress!)).catch(() => 0),
          ),
          fetch("/api/gamification?type=stats")
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
        ]);

        if (cancelled) return;

        const xp = xpResult;
        const level = calculateLevel(xp).level;
        const streak: StreakData = apiResult?.streak ?? DEFAULT_STREAK;

        // Track streak events on change
        const prev = prevStreakRef.current;
        if (prev !== null) {
          if (streak.currentStreak === 0 && prev > 0) {
            trackEvent(ANALYTICS_EVENTS.STREAK_BROKEN, { previousStreak: prev });
          }
          const milestone = STREAK_MILESTONES.find((m) => streak.currentStreak >= m && prev < m);
          if (milestone) {
            trackEvent(ANALYTICS_EVENTS.STREAK_MILESTONE, { days: milestone, currentStreak: streak.currentStreak });
          }
        }
        prevStreakRef.current = streak.currentStreak;

        setStats({ xp, level, streak, loading: false });
      } catch {
        if (!cancelled) {
          setStats({ xp: 0, level: 0, streak: null, loading: false });
        }
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, [walletAddress]);

  return stats;
}
