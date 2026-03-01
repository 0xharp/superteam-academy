import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data, error: dbError } = await db
    .from("daily_challenges")
    .select("*")
    .order("sort_order", { ascending: true });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { question, options, correct_index, xp_reward, category } = body;

  if (!question || !Array.isArray(options) || options.length < 2 || typeof correct_index !== "number") {
    return NextResponse.json({ error: "Missing required fields: question, options (array), correct_index" }, { status: 400 });
  }

  if (correct_index < 0 || correct_index >= options.length) {
    return NextResponse.json({ error: "correct_index out of range" }, { status: 400 });
  }

  // Get next sort_order
  const { data: last } = await db
    .from("daily_challenges")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (last?.sort_order ?? 0) + 1;

  const { data, error: dbError } = await db
    .from("daily_challenges")
    .insert({
      question,
      options: JSON.stringify(options),
      correct_index,
      xp_reward: xp_reward ?? 50,
      category: category || "fundamentals",
      sort_order: nextOrder,
      is_active: true,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
