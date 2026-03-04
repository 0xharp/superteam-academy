/**
 * Bulk-create all 12 achievement types on-chain via the backend API.
 *
 * Usage:
 *   pnpm setup-achievements
 *
 * Reads env from .env.local (BACKEND_URL, AUTH_SECRET).
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { SignJWT } from "jose";

// Load .env.local without requiring dotenv
const envPath = resolve(__dirname, "../.env.local");
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.warn(`Warning: Could not read ${envPath}, using existing env vars`);
}

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
const BASE_METADATA_URL = "https://academy.superteam.fun/metadata/achievements";

interface AchievementDef {
  achievementId: string;
  name: string;
  xpReward: number;
  maxSupply: number;
}

const ACHIEVEMENTS: AchievementDef[] = [
  { achievementId: "first-steps", name: "First Steps", xpReward: 50, maxSupply: 0 },
  { achievementId: "course-completer", name: "Course Completer", xpReward: 200, maxSupply: 0 },
  { achievementId: "speed-runner", name: "Speed Runner", xpReward: 500, maxSupply: 0 },
  { achievementId: "week-warrior", name: "Week Warrior", xpReward: 100, maxSupply: 0 },
  { achievementId: "monthly-master", name: "Monthly Master", xpReward: 300, maxSupply: 0 },
  { achievementId: "consistency-king", name: "Consistency King", xpReward: 1000, maxSupply: 0 },
  { achievementId: "rust-rookie", name: "Rust Rookie", xpReward: 150, maxSupply: 0 },
  { achievementId: "anchor-expert", name: "Anchor Expert", xpReward: 500, maxSupply: 0 },
  { achievementId: "early-adopter", name: "Early Adopter", xpReward: 250, maxSupply: 100 },
  { achievementId: "bug-hunter", name: "Bug Hunter", xpReward: 200, maxSupply: 0 },
  { achievementId: "social-butterfly", name: "Social Butterfly", xpReward: 100, maxSupply: 0 },
  { achievementId: "challenge-champion", name: "Challenge Champion", xpReward: 400, maxSupply: 0 },
];

async function buildToken(): Promise<string> {
  if (!AUTH_SECRET) throw new Error("AUTH_SECRET not set in .env.local");
  return new SignJWT({ sub: "setup-script" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(AUTH_SECRET));
}

async function main() {
  console.log(`Creating ${ACHIEVEMENTS.length} achievement types on ${BACKEND_URL}\n`);

  const token = await buildToken();
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const ach of ACHIEVEMENTS) {
    const metadataUri = `${BASE_METADATA_URL}/${ach.achievementId}.json`;

    try {
      const res = await fetch(`${BACKEND_URL}/admin/create-achievement-type`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          achievementId: ach.achievementId,
          name: ach.name,
          metadataUri,
          maxSupply: ach.maxSupply,
          xpReward: ach.xpReward,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[OK] ${ach.name} — PDA: ${data.achievementTypePDA}`);
        created++;
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const msg = err.error || err.message || "Unknown error";
        if (msg.includes("already") || res.status === 409) {
          console.log(`[SKIP] ${ach.name} — already exists`);
          skipped++;
        } else {
          console.error(`[FAIL] ${ach.name} — ${msg}`);
          failed++;
        }
      }
    } catch (err) {
      console.error(`[FAIL] ${ach.name} — ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
