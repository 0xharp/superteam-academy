import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTodaysChallenge, getChallengeById, checkAnswer } from "@/lib/daily-challenges";
import { gamificationService } from "@/services/gamification";
import { getAdminClient } from "@/lib/supabase/admin";

async function rewardXpOnChain(walletAddress: string, amount: number, memo: string): Promise<{ success: boolean; signature?: string }> {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

  const { SignJWT } = await import("jose");
  const token = await new SignJWT({ sub: "daily-challenge" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(authSecret));

  const res = await fetch(`${backendUrl}/reward-xp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ recipientWallet: walletAddress, amount, memo }),
  });

  if (!res.ok) return { success: false };
  const data = await res.json();
  return { success: true, signature: data.signature };
}

export async function GET() {
  const challenge = await getTodaysChallenge();
  if (!challenge) {
    return NextResponse.json({ error: "No challenges available" }, { status: 404 });
  }

  const session = await auth();
  let alreadyCompleted = false;

  if (session?.user?.id) {
    const db = getAdminClient();
    if (db) {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await db
        .from("daily_challenge_completions")
        .select("user_id")
        .eq("user_id", session.user.id)
        .eq("challenge_date", today)
        .maybeSingle();
      alreadyCompleted = !!data;
    }
  }

  return NextResponse.json({
    id: challenge.id,
    question: challenge.question,
    options: challenge.options,
    xpReward: challenge.xpReward,
    category: challenge.category,
    alreadyCompleted,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { challengeId, selectedIndex } = body;

  if (typeof challengeId !== "string" || typeof selectedIndex !== "number") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const today = new Date().toISOString().split("T")[0];

  // Check if already completed today
  const { data: existing } = await db
    .from("daily_challenge_completions")
    .select("user_id")
    .eq("user_id", session.user.id)
    .eq("challenge_date", today)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ correct: false, alreadyCompleted: true });
  }

  const challenge = await getChallengeById(challengeId);
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }

  const correct = checkAnswer(challenge.correctIndex, selectedIndex);

  if (correct) {
    const walletAddress = session.walletAddress;
    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet required to earn XP" }, { status: 400 });
    }

    // Record completion
    await db.from("daily_challenge_completions").insert({
      user_id: session.user.id,
      challenge_id: challengeId,
      challenge_date: today,
    });

    // Award XP on-chain via backend reward_xp instruction
    const result = await rewardXpOnChain(
      walletAddress,
      challenge.xpReward,
      `daily-challenge:${challengeId}`,
    );

    if (!result.success) {
      return NextResponse.json({
        correct: true,
        xpEarned: 0,
        error: "Failed to award XP on-chain",
        alreadyCompleted: false,
      });
    }

    await gamificationService.recordActivity(session.user.id);

    return NextResponse.json({
      correct: true,
      xpEarned: challenge.xpReward,
      signature: result.signature,
      alreadyCompleted: false,
    });
  }

  return NextResponse.json({
    correct: false,
    alreadyCompleted: false,
  });
}
