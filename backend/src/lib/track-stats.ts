import { PublicKey } from "@solana/web3.js";
import { program, connection } from "./program.js";
import { getEnrollmentPDA } from "./pda.js";

interface TrackStats {
  coursesCompleted: number;
  totalXp: number;
}

/**
 * Compute track-level stats for a learner by fetching all Course accounts
 * with matching trackId and checking their enrollment status.
 */
export async function getTrackStats(
  learner: PublicKey,
  trackId: number,
): Promise<TrackStats> {
  // Fetch all Course accounts
  const allCourses = await program.account.course.all();

  // Filter to matching trackId and only active courses
  const trackCourses = allCourses.filter(
    (c: { account: { trackId: number; isActive: boolean } }) =>
      c.account.trackId === trackId && c.account.isActive,
  );

  let coursesCompleted = 0;
  let totalXp = 0;

  // Batch-fetch enrollment PDAs for this learner
  const enrollmentKeys = trackCourses.map(
    (c: { account: { courseId: string } }) => {
      const [pda] = getEnrollmentPDA(c.account.courseId, learner);
      return pda;
    },
  );

  const enrollmentAccounts =
    await connection.getMultipleAccountsInfo(enrollmentKeys);

  for (let i = 0; i < trackCourses.length; i++) {
    const accountInfo = enrollmentAccounts[i];
    if (!accountInfo) continue;

    // Decode the enrollment account
    const enrollment = program.coder.accounts.decode(
      "enrollment",
      accountInfo.data,
    );

    if (enrollment.completedAt) {
      coursesCompleted++;
      const course = trackCourses[i].account;
      const lessonXp =
        (course.xpPerLesson as number) * (course.lessonCount as number);
      const bonusXp = Math.round(lessonXp * 0.5);
      totalXp += lessonXp + bonusXp;
    }
  }

  return { coursesCompleted, totalXp };
}
