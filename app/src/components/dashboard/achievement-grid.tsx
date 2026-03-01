"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, Check, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Achievement } from "@/types/gamification";

interface AchievementGridProps {
  achievements: Achievement[];
  eligible: number[];
  loading: boolean;
}

export function AchievementGrid({ achievements, eligible, loading }: AchievementGridProps) {
  const t = useTranslations("gamification");
  const tc = useTranslations("common");
  const [claiming, setClaiming] = useState<number | null>(null);
  const [claimed, setClaimed] = useState<Set<number>>(new Set());

  async function handleClaim(achievementId: number) {
    setClaiming(achievementId);
    try {
      const res = await fetch("/api/gamification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "claim-achievement", achievementIndex: achievementId }),
      });

      const data = await res.json();
      if (data.success) {
        setClaimed((prev) => new Set([...prev, achievementId]));
        toast.success(t("achievementClaimed"));
      } else {
        toast.error(data.error || t("claimFailed"));
      }
    } catch {
      toast.error(t("claimFailed"));
    }
    setClaiming(null);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {[...achievements].sort((a, b) => a.name.localeCompare(b.name)).map((ach) => {
        const isEligible = eligible.includes(ach.id) && !ach.unlocked && !claimed.has(ach.id);
        const isUnlocked = ach.unlocked || claimed.has(ach.id);
        const isClaiming = claiming === ach.id;

        return (
          <div
            key={ach.id}
            className={`relative aspect-square flex flex-col items-center justify-center gap-1 rounded-lg p-2 text-center transition-all ${
              isUnlocked
                ? "bg-primary/10"
                : isEligible
                  ? "bg-primary/5 ring-2 ring-primary/40 ring-offset-1 ring-offset-background cursor-pointer"
                  : "bg-muted opacity-50"
            }`}
            onClick={isEligible && !isClaiming ? () => handleClaim(ach.id) : undefined}
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                isUnlocked
                  ? "bg-primary text-primary-foreground"
                  : isEligible
                    ? "bg-primary/20 text-primary"
                    : "bg-muted-foreground/20"
              }`}
            >
              {isUnlocked ? (
                <Check className="h-5 w-5" />
              ) : isEligible ? (
                isClaiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-5 w-5" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
            </div>
            <span className="text-[10px] font-medium leading-tight">
              {ach.name}
            </span>
            {isEligible && (
              <span className="text-[9px] font-medium text-primary">
                {t("claimAchievement")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
