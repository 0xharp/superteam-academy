import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const [{ data: profile }, { data: accounts }, { data: stats }] = await Promise.all([
    db.from("profiles").select("*").eq("id", id).single(),
    db.from("linked_accounts").select("provider, provider_account_id, created_at").eq("user_id", id),
    db.from("user_stats").select("*").eq("user_id", id).single(),
  ]);

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...profile,
    linkedAccounts: accounts ?? [],
    stats: stats ?? null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const db = getAdminClient();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.is_admin === "boolean") {
    updates.is_admin = body.is_admin;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error: dbError } = await db.from("profiles").update(updates).eq("id", id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
