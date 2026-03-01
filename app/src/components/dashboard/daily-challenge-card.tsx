"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Check, X } from "lucide-react";
import { Link } from "@/i18n/routing";

interface ChallengeData {
  id: string;
  question: string;
  options: string[];
  xpReward: number;
  category: string;
  alreadyCompleted: boolean;
}

export function DailyChallengeCard() {
  const tc = useTranslations("common");
  const td = useTranslations("dailyChallenges");
  const { data: session } = useSession();

  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; xpEarned?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const hasWallet = !!session?.walletAddress;

  useEffect(() => {
    fetch("/api/daily-challenge")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setLoading(false);
          return;
        }
        setChallenge(data);
        if (data.alreadyCompleted) {
          setResult({ correct: true });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    if (!challenge || selected === null || submitting || !hasWallet) return;
    setSubmitting(true);

    const res = await fetch("/api/daily-challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: challenge.id, selectedIndex: selected }),
    });

    const data = await res.json();
    setResult({ correct: data.correct, xpEarned: data.xpEarned });
    setSubmitting(false);
  }

  if (loading) {
    return (
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-gold/5">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-1/3 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-9 rounded bg-muted" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!challenge) return null;

  const completed = challenge.alreadyCompleted || result?.correct;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-gold/5">
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{td("title")}</h3>
        </div>

        {completed && !result?.xpEarned ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
            <Check className="h-4 w-4" />
            {td("alreadyCompleted")}
          </div>
        ) : result ? (
          <div className="mt-4 space-y-2">
            <div className={`flex items-center gap-2 text-sm font-medium ${result.correct ? "text-green-600" : "text-red-500"}`}>
              {result.correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {result.correct ? td("correct") : td("incorrect")}
            </div>
            {result.xpEarned ? (
              <p className="text-sm font-medium text-primary">
                +{result.xpEarned} {tc("xp")} {td("xpEarned")}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {challenge.question}
            </p>
            <div className="mt-3 space-y-2">
              {challenge.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`w-full rounded-lg border p-2.5 text-left text-sm transition-colors ${
                    selected === i
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Badge variant="secondary">{challenge.category}</Badge>
              <span className="text-sm font-medium text-primary">
                {challenge.xpReward} {tc("xp")}
              </span>
            </div>
            {!hasWallet ? (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {td("linkWalletToSubmit")}
                </p>
                <Link href="/settings">
                  <Button variant="outline" size="sm" className="mt-2">
                    {tc("settings")}
                  </Button>
                </Link>
              </div>
            ) : (
              <Button
                className="mt-4 w-full"
                size="sm"
                disabled={selected === null || submitting}
                onClick={handleSubmit}
              >
                {submitting ? td("submitting") : td("submitAnswer")}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
