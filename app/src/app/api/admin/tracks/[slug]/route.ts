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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { slug } = await params;
  const body = await req.json();

  // Find track by slug
  const track = await sanityClient.fetch(
    `*[_type == "track" && slug.current == $slug][0]{ _id }`,
    { slug },
  );

  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const patch = sanityClient.patch(track._id);

  if (body.name) patch.set({ name: body.name });
  if (body.description !== undefined) patch.set({ description: body.description });
  if (body.color) patch.set({ color: body.color });
  if (body.collectionAddress) patch.set({ collectionAddress: body.collectionAddress });

  await patch.commit();

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
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

  await sanityClient.delete(track._id);
  return NextResponse.json({ success: true });
}
