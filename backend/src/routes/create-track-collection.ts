import { Hono } from "hono";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore, createCollectionV2 } from "@metaplex-foundation/mpl-core";
import { generateSigner, keypairIdentity } from "@metaplex-foundation/umi";
import {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import { getConfigPDA } from "../lib/pda.js";
import { config } from "../lib/config.js";
import { authMiddleware } from "../middleware/auth.js";

interface CreateCollectionRequest {
  trackName: string;
  trackSlug: string;
}

const app = new Hono();

/**
 * POST /admin/create-track-collection
 *
 * Creates a Metaplex Core collection on-chain with the Config PDA as
 * updateAuthority (required for credential CPIs).
 */
app.post("/", authMiddleware, async (c) => {
  const body = await c.req.json<CreateCollectionRequest>();
  const { trackName, trackSlug } = body;

  if (!trackName || !trackSlug) {
    return c.json({ error: "Missing trackName or trackSlug" }, 400);
  }

  const [configPDA] = getConfigPDA();
  const appOrigin = process.env.APP_ORIGIN || "http://localhost:3000";

  try {
    const umi = createUmi(config.rpcUrl)
      .use(mplCore())
      .use(keypairIdentity(fromWeb3JsKeypair(config.authoritySigner)));

    const collectionSigner = generateSigner(umi);

    await createCollectionV2(umi, {
      collection: collectionSigner,
      name: `${trackName} Credentials`,
      uri: `${appOrigin}/api/tracks?slug=${encodeURIComponent(trackSlug)}`,
      updateAuthority: fromWeb3JsPublicKey(configPDA),
    }).sendAndConfirm(umi);

    return c.json({
      success: true,
      collectionPublicKey: collectionSigner.publicKey.toString(),
      configPDA: configPDA.toBase58(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: `Failed to create collection: ${message}` }, 500);
  }
});

export default app;
