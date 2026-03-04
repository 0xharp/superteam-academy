"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Award, Check, Lock, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics/events";
import type { Achievement } from "@/types/gamification";

interface AchievementGridProps {
  achievements: Achievement[];
  eligible: string[];
  loading: boolean;
}

export function AchievementGrid({ achievements, eligible, loading }: AchievementGridProps) {
  const t = useTranslations("gamification");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());

  async function handleClaim(achievementId: string) {
    setClaiming(achievementId);
    try {
      const res = await fetch("/api/gamification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "claim-achievement", achievementId }),
      });

      const data = await res.json();
      if (data.success) {
        setClaimed((prev) => new Set([...prev, achievementId]));
        trackEvent(ANALYTICS_EVENTS.ACHIEVEMENT_UNLOCKED, { achievementId });
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {[...achievements].sort((a, b) => a.name.localeCompare(b.name)).map((ach) => {
        const isEligible = eligible.includes(ach.achievementId) && !ach.unlocked && !claimed.has(ach.achievementId);
        const isUnlocked = ach.unlocked || claimed.has(ach.achievementId);
        const isClaiming = claiming === ach.achievementId;
        const isExhausted = ach.supplyExhausted && !isUnlocked;

        return (
          <div
            key={ach.achievementId}
            className={`relative aspect-square flex flex-col items-center justify-center gap-1 rounded-lg p-2 text-center transition-all ${
              isUnlocked
                ? "bg-primary/10"
                : isExhausted
                  ? "bg-muted opacity-40"
                  : isEligible
                    ? "bg-primary/5 ring-2 ring-primary/40 ring-offset-1 ring-offset-background cursor-pointer"
                    : "bg-muted opacity-50"
            }`}
            onClick={isEligible && !isClaiming ? () => handleClaim(ach.achievementId) : undefined}
          >
            {ach.criteria && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="center" className="w-56 text-xs">
                  <p className="font-medium mb-1">{t("achievementCriteria")}</p>
                  <p className="text-muted-foreground">{ach.criteria}</p>
                  {ach.maxSupply > 0 && (
                    <p className="mt-1.5 text-muted-foreground">
                      {t("supplyInfo", { current: ach.currentSupply, max: ach.maxSupply })}
                    </p>
                  )}
                </PopoverContent>
              </Popover>
            )}
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
            {isExhausted && (
              <span className="text-[9px] text-muted-foreground">
                {t("supplyExhausted", { current: ach.currentSupply, max: ach.maxSupply })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
