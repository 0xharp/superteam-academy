import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createClient } from "@sanity/client";
import { requireAuth } from "@/lib/api/auth-guard";
import { slugify } from "@/lib/utils/slugify";
import { profileService } from "@/services/profile";
import type { WizardCourseForm, WizardModuleForm } from "@/types/wizard";

const sanityWriteClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "placeholder",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2026-02-15",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const walletAddress = session.walletAddress;
  if (!walletAddress) {
    return NextResponse.json({ error: "No wallet linked" }, { status: 400 });
  }

  const url = new URL(req.url);
  const isDraft = url.searchParams.get("draft") === "true";

  const body = (await req.json()) as {
    course: WizardCourseForm;
    modules: WizardModuleForm[];
  };

  const { course, modules } = body;

  // Basic validation
  if (!course.title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (!course.courseId.trim()) {
    return NextResponse.json({ error: "Course ID is required" }, { status: 400 });
  }
  if (course.courseId.length > 32) {
    return NextResponse.json({ error: "Course ID must be 32 characters or less" }, { status: 400 });
  }

  // Check courseId uniqueness (both published and drafts)
  const existing = await sanityWriteClient.fetch(
    `count(*[_type == "course" && courseId.current == $courseId])`,
    { courseId: course.courseId },
  );
  if (existing > 0) {
    return NextResponse.json({ error: "A course with this ID already exists" }, { status: 409 });
  }

  // Upsert instructor doc from creator's profile
  const instructorId = `instructor-${walletAddress}`;
  const profile = await profileService.getProfileById(session.user.id);
  if (profile) {
    const instructorDoc: Record<string, unknown> = {
      _id: instructorId,
      _type: "instructor",
      name: profile.displayName || profile.username,
    };
    if (profile.avatarUrl) {
      const res = await fetch(profile.avatarUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const asset = await sanityWriteClient.assets.upload("image", buf, {
          filename: `avatar-${walletAddress}`,
        });
        instructorDoc.avatar = { _type: "image", asset: { _type: "reference", _ref: asset._id } };
      }
    }
    if (profile.bio) instructorDoc.bio = profile.bio;
    if (profile.socialLinks?.twitter) instructorDoc.twitter = profile.socialLinks.twitter;
    if (profile.socialLinks?.github) instructorDoc.github = profile.socialLinks.github;
    await sanityWriteClient.createOrReplace(instructorDoc as { _id: string; _type: string });
  }

  const prefix = isDraft ? "drafts." : "";
  const tx = sanityWriteClient.transaction();

  // Build lesson docs
  const moduleSanityRefs: { _type: "reference"; _ref: string; _key: string }[] = [];

  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi];
    const lessonRefs: { _type: "reference"; _ref: string; _key: string }[] = [];

    for (let li = 0; li < mod.lessons.length; li++) {
      const lesson = mod.lessons[li];
      const lessonBaseId = `lesson-${nanoid(12)}`;
      const lessonDocId = `${prefix}${lessonBaseId}`;

      const lessonDoc: Record<string, unknown> = {
        _id: lessonDocId,
        _type: "lesson",
        title: lesson.title,
        slug: { _type: "slug", current: slugify(lesson.title) || `lesson-${li + 1}` },
        type: lesson.type,
        duration: lesson.duration,
        order: li + 1,
      };

      if (lesson.videoUrl) lessonDoc.videoUrl = lesson.videoUrl;
      if (lesson.markdownContent) lessonDoc.markdownContent = lesson.markdownContent;

      if (lesson.type === "challenge" && lesson.challenge) {
        lessonDoc.challenge = {
          prompt: lesson.challenge.prompt,
          language: lesson.challenge.language,
          starterCode: lesson.challenge.starterCode,
          solution: lesson.challenge.solution,
          testCases: lesson.challenge.testCases.map((tc) => ({
            _key: nanoid(8),
            label: tc.label,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            ...(tc.validator ? { validator: tc.validator } : {}),
          })),
          hints: lesson.challenge.hints.map((h) => ({ _key: nanoid(8), _type: "string", value: h })),
        };
        // Sanity array of strings uses just the string values with _key
        lessonDoc.challenge = {
          ...lessonDoc.challenge as Record<string, unknown>,
          hints: lesson.challenge.hints.length > 0
            ? lesson.challenge.hints
            : undefined,
        };
      }

      tx.create(lessonDoc as { _id: string; _type: string; [key: string]: unknown });
      lessonRefs.push({ _type: "reference", _ref: lessonDocId, _key: nanoid(8) });
    }

    // Build module doc
    const moduleBaseId = `module-${nanoid(12)}`;
    const moduleDocId = `${prefix}${moduleBaseId}`;

    tx.create({
      _id: moduleDocId,
      _type: "module",
      title: mod.title,
      description: mod.description,
      order: mi + 1,
      lessons: lessonRefs,
    });

    moduleSanityRefs.push({ _type: "reference", _ref: moduleDocId, _key: nanoid(8) });
  }

  // Calculate lesson count
  const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);

  // Build course doc
  const courseBaseId = `course-${nanoid(12)}`;
  const courseDocId = `${prefix}${courseBaseId}`;

  const courseDoc: Record<string, unknown> = {
    _id: courseDocId,
    _type: "course",
    title: course.title,
    courseId: { _type: "slug", current: course.courseId },
    description: course.description,
    longDescription: course.longDescription,
    difficulty: course.difficulty || undefined,
    modules: moduleSanityRefs,
    tags: course.tags.length > 0 ? course.tags : undefined,
    published: false,
    creator: walletAddress,
    xpPerLesson: course.xpPerLesson,
    lessonCount: totalLessons,
    trackLevel: course.trackLevel,
    creatorRewardXp: course.creatorRewardXp,
    minCompletionsForReward: course.minCompletionsForReward,
    prerequisiteCourseId: course.prerequisiteCourseId || undefined,
    instructor: { _type: "reference", _ref: instructorId },
  };

  if (course.thumbnailAssetId) {
    courseDoc.thumbnail = {
      _type: "image",
      asset: { _type: "reference", _ref: course.thumbnailAssetId },
    };
  }

  if (course.trackId) {
    courseDoc.track = { _type: "reference", _ref: course.trackId };
  }

  if (isDraft) {
    courseDoc.submissionStatus = null;
  } else {
    courseDoc.submissionStatus = "waiting";
  }

  tx.create(courseDoc as { _id: string; _type: string; [key: string]: unknown });

  try {
    await tx.commit();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to save to Sanity: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, courseId: course.courseId, isDraft });
}
