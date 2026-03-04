import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { getAdminClient } from "@/lib/supabase/admin";
import { getXPBalance } from "@/lib/solana/on-chain";
import { calculateLevel } from "@/types/gamification";
import { PublicKey } from "@solana/web3.js";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "20", 10)));
  const search = params.get("search") ?? "";
  const sortBy = params.get("sortBy") ?? "created_at";
  const sortOrder = params.get("sortOrder") === "asc" ? true : false;
  const offset = (page - 1) * limit;

  let query = db
    .from("profiles")
    .select("id, display_name, username, email, avatar_url, wallet_address, is_admin, created_at", { count: "exact" });

  if (search) {
    query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%,wallet_address.ilike.%${search}%,username.ilike.%${search}%`);
  }

  const role = params.get("role");
  if (role === "admin") {
    query = query.eq("is_admin", true);
  } else if (role === "user") {
    query = query.eq("is_admin", false);
  }

  const allowedSorts = ["created_at", "display_name", "email", "username"];
  const col = allowedSorts.includes(sortBy) ? sortBy : "created_at";
  query = query.order(col, { ascending: sortOrder });
  query = query.range(offset, offset + limit - 1);

  const { data: users, count, error: dbError } = await query;

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const userIds = users?.map((u) => u.id) ?? [];
  if (!userIds.length) {
    return NextResponse.json({ users: [], total: 0, page, limit });
  }

  // Fetch streak stats, linked accounts, and on-chain XP in parallel
  const [{ data: stats }, { data: accounts }, ...xpBalances] = await Promise.all([
    db
      .from("user_stats")
      .select("user_id, current_streak")
      .in("user_id", userIds),
    db
      .from("accounts")
      .select("user_id, provider")
      .in("user_id", userIds),
    ...(users ?? []).map((u) =>
      u.wallet_address
        ? getXPBalance(new PublicKey(u.wallet_address)).catch(() => 0)
        : Promise.resolve(0),
    ),
  ]) as [{ data: { user_id: string; current_streak: number }[] | null }, { data: { user_id: string; provider: string }[] | null }, ...number[]];

  const statsMap = new Map((stats ?? []).map((s) => [s.user_id, s]));

  // Build provider set per user
  const providerMap = new Map<string, Set<string>>();
  for (const acc of accounts ?? []) {
    if (!providerMap.has(acc.user_id)) providerMap.set(acc.user_id, new Set());
    providerMap.get(acc.user_id)!.add(acc.provider);
  }

  const enriched = (users ?? []).map((u, i) => {
    const s = statsMap.get(u.id);
    const providers = providerMap.get(u.id) ?? new Set();
    const onChainXp = xpBalances[i] ?? 0;
    const level = calculateLevel(onChainXp).level;
    return {
      ...u,
      totalXp: onChainXp,
      level,
      streak: s?.current_streak ?? 0,
      hasGoogle: providers.has("google"),
      hasGithub: providers.has("github"),
    };
  });

  // Server-side sort for fields not in profiles table
  const extraSorts = ["totalXp", "level", "streak"];
  const clientSort = params.get("sortBy");
  if (clientSort && extraSorts.includes(clientSort)) {
    const key = clientSort as keyof (typeof enriched)[0];
    enriched.sort((a, b) => {
      const av = (a[key] as number) ?? 0;
      const bv = (b[key] as number) ?? 0;
      return sortOrder ? av - bv : bv - av;
    });
  }

  return NextResponse.json({
    users: enriched,
    total: count ?? 0,
    page,
    limit,
  });
}
