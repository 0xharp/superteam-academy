import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/auth-guard";
import { createClient } from "@sanity/client";

const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "placeholder",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2026-02-15",
  useCdn: false,
});

export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const walletAddress = session.walletAddress;
  if (!walletAddress) {
    return NextResponse.json({ error: "No wallet linked" }, { status: 400 });
  }

  const courses = await sanityClient.fetch(
    `*[_type == "course" && creator == $wallet] | order(_createdAt desc) {
      _id,
      title,
      "courseId": courseId.current,
      description,
      difficulty,
      published,
      submissionStatus,
      reviewComment,
      xpPerLesson,
      lessonCount,
      _createdAt,
      _updatedAt
    }`,
    { wallet: walletAddress },
  );

  return NextResponse.json({ courses });
}
