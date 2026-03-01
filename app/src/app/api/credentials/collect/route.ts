import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SignJWT } from "jose";

const BACKEND_URL = process.env.BACKEND_URL;
const AUTH_SECRET = process.env.AUTH_SECRET || "";

async function makeJwt(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(AUTH_SECRET);
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
}

/**
 * POST /api/credentials/collect
 *
 * Orchestrates credential collection:
 * 1. Verifies session + wallet
 * 2. Fetches enrollment PDA to check finalized + credential_asset
 * 3. Computes track stats via backend
 * 4. Builds metadata URI via backend
 * 5. Calls issue-credential or upgrade-credential on backend
 * 6. Returns { credentialAsset, signature, trackName, imageUrl }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BACKEND_URL) {
    return NextResponse.json(
      { error: "Backend not configured" },
      { status: 503 },
    );
  }

  const walletAddress = session.walletAddress;
  if (!walletAddress) {
    return NextResponse.json(
      { error: "No wallet linked to your account" },
      { status: 400 },
    );
  }

  const { courseId } = await req.json();
  if (!courseId) {
    return NextResponse.json(
      { error: "courseId required" },
      { status: 400 },
    );
  }

  const token = await makeJwt(session.user.id);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Step 1: Fetch enrollment to check finalized + credential_asset
  // We use the Solana program to read on-chain data
  let enrollmentData: {
    completedAt: string | null;
    credentialAsset: string | null;
    trackId: number;
    trackLevel: number;
  };

  try {
    const { program } = await import("@/lib/solana/program");
    const { PublicKey } = await import("@solana/web3.js");
    const { getCoursePDA, getEnrollmentPDA } = await import(
      "@/lib/solana/enrollments"
    );

    const coursePDA = getCoursePDA(courseId);
    const learner = new PublicKey(walletAddress);
    const enrollmentPDA = getEnrollmentPDA(courseId, learner);

    const [courseAccount, enrollmentAccount] = await Promise.all([
      program.account.course.fetch(coursePDA),
      program.account.enrollment.fetch(enrollmentPDA),
    ]);

    const credAsset = enrollmentAccount.credentialAsset as {
      toBase58?: () => string;
    } | null;

    enrollmentData = {
      completedAt: enrollmentAccount.completedAt
        ? new Date(
            (enrollmentAccount.completedAt as { toNumber: () => number }).toNumber() * 1000,
          ).toISOString()
        : null,
      credentialAsset:
        credAsset &&
        credAsset.toBase58 &&
        credAsset.toBase58() !==
          "11111111111111111111111111111111"
          ? credAsset.toBase58()
          : null,
      trackId: courseAccount.trackId as number,
      trackLevel: (courseAccount.trackLevel as number) ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch enrollment: ${message}` },
      { status: 400 },
    );
  }

  if (!enrollmentData.completedAt) {
    return NextResponse.json(
      { error: "Course not finalized yet. Complete all lessons first." },
      { status: 400 },
    );
  }

  // Step 2: Get track stats from current enrollment PDAs
  let trackStats: { coursesCompleted: number; totalXp: number };
  try {
    const statsRes = await fetch(
      `${BACKEND_URL}/track-stats?learner=${walletAddress}&trackId=${enrollmentData.trackId}`,
      { headers },
    );
    if (!statsRes.ok) {
      throw new Error(await statsRes.text());
    }
    trackStats = await statsRes.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to get track stats: ${message}` },
      { status: 500 },
    );
  }

  // Step 2b: Query DAS for existing credential in this track's collection.
  // This fixes duplicate NFTs: the enrollment PDA only stores credentialAsset
  // for the course that issued it, but a 2nd course in the same track has a
  // different enrollment PDA with credentialAsset = null.
  let existingCredentialAsset: string | null = enrollmentData.credentialAsset;
  let existingCompletedCourseIds: string[] = [];
  let existingLevel = 0;

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!existingCredentialAsset && rpcUrl) {
    try {
      const { getTracks } = await import("@/lib/courses");
      const tracks = await getTracks();
      const track = tracks.find((t) => t.trackId === enrollmentData.trackId);
      const collectionAddress = track?.collectionAddress;

      if (collectionAddress) {
        const dasRes = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "get-owner-assets",
            method: "getAssetsByOwner",
            params: { ownerAddress: walletAddress, page: 1, limit: 100 },
          }),
        });
        const dasJson = await dasRes.json();
        const items = (dasJson?.result?.items ?? []) as Array<Record<string, unknown>>;

        for (const item of items) {
          const grouping = item.grouping as Array<{ group_key: string; group_value: string }> | undefined;
          const collGroup = grouping?.find(
            (g) => g.group_key === "collection" && g.group_value === collectionAddress,
          );
          if (collGroup) {
            existingCredentialAsset = item.id as string;
            // Read existing attributes — try JSON metadata first, fallback to on-chain plugins
            const content = item.content as Record<string, unknown> | undefined;
            const metadata = content?.metadata as Record<string, unknown> | undefined;
            const jsonAttrs = (metadata?.attributes as Array<{ trait_type: string; value: string }>) ?? [];
            const plugins = item.plugins as Record<string, unknown> | undefined;
            const pluginAttrList = (plugins?.attributes as { data?: { attribute_list?: Array<{ key: string; value: string }> } })?.data?.attribute_list ?? [];
            // Normalize to trait_type/value format
            const attrs = jsonAttrs.length > 0 ? jsonAttrs : pluginAttrList.map((a) => ({ trait_type: a.key, value: a.value }));
            const idsAttr = attrs.find((a) => a.trait_type === "completed_course_ids");
            if (idsAttr) {
              existingCompletedCourseIds = idsAttr.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            }
            const levelAttr = attrs.find((a) => a.trait_type === "level");
            if (levelAttr) existingLevel = parseInt(levelAttr.value, 10) || 0;
            break;
          }
        }
      }
    } catch {
      // Non-fatal — fall through to issue path
    }
  }

  // If upgrading, read existing credential attributes for max-merge
  if (existingCredentialAsset && rpcUrl) {
    try {
      const dasRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-cred",
          method: "getAsset",
          params: { id: existingCredentialAsset },
        }),
      });
      const dasJson = await dasRes.json();
      const asset = dasJson?.result;
      if (asset) {
        // Try JSON metadata first, fallback to on-chain plugins
        const content = asset.content as Record<string, unknown> | undefined;
        const metadata = content?.metadata as Record<string, unknown> | undefined;
        const jsonAttrs = (metadata?.attributes as Array<{ trait_type: string; value: string }>) ?? [];
        const plugins = asset.plugins as Record<string, unknown> | undefined;
        const pluginAttrList = (plugins?.attributes as { data?: { attribute_list?: Array<{ key: string; value: string }> } })?.data?.attribute_list ?? [];
        const attrs = jsonAttrs.length > 0 ? jsonAttrs : pluginAttrList.map((a: { key: string; value: string }) => ({ trait_type: a.key, value: a.value }));
        const existingCompleted = parseInt(
          attrs.find((a) => a.trait_type === "courses_completed")?.value ?? "0",
          10,
        );
        const existingXp = parseInt(
          attrs.find((a) => a.trait_type === "total_xp")?.value ?? "0",
          10,
        );
        trackStats.coursesCompleted = Math.max(trackStats.coursesCompleted, existingCompleted);
        trackStats.totalXp = Math.max(trackStats.totalXp, existingXp);
        const levelAttr = attrs.find((a) => a.trait_type === "level");
        if (levelAttr) existingLevel = Math.max(existingLevel, parseInt(levelAttr.value, 10) || 0);

        if (existingCompletedCourseIds.length === 0) {
          const idsAttr = attrs.find((a) => a.trait_type === "completed_course_ids");
          if (idsAttr) {
            existingCompletedCourseIds = idsAttr.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }
      }
    } catch {
      // Non-fatal — use PDA-derived stats as fallback
    }
  }

  // Build completedCourseIds — merge existing with current courseId
  const completedCourseIds = [...new Set([...existingCompletedCourseIds, courseId])];

  // Step 3: Build metadata URI
  // For new credentials: use course's track_level
  // For upgrades: max(existing credential level, course's track_level) — level should only go up
  const isUpgrade = !!existingCredentialAsset;
  const level = isUpgrade
    ? Math.max(existingLevel, enrollmentData.trackLevel)
    : enrollmentData.trackLevel;

  // For upgrades, find the courseId whose enrollment holds the credential_asset.
  // The current course's enrollment may have credential_asset = None if the
  // credential was originally issued on a different course in the same track.
  let upgradeCourseId = courseId;
  if (isUpgrade && !enrollmentData.credentialAsset) {
    try {
      const { program: prog } = await import("@/lib/solana/program");
      const { PublicKey } = await import("@solana/web3.js");
      const { getEnrollmentPDA: getEnrPDA } = await import("@/lib/solana/enrollments");

      const allCourses = await prog.account.course.all();
      const trackCourses = allCourses.filter(
        (c) => (c.account.trackId as number) === enrollmentData.trackId,
      );

      const learner = new PublicKey(walletAddress);
      for (const tc of trackCourses) {
        const tcCourseId = tc.account.courseId as string;
        if (tcCourseId === courseId) continue;
        const enrPDA = getEnrPDA(tcCourseId, learner);
        const enr = await prog.account.enrollment.fetchNullable(enrPDA);
        if (!enr) continue;
        const asset = enr.credentialAsset as { toBase58?: () => string } | null;
        if (asset?.toBase58 && asset.toBase58() === existingCredentialAsset) {
          upgradeCourseId = tcCourseId;
          break;
        }
      }
    } catch {
      // Fall through — use original courseId
    }
  }

  // Fetch track name for metadata
  let trackName = `Track ${enrollmentData.trackId}`;
  try {
    const { getTracks } = await import("@/lib/courses");
    const tracks = await getTracks();
    const track = tracks.find((t) => t.trackId === enrollmentData.trackId);
    if (track) trackName = track.name;
  } catch {
    // Use default name
  }

  const metadataUri = `${BACKEND_URL}/credential-metadata?trackId=${enrollmentData.trackId}&trackName=${encodeURIComponent(trackName)}&level=${level}&coursesCompleted=${trackStats.coursesCompleted}&totalXp=${trackStats.totalXp}&completedCourseIds=${encodeURIComponent(completedCourseIds.join(","))}`;

  // Step 4: Issue or upgrade credential
  const credentialName = `${trackName} Credential`;

  let result: { signature: string; credentialAsset: string };

  if (isUpgrade) {
    // Upgrade existing credential
    const res = await fetch(`${BACKEND_URL}/upgrade-credential`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        courseId: upgradeCourseId,
        learnerWallet: walletAddress,
        credentialAsset: existingCredentialAsset,
        credentialName,
        metadataUri,
        coursesCompleted: trackStats.coursesCompleted,
        totalXp: trackStats.totalXp,
        completedCourseIds: completedCourseIds.join(","),
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: `Upgrade credential failed: ${(errData as { error?: string }).error || res.statusText}`,
        },
        { status: 500 },
      );
    }

    result = await res.json();
  } else {
    // Issue new credential
    const res = await fetch(`${BACKEND_URL}/issue-credential`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        courseId,
        learnerWallet: walletAddress,
        credentialName,
        metadataUri,
        coursesCompleted: trackStats.coursesCompleted,
        totalXp: trackStats.totalXp,
        completedCourseIds: completedCourseIds.join(","),
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        {
          error: `Issue credential failed: ${(errData as { error?: string }).error || res.statusText}`,
        },
        { status: 500 },
      );
    }

    result = await res.json();
  }

  return NextResponse.json({
    credentialAsset: result.credentialAsset,
    signature: result.signature,
    trackName,
    trackId: enrollmentData.trackId,
    level,
    coursesCompleted: trackStats.coursesCompleted,
    totalXp: trackStats.totalXp,
    isUpgrade,
    imageUrl: "/images/credentials/sample.png",
  });
}
