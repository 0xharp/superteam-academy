import { NextResponse } from "next/server";
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

  // Only fetches Sanity-published documents (not Sanity drafts).
  // Courses that are still Sanity drafts won't appear here.
  const courses = await sanityClient.fetch(
    `*[_type == "course"] | order(_createdAt desc) {
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
      trackId,
      trackLevel,
      creator,
      creatorRewardXp,
      minCompletionsForReward,
      prerequisiteCourseId,
      "trackTitle": track->name,
      "instructorName": instructor->name,
      "totalLessons": count(modules[]->lessons[]),
      _createdAt,
      _updatedAt
    }`,
  );

  return NextResponse.json({ courses });
}
