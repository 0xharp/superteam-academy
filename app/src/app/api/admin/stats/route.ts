import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { getXPMintSupply } from "@/lib/solana/on-chain";
import { getCourseCards } from "@/lib/courses";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalUsers },
    { count: newUsersLast7d },
    courseCards,
    totalXpDistributed,
    { data: activeTxRows },
  ] = await Promise.all([
    db.from("profiles").select("*", { count: "exact", head: true }),
    db.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    getCourseCards().catch(() => []),
    getXPMintSupply(),
    db
      .from("xp_transactions")
      .select("user_id")
      .gte("transaction_at", sevenDaysAgo),
  ]);

  const activeUserIds = new Set((activeTxRows ?? []).map((r) => r.user_id));

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    activeLast7d: activeUserIds.size,
    newUsersLast7d: newUsersLast7d ?? 0,
    totalXpDistributed,
    totalCourses: courseCards.length,
  });
}
