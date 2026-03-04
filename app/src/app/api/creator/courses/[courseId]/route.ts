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

const FULL_COURSE_QUERY = `*[_type == "course" && courseId.current == $courseId][0]{
  _id,
  title,
  "courseId": courseId.current,
  description,
  longDescription,
  difficulty,
  "trackId": track._ref,
  tags,
  xpPerLesson,
  trackLevel,
  creator,
  creatorRewardXp,
  minCompletionsForReward,
  prerequisiteCourseId,
  submissionStatus,
  published,
  "thumbnailAssetId": thumbnail.asset._ref,
  "thumbnailUrl": thumbnail.asset->url,
  modules[]->{
    _id,
    title,
    description,
    order,
    lessons[]->{
      _id,
      title,
      "slug": slug.current,
      type,
      duration,
      order,
      videoUrl,
      markdownContent,
      challenge
    }
  }
}`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const walletAddress = session.walletAddress;
  if (!walletAddress) {
    return NextResponse.json({ error: "No wallet linked" }, { status: 400 });
  }

  const { courseId } = await params;

  // raw perspective so draft references (drafts.module-xxx) resolve correctly
  let course = await sanityWriteClient.fetch(
    FULL_COURSE_QUERY,
    { courseId },
    { perspective: "raw" },
  );
  // If no published doc found, try draft
  if (!course) {
    course = await sanityWriteClient.fetch(
      `*[_type == "course" && courseId.current == $courseId && _id in path("drafts.**")][0]{
        _id,
        title,
        "courseId": courseId.current,
        description,
        longDescription,
        difficulty,
        "trackId": track._ref,
        tags,
        xpPerLesson,
        trackLevel,
        creator,
        creatorRewardXp,
        minCompletionsForReward,
        prerequisiteCourseId,
        submissionStatus,
        published,
        "thumbnailAssetId": thumbnail.asset._ref,
        "thumbnailUrl": thumbnail.asset->url,
        modules[]->{
          _id,
          title,
          description,
          order,
          lessons[]->{
            _id,
            title,
            "slug": slug.current,
            type,
            duration,
            order,
            videoUrl,
            markdownContent,
            challenge
          }
        }
      }`,
      { courseId },
      { perspective: "raw" },
    );
  }

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  if (course.creator !== walletAddress) {
    return NextResponse.json({ error: "Not your course" }, { status: 403 });
  }

  return NextResponse.json({ course });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const walletAddress = session.walletAddress;
  if (!walletAddress) {
    return NextResponse.json({ error: "No wallet linked" }, { status: 400 });
  }

  const { courseId } = await params;
  const url = new URL(req.url);
  const isDraft = url.searchParams.get("draft") === "true";

  // Fetch existing course (raw perspective to get real _id for patching)
  const allMatches = await sanityWriteClient.fetch(
    `*[_type == "course" && courseId.current == $courseId]{ _id, creator, submissionStatus, "hasInstructor": defined(instructor), instructor }`,
    { courseId },
    { perspective: "raw" },
  );
  // Prefer draft version over published for editing
  const existing = allMatches?.find((d: { _id: string }) => d._id.startsWith("drafts."))
    ?? allMatches?.[0]
    ?? null;

  if (!existing) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (existing.creator !== walletAddress) {
    return NextResponse.json({ error: "Not your course" }, { status: 403 });
  }

  // Only allow editing drafts, waiting, or rejected courses
  const editableStatuses = [null, undefined, "waiting", "rejected"];
  if (!editableStatuses.includes(existing.submissionStatus)) {
    return NextResponse.json(
      { error: "Cannot edit a course that has been approved or deactivated" },
      { status: 400 },
    );
  }

  const body = (await req.json()) as {
    course: WizardCourseForm;
    modules: WizardModuleForm[];
  };

  const { course, modules } = body;

  // Fetch existing sub-documents to find orphans
  const existingFull = await sanityWriteClient.fetch(
    `*[_type == "course" && _id == $docId][0]{
      _id,
      modules[]->{ _id, lessons[]->{ _id } }
    }`,
    { docId: existing._id },
    { perspective: "raw" },
  );

  const existingModuleIds = new Set<string>();
  const existingLessonIds = new Set<string>();
  if (existingFull?.modules) {
    for (const mod of existingFull.modules) {
      if (mod?._id) existingModuleIds.add(mod._id);
      if (mod?.lessons) {
        for (const les of mod.lessons) {
          if (les?._id) existingLessonIds.add(les._id);
        }
      }
    }
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
      const avatarRes = await fetch(profile.avatarUrl);
      if (avatarRes.ok) {
        const buf = Buffer.from(await avatarRes.arrayBuffer());
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

  const newModuleIds = new Set<string>();
  const newLessonIds = new Set<string>();
  const moduleSanityRefs: { _type: "reference"; _ref: string; _key: string }[] = [];

  for (let mi = 0; mi < modules.length; mi++) {
    const mod = modules[mi];
    const lessonRefs: { _type: "reference"; _ref: string; _key: string }[] = [];

    for (let li = 0; li < mod.lessons.length; li++) {
      const lesson = mod.lessons[li];

      let lessonBaseId: string;
      if (lesson.sanityId) {
        lessonBaseId = lesson.sanityId.replace(/^drafts\./, "");
        newLessonIds.add(lesson.sanityId);
      } else {
        lessonBaseId = `lesson-${nanoid(12)}`;
      }
      const lessonDocId = isDraft && !lessonBaseId.startsWith("drafts.")
        ? `${prefix}${lessonBaseId}`
        : lessonBaseId;

      const lessonDoc: { _type: string; [key: string]: unknown } = {
        _type: "lesson",
        title: lesson.title,
        slug: { _type: "slug", current: slugify(lesson.title) || `lesson-${li + 1}` },
        type: lesson.type,
        duration: lesson.duration,
        order: li + 1,
        videoUrl: lesson.videoUrl || undefined,
        markdownContent: lesson.markdownContent || undefined,
      };

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
          hints: lesson.challenge.hints.length > 0 ? lesson.challenge.hints : undefined,
        };
      } else {
        lessonDoc.challenge = undefined;
      }

      if (lesson.sanityId) {
        tx.createOrReplace({ _id: lessonDocId, ...lessonDoc });
      } else {
        tx.create({ _id: lessonDocId, ...lessonDoc });
      }

      lessonRefs.push({ _type: "reference", _ref: lessonDocId, _key: nanoid(8) });
    }

    let moduleBaseId: string;
    if (mod.sanityId) {
      moduleBaseId = mod.sanityId.replace(/^drafts\./, "");
      newModuleIds.add(mod.sanityId);
    } else {
      moduleBaseId = `module-${nanoid(12)}`;
    }
    const moduleDocId = isDraft && !moduleBaseId.startsWith("drafts.")
      ? `${prefix}${moduleBaseId}`
      : moduleBaseId;

    const moduleDoc = {
      _type: "module" as const,
      title: mod.title,
      description: mod.description,
      order: mi + 1,
      lessons: lessonRefs,
    };

    if (mod.sanityId) {
      tx.createOrReplace({ _id: moduleDocId, ...moduleDoc });
    } else {
      tx.create({ _id: moduleDocId, ...moduleDoc });
    }

    moduleSanityRefs.push({ _type: "reference", _ref: moduleDocId, _key: nanoid(8) });
  }

  // Delete orphaned documents
  for (const oldId of existingLessonIds) {
    if (!newLessonIds.has(oldId)) {
      tx.delete(oldId);
    }
  }
  for (const oldId of existingModuleIds) {
    if (!newModuleIds.has(oldId)) {
      tx.delete(oldId);
    }
  }

  // Calculate lesson count
  const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);

  // Patch the course document
  const courseUpdates: Record<string, unknown> = {
    title: course.title,
    description: course.description,
    longDescription: course.longDescription,
    difficulty: course.difficulty || undefined,
    modules: moduleSanityRefs,
    tags: course.tags.length > 0 ? course.tags : [],
    xpPerLesson: course.xpPerLesson,
    lessonCount: totalLessons,
    trackLevel: course.trackLevel,
    creatorRewardXp: course.creatorRewardXp,
    minCompletionsForReward: course.minCompletionsForReward,
    prerequisiteCourseId: course.prerequisiteCourseId || undefined,
  };

  if (course.thumbnailAssetId) {
    courseUpdates.thumbnail = {
      _type: "image",
      asset: { _type: "reference", _ref: course.thumbnailAssetId },
    };
  }

  // Only set instructor if the course doesn't already have one (preserve manual assignments)
  if (!existing.hasInstructor) {
    courseUpdates.instructor = { _type: "reference", _ref: instructorId };
  }

  if (course.trackId) {
    courseUpdates.track = { _type: "reference", _ref: course.trackId };
  }

  if (!isDraft) {
    courseUpdates.submissionStatus = "waiting";
  }

  const wasDraft = existing._id.startsWith("drafts.");
  const needsPublish = !isDraft && wasDraft;

  if (needsPublish) {
    // Publish: create doc with base ID, delete old draft
    const baseId = existing._id.replace(/^drafts\./, "");
    // Carry over instructor from draft if not already in courseUpdates
    if (!courseUpdates.instructor && existing.instructor) {
      courseUpdates.instructor = existing.instructor;
    }
    tx.createOrReplace({
      _id: baseId,
      _type: "course",
      courseId: { _type: "slug", current: courseId },
      creator: walletAddress,
      published: false,
      ...courseUpdates,
    } as { _id: string; _type: string; [key: string]: unknown });
    tx.delete(existing._id);

    // Publish draft sub-documents (delete draft versions since published ones were created above)
    for (const oldId of existingModuleIds) {
      if (oldId.startsWith("drafts.")) tx.delete(oldId);
    }
    for (const oldId of existingLessonIds) {
      if (oldId.startsWith("drafts.")) tx.delete(oldId);
    }
  } else {
    tx.patch(existing._id, (p) => p.set(courseUpdates));
  }

  try {
    await tx.commit();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to save to Sanity: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, courseId, isDraft });
}
