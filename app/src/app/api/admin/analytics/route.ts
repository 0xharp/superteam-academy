import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const now = Date.now();
  const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch 30 days of data (7-day is a subset)
  // Use transaction_at (actual on-chain XP credit time), not created_at (batch sync time)
  const [{ data: xpRows }, { data: signupRows }] = await Promise.all([
    db
      .from("xp_transactions")
      .select("amount, transaction_at")
      .gte("transaction_at", since30)
      .order("transaction_at", { ascending: true }),
    db
      .from("profiles")
      .select("created_at")
      .gte("created_at", since30)
      .order("created_at", { ascending: true }),
  ]);

  const xpAll = (xpRows ?? []).map((r) => ({ date: r.transaction_at, value: r.amount ?? 0 }));
  const signupAll = (signupRows ?? []).map((r) => ({ date: r.created_at, value: 1 }));

  return NextResponse.json({
    xp7d: aggregateByDay(xpAll.filter((r) => r.date >= since7)),
    xp30d: aggregateByDay(xpAll),
    signups7d: aggregateByDay(signupAll.filter((r) => r.date >= since7)),
    signups30d: aggregateByDay(signupAll),
  });
}

function aggregateByDay(rows: { date: string; value: number }[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    result[day] = (result[day] ?? 0) + row.value;
  }
  return result;
}
