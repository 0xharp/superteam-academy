import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createHmac } from "crypto";
import { createClient } from "@sanity/client";
import { SUBMISSION_STATUS } from "@/types/course";

function isValidSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  const digest = hmac.digest("hex");
  return signature === digest;
}

const sanityWriteClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "placeholder",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2026-02-15",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

export async function POST(request: NextRequest) {
  const signature = request.headers.get("sanity-webhook-signature");
  const secret = process.env.SANITY_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.text();

  if (!isValidSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const type = body?._type as string | undefined;
  const docId = body?._id as string | undefined;

  // When a course is published in Sanity Studio, set submissionStatus to "waiting"
  // if it's a new submission (no status) or a re-submission after rejection.
  // Approved/deactivated courses are NOT reset — those are admin-controlled.
  // We fetch the current doc from Sanity because the webhook payload may not include all fields.
  if (type === "course" && docId) {
    try {
      console.log(`[webhook] Course publish event: docId=${docId}`);
      const doc = await sanityWriteClient.fetch(
        `*[_id == $id][0]{ submissionStatus }`,
        { id: docId },
      );
      console.log(`[webhook] Current submissionStatus: ${JSON.stringify(doc?.submissionStatus)}`);
      const status = doc?.submissionStatus as string | null | undefined;
      if (!status || status === SUBMISSION_STATUS.REJECTED) {
        console.log(`[webhook] Resetting to waiting`);
        await sanityWriteClient
          .patch(docId)
          .set({ submissionStatus: SUBMISSION_STATUS.WAITING, reviewComment: "" })
          .commit();
        console.log(`[webhook] Done — set to waiting`);
      } else {
        console.log(`[webhook] Skipping — status is ${status}`);
      }
    } catch (err) {
      console.error(`[webhook] Error:`, err);
    }
  }

  if (type === "course" || type === "module" || type === "lesson") {
    revalidateTag("courses", "max");
  }
  if (type === "track") {
    revalidateTag("tracks", "max");
  }
  if (type === "instructor") {
    revalidateTag("instructors", "max");
  }

  return NextResponse.json({ revalidated: true });
}
