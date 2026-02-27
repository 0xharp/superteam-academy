import { notFound } from "next/navigation";
import { getLessonByIdAsync } from "@/lib/courses";
import LessonView from "../../../../[slug]/lessons/[id]/lesson-view";

export default async function PreviewLessonPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const data = await getLessonByIdAsync(slug, id);

  if (!data) notFound();

  return (
    <LessonView
      lesson={data.lesson}
      mod={data.module}
      course={data.course}
      slug={slug}
      id={id}
      preview
    />
  );
}
