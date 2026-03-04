import { NextResponse } from "next/server";
import { getCourseCards } from "@/lib/courses";

export async function GET() {
  const courses = await getCourseCards();
  return NextResponse.json(
    courses.map((c) => ({ courseId: c.courseId, title: c.title })),
  );
}
