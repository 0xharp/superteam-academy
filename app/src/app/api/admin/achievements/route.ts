import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

  // Build admin JWT
  const { SignJWT } = await import("jose");
  const token = await new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(authSecret));

  // Fetch all achievement types from on-chain via program
  try {
    const { program } = await import("@/lib/solana/program");
    const accounts = await program.account.achievementType.all();
    const achievements = accounts.map((a) => ({
      publicKey: a.publicKey.toBase58(),
      achievementId: a.account.achievementId,
      name: a.account.name,
      metadataUri: a.account.metadataUri,
      collection: a.account.collection.toBase58(),
      creator: a.account.creator.toBase58(),
      maxSupply: a.account.maxSupply,
      currentSupply: a.account.currentSupply,
      xpReward: a.account.xpReward,
      isActive: a.account.isActive,
      createdAt: a.account.createdAt.toNumber(),
    }));
    return NextResponse.json(achievements);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch achievements";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { achievementId, name, metadataUri, maxSupply, xpReward } = body;

  if (!achievementId || !name || !metadataUri || !xpReward) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";

  const { SignJWT } = await import("jose");
  const token = await new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(authSecret));

  const response = await fetch(`${backendUrl}/admin/create-achievement-type`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ achievementId, name, metadataUri, maxSupply: maxSupply ?? 0, xpReward }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Backend error" }));
    return NextResponse.json({ error: err.error }, { status: response.status });
  }

  const result = await response.json();
  return NextResponse.json(result);
}
