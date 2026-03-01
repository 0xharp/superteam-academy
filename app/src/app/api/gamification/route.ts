import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { gamificationService } from "@/services/gamification";
import { PublicKey } from "@solana/web3.js";

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
        ? import("@/lib/solana/on-chain").then(({ getXPBalance }) =>
            getXPBalance(new PublicKey(walletAddress)).catch(() => 0),
        )
        : Promise.resolve(0),
      gamificationService.getStreak(session.user.id),
    ]);

    // Level derived from XP: floor(sqrt(xp / 100))
    const level = Math.floor(Math.sqrt(xp / 100));

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
    const eligible = await checker.checkEligibility(session.user.id);
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

    // Resolve course_pda → course name by building a PDA → courseId reverse map
    const { getCoursePDA } = await import("@/lib/solana/enrollments");
    const pdaToTitle = new Map<string, string>();
    for (const [courseId, title] of Object.entries(titleMap)) {
      try {
        const pda = getCoursePDA(courseId).toBase58();
        pdaToTitle.set(pda, title);
      } catch { /* skip invalid courseIds */ }
    }

    const enriched = history.map((tx) => ({
      ...tx,
      courseName: tx.sourceId ? (pdaToTitle.get(tx.sourceId) ?? titleMap[tx.sourceId]) : undefined,
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
    const { achievementIndex } = body;
    if (typeof achievementIndex !== "number") {
      return NextResponse.json({ error: "Missing achievementIndex" }, { status: 400 });
    }

    const walletAddress = session.walletAddress;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet required to claim achievements on-chain" },
        { status: 400 },
      );
    }

    // Check eligibility
    const { getAchievementChecker } = await import("@/services/achievement-checker");
    const checker = getAchievementChecker();
    const eligible = await checker.checkEligibility(session.user.id);

    // Bug Hunter (9) is admin-only, skip eligibility check for it
    if (achievementIndex !== 9 && !eligible.includes(achievementIndex)) {
      return NextResponse.json(
        { error: "Not eligible for this achievement" },
        { status: 400 },
      );
    }

    const result = await gamificationService.claimAchievement(
      session.user.id,
      achievementIndex,
      walletAddress,
    );

    if (result && "success" in result) {
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
