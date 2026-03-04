import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { gamificationService } from "@/services/gamification";
import { calculateLevel } from "@/types/gamification";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "stats";

  if (type === "stats") {
    const walletAddress = session.walletAddress;

    // XP is on-chain (Token-2022 ATA); streak is off-chain (Supabase)
    const [xp, streak] = await Promise.all([
      walletAddress
        ? import("@/lib/solana/on-chain").then(async ({ getXPBalance }) => {
            const { PublicKey } = await import("@solana/web3.js");
            return getXPBalance(new PublicKey(walletAddress)).catch(() => 0);
          })
        : Promise.resolve(0),
      gamificationService.getStreak(session.user.id),
    ]);

    const level = calculateLevel(xp).level;

    return NextResponse.json({ xp, level, streak });
  }

  if (type === "achievements") {
    const walletParam = req.nextUrl.searchParams.get("wallet");
    const walletAddress = walletParam || session.walletAddress || undefined;
    const achievements = await gamificationService.getAchievements(
      session.user.id,
      walletAddress,
    );
    return NextResponse.json(achievements);
  }

  if (type === "eligible") {
    const { getAchievementChecker } = await import("@/services/achievement-checker");
    const checker = getAchievementChecker();
    const eligible = await checker.checkEligibility(session.user.id, session.walletAddress ?? undefined);
    return NextResponse.json(eligible);
  }

  if (type === "history") {
    const limit = parseInt(
      req.nextUrl.searchParams.get("limit") ?? "20",
      10,
    );
    const [history, titleMap] = await Promise.all([
      gamificationService.getXPHistory(session.user.id, limit),
      import("@/lib/courses").then(({ getCourseTitleMap }) => getCourseTitleMap()),
    ]);

    // Build achievement name map from on-chain data
    let achievementNameMap = new Map<string, string>();
    try {
      const { program } = await import("@/lib/solana/program");
      const achAccounts = await program.account.achievementType.all();
      for (const a of achAccounts) {
        achievementNameMap.set(a.account.achievementId, a.account.name);
      }
    } catch { /* fallback: no names */ }

    const enriched = history.map((tx) => ({
      ...tx,
      courseName: tx.courseId ? titleMap[tx.courseId] : undefined,
      achievementName: tx.achievementId
        ? achievementNameMap.get(tx.achievementId)
        : undefined,
    }));

    return NextResponse.json(enriched);
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.type === "claim-achievement") {
    const { achievementId } = body;
    if (typeof achievementId !== "string") {
      return NextResponse.json({ error: "Missing achievementId" }, { status: 400 });
    }

    const walletAddress = session.walletAddress;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet required to claim achievements on-chain" },
        { status: 400 },
      );
    }

    // Check eligibility — bug-hunter is admin-only, skip check
    if (achievementId !== "bug-hunter") {
      const { getAchievementChecker } = await import("@/services/achievement-checker");
      const checker = getAchievementChecker();
      const eligible = await checker.checkEligibility(session.user.id, walletAddress);

      if (!eligible.includes(achievementId)) {
        return NextResponse.json(
          { error: "Not eligible for this achievement" },
          { status: 400 },
        );
      }
    }

    const result = await gamificationService.claimAchievement(
      session.user.id,
      achievementId,
      walletAddress,
    );

    if (result && "success" in result) {
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      await gamificationService.recordActivity(session.user.id).catch(() => {});
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
