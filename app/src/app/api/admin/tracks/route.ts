import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { createClient } from "@sanity/client";

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "placeholder",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2026-02-15",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const tracks = await sanityClient.fetch(
    `*[_type == "track"] | order(trackId asc) {
      _id,
      name,
      "slug": slug.current,
      description,
      color,
      trackId,
      collectionAddress,
      "courseCount": count(*[_type == "course" && track._ref == ^._id && published == true])
    }`,
  );

  return NextResponse.json(tracks);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { name, slug, description, color, trackId } = body;

  if (!name || !slug) {
    return NextResponse.json(
      { error: "name and slug are required" },
      { status: 400 },
    );
  }

  // Auto-increment trackId if not provided, or check for duplicates
  let resolvedTrackId = trackId;
  const existingTracks = await sanityClient.fetch(
    `*[_type == "track"] | order(trackId desc) { trackId }`,
  );
  if (resolvedTrackId == null) {
    resolvedTrackId =
      existingTracks.length > 0
        ? Math.max(...existingTracks.map((t: { trackId: number }) => t.trackId)) + 1
        : 1;
  } else {
    const duplicate = existingTracks.find(
      (t: { trackId: number }) => t.trackId === resolvedTrackId,
    );
    if (duplicate) {
      return NextResponse.json(
        { error: `Track ID ${resolvedTrackId} already exists` },
        { status: 409 },
      );
    }
  }

  const doc = await sanityClient.create({
    _type: "track",
    name,
    slug: { _type: "slug", current: slug },
    description: description || "",
    color: color || "#888",
    trackId: resolvedTrackId,
  });

  return NextResponse.json({
    _id: doc._id,
    name,
    slug,
    description: description || "",
    color: color || "#888",
    trackId: resolvedTrackId,
  });
}
