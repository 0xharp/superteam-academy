import { Hono } from "hono";
import { program, authoritySigner, backendSigner } from "../lib/program.js";
import { getConfigPDA, getAchievementTypePDA } from "../lib/pda.js";
import { authMiddleware } from "../middleware/auth.js";
import type {
  DeactivateAchievementTypeRequest,
  DeactivateAchievementTypeResponse,
} from "../types.js";

const app = new Hono();

app.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<DeactivateAchievementTypeRequest>();
  const { achievementId } = body;

  if (!achievementId) {
    return c.json({ error: "Missing required field: achievementId" }, 400);
  }

  const [configPDA] = getConfigPDA();
  const [achievementTypePDA] = getAchievementTypePDA(achievementId);

  const signature = await program.methods
    .deactivateAchievementType()
    .accountsStrict({
      config: configPDA,
      achievementType: achievementTypePDA,
      authority: authoritySigner.publicKey,
    })
    .signers([authoritySigner])
    .rpc();

  return c.json<DeactivateAchievementTypeResponse>({
    success: true,
    signature,
  });
});

export default app;
