import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/auth-guard";
import { createClient } from "@sanity/client";
import { SignJWT } from "jose";
import { SUBMISSION_STATUS, COURSE_ACTIONS, type CourseAction } from "@/types/course";

const sanityWriteClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "placeholder",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2026-02-15",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";

async function backendPost(path: string, body: Record<string, unknown>) {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) throw new Error("AUTH_SECRET not configured");
  const secret = new TextEncoder().encode(authSecret);
  const token = await new SignJWT({ sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
  return fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { courseId } = await params;
  const body = await req.json();
  const { action } = body as {
    action: CourseAction;
    reviewComment?: string;
    xpPerLesson?: number;
    creatorRewardXp?: number;
    minCompletionsForReward?: number;
  };

  const validActions: string[] = Object.values(COURSE_ACTIONS);
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const course = await sanityWriteClient.fetch(
    `*[_type == "course" && courseId.current == $courseId][0]{
      ...,
      "actualLessonCount": count(modules[]->lessons[])
    }`,
    { courseId },
  );

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  if (action === COURSE_ACTIONS.APPROVE) {
    // Admin can override these three params; rest must exist in Sanity
    const xpPerLesson = body.xpPerLesson ?? course.xpPerLesson;
    const creatorRewardXp = body.creatorRewardXp ?? course.creatorRewardXp;
    const minCompletionsForReward = body.minCompletionsForReward ?? course.minCompletionsForReward;

    // Validate all mandatory on-chain fields exist
    const missing: string[] = [];
    if (!course.creator) missing.push("creator (Creator Wallet)");
    if (!course.lessonCount) missing.push("lessonCount (Lesson Count)");
    if (!course.difficulty) missing.push("difficulty");
    if (!xpPerLesson) missing.push("xpPerLesson (XP Per Lesson)");
    if (course.trackId == null) missing.push("trackId (Track ID)");
    if (!course.trackLevel) missing.push("trackLevel (Track Level)");
    if (!creatorRewardXp) missing.push("creatorRewardXp (Creator Reward XP)");
    if (!minCompletionsForReward) missing.push("minCompletionsForReward (Min Completions)");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Cannot approve: missing required fields in Sanity — ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    // Validate lessonCount matches actual linked lessons
    const actualLessonCount = course.actualLessonCount ?? 0;
    if (course.lessonCount !== actualLessonCount) {
      return NextResponse.json(
        {
          error: `Lesson count mismatch: lessonCount field is ${course.lessonCount} but course has ${actualLessonCount} linked lessons. Fix in Sanity before approving.`,
        },
        { status: 400 },
      );
    }

    const difficultyMap: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };
    const difficulty = difficultyMap[course.difficulty];
    if (!difficulty) {
      return NextResponse.json(
        { error: `Invalid difficulty value: "${course.difficulty}". Must be beginner, intermediate, or advanced.` },
        { status: 400 },
      );
    }

    const onChainParams = {
      courseId: course.courseId?.current ?? courseId,
      creator: course.creator,
      lessonCount: course.lessonCount,
      difficulty,
      xpPerLesson,
      trackId: course.trackId,
      trackLevel: course.trackLevel,
      prerequisiteCourseId: course.prerequisiteCourseId ?? null,
      creatorRewardXp,
      minCompletionsForReward,
      contentTxId: course._id, // Placeholder — will be Arweave tx ID in production
    };

    let txSignature: string | undefined;
    try {
      const res = await backendPost("/create-course", onChainParams);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Backend error" }));
        return NextResponse.json(
          { error: `On-chain registration failed: ${err.error}` },
          { status: 502 },
        );
      }

      const result = await res.json();
      txSignature = result.signature;
    } catch (err) {
      return NextResponse.json(
        { error: `Backend unreachable: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 502 },
      );
    }

    // Update Sanity: approved + published, save final params
    await sanityWriteClient
      .patch(course._id)
      .set({
        submissionStatus: SUBMISSION_STATUS.APPROVED,
        published: true,
        reviewComment: "",
        xpPerLesson,
        creatorRewardXp,
        minCompletionsForReward,
      })
      .commit();

    return NextResponse.json({ success: true, txSignature });
  }

  if (action === COURSE_ACTIONS.REJECT) {
    await sanityWriteClient
      .patch(course._id)
      .set({
        submissionStatus: SUBMISSION_STATUS.REJECTED,
        published: false,
        reviewComment: body.reviewComment ?? "",
      })
      .commit();

    return NextResponse.json({ success: true });
  }

  if (action === COURSE_ACTIONS.DEACTIVATE) {
    // Deactivate on-chain
    try {
      await backendPost("/update-course", {
        courseId: course.courseId?.current ?? courseId,
        newIsActive: false,
      });
    } catch {
      // Non-fatal: course may not be on-chain yet
    }

    await sanityWriteClient
      .patch(course._id)
      .set({ submissionStatus: SUBMISSION_STATUS.DEACTIVATED, published: false })
      .commit();

    return NextResponse.json({ success: true });
  }

  if (action === COURSE_ACTIONS.UPDATE) {
    const sanityUpdates: Record<string, unknown> = {};
    if (body.xpPerLesson !== undefined) sanityUpdates.xpPerLesson = body.xpPerLesson;
    if (body.creatorRewardXp !== undefined) sanityUpdates.creatorRewardXp = body.creatorRewardXp;
    if (body.minCompletionsForReward !== undefined) sanityUpdates.minCompletionsForReward = body.minCompletionsForReward;

    if (Object.keys(sanityUpdates).length > 0) {
      // Update Sanity
      await sanityWriteClient.patch(course._id).set(sanityUpdates).commit();

      // Also update on-chain if course is approved
      if (course.submissionStatus === SUBMISSION_STATUS.APPROVED) {
        try {
          await backendPost("/update-course", {
            courseId: course.courseId?.current ?? courseId,
            newXpPerLesson: body.xpPerLesson,
            newCreatorRewardXp: body.creatorRewardXp,
            newMinCompletionsForReward: body.minCompletionsForReward,
          });
        } catch {
          // Non-fatal
        }
      }
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
