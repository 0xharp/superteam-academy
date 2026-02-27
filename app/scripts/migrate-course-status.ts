/**
 * One-time migration: set submissionStatus="approved" on all existing published courses.
 *
 * These courses were registered on-chain via script before the submissionStatus field existed.
 * After running, all published courses will show as "Approved & Published" in the admin dashboard.
 * Unpublished courses will remain without submissionStatus (= "Waiting For Approval").
 *
 * Also cleans up the old `status` field if it exists.
 *
 * Usage:
 *   cd app && pnpm tsx scripts/migrate-course-status.ts
 *
 * Requires:
 *   NEXT_PUBLIC_SANITY_PROJECT_ID and SANITY_API_TOKEN in app/.env.local
 */

import { createClient } from "@sanity/client";
import * as dotenv from "dotenv";
import * as path from "path";

// Inline constant to avoid TSConfig path alias issues in standalone script
const SUBMISSION_STATUS_APPROVED = "approved";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2026-02-15",
  token,
  useCdn: false,
});

async function migrate() {
  const courses = await client.fetch(
    `*[_type == "course"] { _id, title, published, "courseId": courseId.current, submissionStatus, status }`
  );

  console.log(`Found ${courses.length} total courses.\n`);

  let updated = 0;
  for (const course of courses) {
    const patch = client.patch(course._id);
    let changed = false;

    // Set submissionStatus for published courses that don't have it yet
    if (course.published && course.submissionStatus !== SUBMISSION_STATUS_APPROVED) {
      patch.set({ submissionStatus: SUBMISSION_STATUS_APPROVED });
      console.log(`  ✓ "${course.title}" (${course.courseId}) → approved`);
      changed = true;
    }

    // Clean up old `status` field if it exists
    if (course.status !== undefined && course.status !== null) {
      patch.unset(["status"]);
      if (!changed) console.log(`  ✓ "${course.title}" (${course.courseId}) → cleaned old status field`);
      changed = true;
    }

    if (changed) {
      await patch.commit();
      updated++;
    }
  }

  console.log(`\nDone. ${updated} courses updated.`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
