import { Hono } from "hono";
import { Keypair, SystemProgram } from "@solana/web3.js";
import {
  program,
  authoritySigner,
  backendSigner,
  MPL_CORE_PROGRAM_ID,
} from "../lib/program.js";
import { getConfigPDA, getAchievementTypePDA } from "../lib/pda.js";
import { authMiddleware } from "../middleware/auth.js";
import type { CreateAchievementTypeRequest } from "../types.js";

const app = new Hono();

app.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<CreateAchievementTypeRequest>();
  const { achievementId, name, metadataUri, maxSupply, xpReward } = body;

  if (!achievementId || !name || !metadataUri || xpReward == null) {
    return c.json(
      { error: "Missing required fields: achievementId, name, metadataUri, xpReward" },
      400,
    );
  }

  const [configPDA] = getConfigPDA();
  const [achievementTypePDA] = getAchievementTypePDA(achievementId);

  // Generate new keypair for the Metaplex Core collection
  const collectionKeypair = Keypair.generate();

  const signature = await program.methods
    .createAchievementType({
      achievementId,
      name,
      metadataUri,
      maxSupply: maxSupply ?? 0,
      xpReward,
    })
    .accountsStrict({
      config: configPDA,
      achievementType: achievementTypePDA,
      collection: collectionKeypair.publicKey,
      authority: authoritySigner.publicKey,
      payer: backendSigner.publicKey,
      mplCoreProgram: MPL_CORE_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([authoritySigner, backendSigner, collectionKeypair])
    .rpc();

  return c.json({
    success: true,
    signature,
    achievementTypePDA: achievementTypePDA.toBase58(),
    collectionAddress: collectionKeypair.publicKey.toBase58(),
  });
});

export default app;
