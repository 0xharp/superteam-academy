import { Hono } from "hono";
import { SendTransactionError } from "@solana/web3.js";
import { program, authoritySigner } from "../lib/program.js";
import { getConfigPDA, getCoursePDA } from "../lib/pda.js";
import { authMiddleware } from "../middleware/auth.js";
import type { UpdateCourseRequest, UpdateCourseResponse } from "../types.js";

const app = new Hono();

app.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<UpdateCourseRequest>();
  const { courseId } = body;

  if (!courseId) {
    return c.json({ error: "Missing required field: courseId" }, 400);
  }

  const [configPDA] = getConfigPDA();
  const [coursePDA] = getCoursePDA(courseId);

  let newContentTxId: number[] | null = null;
  if (body.newContentTxId) {
    const contentBytes = new Uint8Array(32);
    const encoded = new TextEncoder().encode(body.newContentTxId);
    contentBytes.set(encoded.slice(0, 32));
    newContentTxId = Array.from(contentBytes);
  }

  const params = {
    newContentTxId: newContentTxId ?? null,
    newIsActive: body.newIsActive ?? null,
    newXpPerLesson: body.newXpPerLesson ?? null,
    newCreatorRewardXp: body.newCreatorRewardXp ?? null,
    newMinCompletionsForReward: body.newMinCompletionsForReward ?? null,
  };

  let signature: string;
  try {
    signature = await program.methods
      .updateCourse(params)
      .accountsStrict({
        config: configPDA,
        course: coursePDA,
        authority: authoritySigner.publicKey,
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

  return c.json<UpdateCourseResponse>({ success: true, signature });
});

export default app;
