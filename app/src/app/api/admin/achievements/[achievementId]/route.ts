import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ achievementId: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { achievementId } = await params;
  const body = await req.json();
  const { action, recipientUsername } = body;

  const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

  const { SignJWT } = await import("jose");
  const token = await new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(authSecret));

  if (action === "deactivate") {
    const response = await fetch(`${backendUrl}/admin/deactivate-achievement-type`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ achievementId }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Backend error" }));
      return NextResponse.json({ error: err.error }, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);
  }

  if (action === "award") {
    if (!recipientUsername) {
      return NextResponse.json({ error: "Missing recipientUsername" }, { status: 400 });
    }

    const db = getAdminClient();
    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const username = recipientUsername.replace(/^@/, "");
    const { data: profile } = await db
      .from("profiles")
      .select("wallet_address")
      .eq("username", username)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!profile.wallet_address) {
      return NextResponse.json({ error: "User has no wallet linked" }, { status: 400 });
    }

    const response = await fetch(`${backendUrl}/award-achievement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ achievementId, recipientWallet: profile.wallet_address }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Backend error" }));
      return NextResponse.json({ error: err.error }, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
