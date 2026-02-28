import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { createClient } from "@sanity/client";
import { SignJWT } from "jose";

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "placeholder",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2026-02-15",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

const BACKEND_URL = process.env.BACKEND_URL;
const AUTH_SECRET = process.env.AUTH_SECRET || "";

async function makeJwt(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(AUTH_SECRET);
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

/**
 * POST /api/admin/tracks/[slug]/collection
 *
 * Creates a Metaplex Core collection for the track on-chain,
 * then stores the collectionAddress in Sanity.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  if (!BACKEND_URL) {
    return NextResponse.json(
      { error: "Backend not configured" },
      { status: 503 },
    );
  }

  const { slug } = await params;

  // Fetch track from Sanity
  const track = await sanityClient.fetch(
    `*[_type == "track" && slug.current == $slug][0]{ _id, name, "slug": slug.current, collectionAddress }`,
    { slug },
  );

  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  if (track.collectionAddress) {
    return NextResponse.json(
      { error: "Collection already exists", collectionAddress: track.collectionAddress },
      { status: 409 },
    );
  }

  // Call backend to create collection
  const token = await makeJwt(session.user.id);
  const res = await fetch(`${BACKEND_URL}/admin/create-track-collection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      trackName: track.name,
      trackSlug: track.slug,
    }),
  });

  const data = await res.json();

  if (data.collectionPublicKey) {
    // Store in Sanity even if it needs manual collection creation
    await sanityClient
      .patch(track._id)
      .set({ collectionAddress: data.collectionPublicKey })
      .commit();
  }

  return NextResponse.json(data, { status: res.status });
}
