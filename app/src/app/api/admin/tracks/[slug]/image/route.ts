import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { createClient } from "@sanity/client";
import { writeFile } from "fs/promises";
import path from "path";

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "placeholder",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2026-02-15",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

/**
 * POST /api/admin/tracks/[slug]/image
 *
 * Upload a credential image for a track.
 * Saves to public/images/credentials/<slug>.png
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { slug } = await params;

  const track = await sanityClient.fetch(
    `*[_type == "track" && slug.current == $slug][0]{ _id }`,
    { slug },
  );

  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(
    process.cwd(),
    "public",
    "images",
    "credentials",
    `${slug}.png`,
  );

  await writeFile(filePath, buffer);

  const imageUrl = `/images/credentials/${slug}.png`;

  // Update Sanity with the image URL
  await sanityClient
    .patch(track._id)
    .set({ credentialImageUrl: imageUrl })
    .commit();

  return NextResponse.json({ imageUrl });
}
