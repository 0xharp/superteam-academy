import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { program } from "@/lib/solana/program";
import { getXPMintSupply } from "@/lib/solana/on-chain";

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
    allOnChainCourses,
    totalXpDistributed,
    { data: activeTxRows },
  ] = await Promise.all([
    db.from("profiles").select("*", { count: "exact", head: true }),
    db.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    program.account.course.all(),
    getXPMintSupply(),
    db
      .from("xp_transactions")
      .select("user_id")
      .gte("transaction_at", sevenDaysAgo),
  ]);

  const activeCourses = allOnChainCourses.filter((c) => c.account.isActive);

  const activeUserIds = new Set((activeTxRows ?? []).map((r) => r.user_id));

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    activeLast7d: activeUserIds.size,
    newUsersLast7d: newUsersLast7d ?? 0,
    totalXpDistributed,
    totalCourses: activeCourses.length,
  });
}
