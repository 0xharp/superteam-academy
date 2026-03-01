import { Hono } from "hono";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  program,
  backendSigner,
  XP_MINT,
  MPL_CORE_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "../lib/program.js";
import {
  getConfigPDA,
  getMinterRolePDA,
  getAchievementTypePDA,
  getAchievementReceiptPDA,
} from "../lib/pda.js";
import { getOrCreateATA } from "../lib/ata.js";
import { authMiddleware } from "../middleware/auth.js";
import type { AwardAchievementRequest } from "../types.js";

const app = new Hono();

app.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<AwardAchievementRequest>();
  const { achievementId, recipientWallet } = body;

  if (!achievementId || !recipientWallet) {
    return c.json(
      { error: "Missing required fields: achievementId, recipientWallet" },
      400,
    );
  }

  const recipient = new PublicKey(recipientWallet);
  const [configPDA] = getConfigPDA();
  const [minterRolePDA] = getMinterRolePDA(backendSigner.publicKey);
  const [achievementTypePDA] = getAchievementTypePDA(achievementId);
  const [achievementReceiptPDA] = getAchievementReceiptPDA(achievementId, recipient);

  // Fetch achievement type to get collection address
  let achievementType;
  try {
    achievementType = await program.account.achievementType.fetch(achievementTypePDA);
  } catch {
    return c.json(
      { error: `AchievementType "${achievementId}" not created on-chain yet. Create it via admin panel first.` },
      404,
    );
  }
  const collection = achievementType.collection as PublicKey;

  if (!(achievementType as { isActive?: boolean }).isActive) {
    return c.json(
      { error: `AchievementType "${achievementId}" is deactivated` },
      400,
    );
  }

  // Generate new keypair for the NFT asset
  const assetKeypair = Keypair.generate();

  // Get or create recipient's XP ATA
  const [recipientATA, createAtaIx] = await getOrCreateATA(
    XP_MINT,
    recipient,
    backendSigner.publicKey,
  );

  const builder = program.methods
    .awardAchievement()
    .accountsStrict({
      config: configPDA,
      achievementType: achievementTypePDA,
      achievementReceipt: achievementReceiptPDA,
      minterRole: minterRolePDA,
      asset: assetKeypair.publicKey,
      collection,
      recipient,
      recipientTokenAccount: recipientATA,
      xpMint: XP_MINT,
      payer: backendSigner.publicKey,
      minter: backendSigner.publicKey,
      mplCoreProgram: MPL_CORE_PROGRAM_ID,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([backendSigner, assetKeypair]);

  if (createAtaIx) {
    builder.preInstructions([createAtaIx]);
  }

  const signature = await builder.rpc();

  return c.json({
    success: true,
    signature,
    asset: assetKeypair.publicKey.toBase58(),
  });
});

export default app;
