import { notFound } from "next/navigation";
import { getCourseBySlug } from "@/lib/courses";
import CourseView from "../../[slug]/course-view";

export default async function CoursePreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);

  if (!course) notFound();

  return <CourseView course={course} slug={slug} preview />;
}
