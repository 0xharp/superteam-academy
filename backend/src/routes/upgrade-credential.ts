import { Hono } from "hono";
import {
  PublicKey,
  SendTransactionError,
  SystemProgram,
} from "@solana/web3.js";
import BN from "bn.js";
import { program, backendSigner, MPL_CORE_PROGRAM_ID } from "../lib/program.js";
import { getConfigPDA, getCoursePDA, getEnrollmentPDA } from "../lib/pda.js";
import { getTrackCollection } from "../lib/tracks.js";
import { authMiddleware } from "../middleware/auth.js";

interface UpgradeCredentialRequest {
  courseId: string;
  learnerWallet: string;
  credentialAsset: string;
  credentialName: string;
  metadataUri: string;
  coursesCompleted: number;
  totalXp: number;
}

const app = new Hono();

app.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<UpgradeCredentialRequest>();
  const {
    courseId,
    learnerWallet,
    credentialAsset,
    credentialName,
    metadataUri,
    coursesCompleted,
    totalXp,
  } = body;

  if (
    !courseId ||
    !learnerWallet ||
    !credentialAsset ||
    !credentialName ||
    !metadataUri ||
    coursesCompleted == null ||
    totalXp == null
  ) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const learner = new PublicKey(learnerWallet);
  const asset = new PublicKey(credentialAsset);
  const [configPDA] = getConfigPDA();
  const [coursePDA] = getCoursePDA(courseId);
  const [enrollmentPDA] = getEnrollmentPDA(courseId, learner);

  let trackCollection;
  try {
    const courseAccount = await program.account.course.fetch(coursePDA);
    trackCollection = await getTrackCollection(courseAccount.trackId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json(
      { error: `Failed to resolve track collection: ${message}` },
      400,
    );
  }

  let signature: string;
  try {
    signature = await program.methods
      .upgradeCredential(
        credentialName,
        metadataUri,
        coursesCompleted,
        new BN(totalXp),
      )
      .accountsPartial({
        config: configPDA,
        course: coursePDA,
        enrollment: enrollmentPDA,
        learner,
        credentialAsset: asset,
        trackCollection,
        payer: backendSigner.publicKey,
        backendSigner: backendSigner.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([backendSigner])
      .rpc();
  } catch (err) {
    if (err instanceof SendTransactionError) {
      const logs = await err.getLogs(program.provider.connection);
      return c.json({ error: err.message, logs }, 500);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }

  return c.json({
    success: true,
    signature,
    credentialAsset: asset.toBase58(),
  });
});

export default app;
