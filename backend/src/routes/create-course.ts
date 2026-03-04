import { Hono } from "hono";
import { PublicKey, SendTransactionError } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { program, authoritySigner } from "../lib/program.js";
import { getConfigPDA, getCoursePDA } from "../lib/pda.js";
import { authMiddleware } from "../middleware/auth.js";
import type { CreateCourseRequest, CreateCourseResponse } from "../types.js";

const app = new Hono();

app.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<CreateCourseRequest>();
  const {
    courseId,
    creator,
    lessonCount,
    difficulty,
    xpPerLesson,
    trackId,
    trackLevel,
    prerequisiteCourseId,
    creatorRewardXp,
    minCompletionsForReward,
    contentTxId,
  } = body;

  if (!courseId || !creator || !lessonCount) {
    return c.json(
      { error: "Missing required fields: courseId, creator, lessonCount" },
      400,
    );
  }

  const creatorPubkey = new PublicKey(creator);
  const [configPDA] = getConfigPDA();
  const [coursePDA] = getCoursePDA(courseId);

  // Build contentTxId as 32-byte array (pad/truncate the string hash)
  const contentBytes = new Uint8Array(32);
  const encoded = new TextEncoder().encode(contentTxId ?? "");
  contentBytes.set(encoded.slice(0, 32));

  // Resolve prerequisite to a PDA pubkey if provided
  let prerequisite: PublicKey | null = null;
  if (prerequisiteCourseId) {
    const [prereqPDA] = getCoursePDA(prerequisiteCourseId);
    prerequisite = prereqPDA;
  }

  const params = {
    courseId,
    creator: creatorPubkey,
    contentTxId: Array.from(contentBytes),
    lessonCount,
    difficulty,
    xpPerLesson,
    trackId,
    trackLevel,
    prerequisite,
    creatorRewardXp,
    minCompletionsForReward,
  };

  let signature: string;
  try {
    signature = await program.methods
      .createCourse(params)
      .accountsStrict({
        course: coursePDA,
        config: configPDA,
        authority: authoritySigner.publicKey,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      })
      .signers([authoritySigner])
      .rpc();
  } catch (err) {
    if (err instanceof SendTransactionError) {
      const logs = await err.getLogs(program.provider.connection);
      return c.json({ error: err.message, logs }, 500);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }

  return c.json<CreateCourseResponse>({
    success: true,
    signature,
    coursePDA: coursePDA.toBase58(),
  });
});

export default app;
