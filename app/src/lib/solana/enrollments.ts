import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { program, PROGRAM_ID } from "./program";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OnChainEnrollment {
  courseId: string;
  coursePda: PublicKey;
  enrolledAt: number; // unix ms
  completedAt: number | null; // unix ms
  progressPct: number;
  lessonFlags: BN[]; // [u64; 4] bitmap
  credentialAsset: PublicKey | null;
}

// ---------------------------------------------------------------------------
// PDA helper — single canonical derivation used everywhere
// ---------------------------------------------------------------------------

export function getCoursePDA(courseId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("course"), Buffer.from(courseId)],
    PROGRAM_ID,
  );
  return pda;
}

export function getEnrollmentPDA(courseId: string, learner: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("enrollment"), Buffer.from(courseId), learner.toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

type RawEnrollment = Awaited<ReturnType<typeof program.account.enrollment.fetch>>;

/** Fetch a single enrollment. Returns null if the account does not exist. */
export async function fetchEnrollment(
  courseId: string,
  learner: PublicKey,
  totalLessons: number,
): Promise<OnChainEnrollment | null> {
  try {
    const pda = getEnrollmentPDA(courseId, learner);
    const raw = await program.account.enrollment.fetchNullable(pda);
    if (!raw) return null;
    return decode(courseId, raw, totalLessons);
  } catch {
    return null;
  }
}

/**
 * Batch-fetch enrollments for many courses in one RPC call.
 * Courses with no on-chain enrollment are omitted from the result.
 */
export async function fetchEnrollments(
  courses: { courseId: string; totalLessons: number }[],
  learner: PublicKey,
): Promise<OnChainEnrollment[]> {
  if (!courses.length) return [];
  try {
    const pdas = courses.map((c) => getEnrollmentPDA(c.courseId, learner));
    const accounts = await program.account.enrollment.fetchMultiple(pdas);
    return accounts.flatMap((raw, i) =>
      raw ? [decode(courses[i].courseId, raw, courses[i].totalLessons)] : [],
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal decoder
// ---------------------------------------------------------------------------

function decode(
  courseId: string,
  raw: RawEnrollment,
  totalLessons: number,
): OnChainEnrollment {
  const flags = raw.lessonFlags as BN[];
  const completedCount = flags.reduce((sum, f) => sum + popcount(f), 0);
  const progressPct =
    totalLessons > 0 ? Math.min(100, (completedCount / totalLessons) * 100) : 0;

  return {
    courseId,
    coursePda: raw.course as PublicKey,
    // i64 timestamp (seconds) → JS ms
    enrolledAt: (raw.enrolledAt as BN).toNumber() * 1000,
    completedAt: raw.completedAt
      ? (raw.completedAt as BN).toNumber() * 1000
      : null,
    progressPct,
    lessonFlags: flags,
    credentialAsset: (raw.credentialAsset as PublicKey | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Credential-based completed courseIds (DAS)
// ---------------------------------------------------------------------------

/**
 * Fetch courseIds that were completed and credentialed, by reading credential
 * NFTs from Helius DAS. Server-safe — no /api calls.
 */
export async function fetchCredentialCompletedCourseIds(
  walletAddress: string,
): Promise<Set<string>> {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!rpcUrl) return new Set();

  try {
    const { trackService } = await import("@/services/tracks");
    const tracks = await trackService.getTracks();
    const knownCollections = new Set(
      tracks.map((t) => t.collectionAddress).filter(Boolean) as string[],
    );

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "credential-course-ids",
        method: "getAssetsByOwner",
        params: { ownerAddress: walletAddress, page: 1, limit: 100 },
      }),
    });

    const json = await response.json();
    const items = json?.result?.items ?? [];
    const courseIds = new Set<string>();

    for (const item of items) {
      // Filter by known collection
      const grouping = item.grouping as
        | Array<{ group_key: string; group_value: string }>
        | undefined;
      if (knownCollections.size > 0) {
        const collectionGroup = grouping?.find(
          (g: { group_key: string }) => g.group_key === "collection",
        );
        if (!collectionGroup || !knownCollections.has(collectionGroup.group_value))
          continue;
      }

      // Extract completed_course_ids attribute
      const content = item.content as Record<string, unknown> | undefined;
      if (!content) continue;

      const metadata = content.metadata as Record<string, unknown> | undefined;
      const jsonAttrs =
        (metadata?.attributes as Array<{ trait_type: string; value: string }>) ?? [];
      const plugins = item.plugins as Record<string, unknown> | undefined;
      const pluginAttrList = (
        plugins?.attributes as {
          data?: { attribute_list?: Array<{ key: string; value: string }> };
        }
      )?.data?.attribute_list ?? [];
      const attributes =
        jsonAttrs.length > 0
          ? jsonAttrs
          : pluginAttrList.map((a) => ({ trait_type: a.key, value: a.value }));

      const completedAttr = attributes.find(
        (a) => a.trait_type === "completed_course_ids",
      );
      let ids: string[] = [];
      if (completedAttr) {
        ids = completedAttr.value.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        const jsonUri = content.json_uri as string | undefined;
        if (jsonUri) {
          try {
            const param = new URL(jsonUri).searchParams.get("completedCourseIds");
            if (param) ids = param.split(",").map((s) => s.trim()).filter(Boolean);
          } catch { /* invalid URI */ }
        }
      }

      for (const id of ids) courseIds.add(id);
    }

    return courseIds;
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function popcount(n: BN): number {
  let count = 0;
  let v = n.clone();
  while (!v.isZero()) {
    if (v.isOdd()) count++;
    v = v.shrn(1);
  }
  return count;
}
