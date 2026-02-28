import { Hono } from "hono";
import { PublicKey } from "@solana/web3.js";
import { getTrackStats } from "../lib/track-stats.js";
import { authMiddleware } from "../middleware/auth.js";

const app = new Hono();

/**
 * GET /track-stats?learner=<pubkey>&trackId=<number>
 *
 * Returns { coursesCompleted, totalXp } for a learner in a specific track.
 */
app.get("/", authMiddleware, async (c) => {
  const learnerStr = c.req.query("learner");
  const trackIdStr = c.req.query("trackId");

  if (!learnerStr || !trackIdStr) {
    return c.json({ error: "Missing learner or trackId" }, 400);
  }

  let learner: PublicKey;
  try {
    learner = new PublicKey(learnerStr);
  } catch {
    return c.json({ error: "Invalid learner public key" }, 400);
  }

  const trackId = parseInt(trackIdStr, 10);
  if (isNaN(trackId)) {
    return c.json({ error: "Invalid trackId" }, 400);
  }

  try {
    const stats = await getTrackStats(learner, trackId);
    return c.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 500);
  }
});

export default app;
