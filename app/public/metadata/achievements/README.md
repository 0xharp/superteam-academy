# Achievement System

## Overview

Achievements are soulbound Metaplex Core NFTs minted on Solana. When a user earns an achievement, an `AchievementReceipt` PDA is created on-chain (preventing double-awards) and an NFT is minted to their wallet. XP tokens are also minted if the achievement has a reward.

There are two types:
- **Auto-claim** — the system checks eligibility automatically; users click "Claim" on their dashboard
- **Manual** — admin awards directly from the Admin panel

## How It Works

```
User completes activity (lesson, course, streak, etc.)
        │
        ▼
Dashboard calls GET /api/gamification?type=eligible
        │
        ▼
achievement-checker.ts evaluates rules against user_stats
        │
        ▼
Returns list of eligible achievement IDs → dashboard highlights them
        │
        ▼
User clicks "Claim" → POST /api/gamification (claim-achievement)
        │
        ▼
Backend calls award_achievement on-chain instruction:
  1. Creates AchievementReceipt PDA (blocks double-award)
  2. Mints soulbound NFT (PermanentFreezeDelegate)
  3. Mints XP tokens to user's ATA
        │
        ▼
Dashboard shows achievement as unlocked (receipt PDA exists)
```

## Predefined Achievements (IDs 0–11)

| ID | Name | XP | Type | How to Earn |
|----|------|----|------|-------------|
| 0 | First Steps | 50 | Auto | Complete your first lesson (`lessons_completed >= 1`) |
| 1 | Course Completer | 200 | Auto | Complete your first course (`courses_completed >= 1`) |
| 2 | Speed Runner | 500 | Auto | Complete a course within 24 hours of enrolling |
| 3 | Week Warrior | 100 | Auto | Reach a 7-day streak (`longest_streak >= 7`) |
| 4 | Monthly Master | 300 | Auto | Reach a 30-day streak (`longest_streak >= 30`) |
| 5 | Consistency King | 1000 | Auto | Reach a 100-day streak (`longest_streak >= 100`) |
| 6 | Rust Rookie | 150 | Auto | Complete any course tagged with `"rust"` |
| 7 | Anchor Expert | 500 | Auto | Complete **all** courses tagged with `"anchor"` |
| 8 | Early Adopter | 250 | Auto | Be among the first 100 registered users |
| 9 | Bug Hunter | 200 | Manual | Admin awards when a user reports a verified bug |
| 10 | Social Butterfly | 100 | Auto | Connect all 3 social accounts (Twitter, GitHub, Discord) |
| 11 | Challenge Champion | 400 | Auto | Complete 50 daily code challenges |

### Eligibility Details

- **First Steps / Course Completer**: Checked against `user_stats.lessons_completed` / `courses_completed` counters in Supabase
- **Speed Runner**: Compares each enrollment's `enrolled_at` vs `completed_at` timestamps; passes if any course was finished within 86,400,000ms (24h)
- **Streak achievements (3, 4, 5)**: Checked against `user_stats.longest_streak`; streak freezes can bridge missed days
- **Rust Rookie**: Uses `getTaggedCourseIds("rust")` to find Rust courses, checks if user completed at least one
- **Anchor Expert**: Uses `getTaggedCourseIds("anchor")` to find all Anchor courses, checks if user completed **every** one
- **Early Adopter**: Counts users with `created_at` before the current user; eligible if count < 100
- **Bug Hunter**: Always returns `false` in auto-check; only awardable via Admin panel
- **Social Butterfly**: Checks `profile.social_links` for all 3 keys: `twitter`, `github`, `discord`
- **Challenge Champion**: Counts rows in `daily_challenge_completions` for the user; passes at >= 50

## Dynamic Achievements (Admin-Created)

Admins can create new achievements from the Admin panel. These are stored on-chain as `AchievementType` accounts.

- They appear automatically in dashboard and profile views (no code changes needed)
- They use the on-chain `name` and a default trophy icon
- They can only be awarded manually via the Admin panel "Award" button
- To make a dynamic achievement auto-claimable, add a rule to `achievement-checker.ts`
- Inactive achievements are hidden from users unless already earned

### Creating a Dynamic Achievement

1. Go to Admin > Achievements > "Create Achievement Type"
2. Fill in: achievement ID (slug), name, metadata URI, max supply, XP reward
3. The achievement is created on-chain; table auto-refreshes in ~15 seconds
4. Use the "Award" button to grant it to users by username

## Anti-Cheat / Double-Award Prevention

- **On-chain**: `AchievementReceipt` PDA seeded by `["achievement_receipt", achievement_id, recipient]` — if it already exists, the transaction fails
- **Off-chain**: Bitmap flags in `user_stats.achievement_flags` (4 × u64 = 256 slots) track which achievements have been claimed
- **Eligibility re-check**: The claim endpoint re-verifies eligibility before calling the backend

## On-Chain Accounts

**AchievementType** — defines an achievement
```
Seeds: ["achievement", achievement_id_bytes_le_u16]
Fields: achievement_id, name, metadata_uri, collection, creator,
        max_supply, current_supply, xp_reward, is_active, created_at
```

**AchievementReceipt** — proves a user earned it (prevents double-award)
```
Seeds: ["achievement_receipt", achievement_id_string, recipient_pubkey]
Fields: asset (NFT address), awarded_at, bump
```

## Metadata Files

Static Metaplex Token Metadata JSON files for the 12 predefined achievements live in this directory.

| ID | File |
|----|------|
| 0 | `first-steps.json` |
| 1 | `course-completer.json` |
| 2 | `speed-runner.json` |
| 3 | `week-warrior.json` |
| 4 | `monthly-master.json` |
| 5 | `consistency-king.json` |
| 6 | `rust-rookie.json` |
| 7 | `anchor-expert.json` |
| 8 | `early-adopter.json` |
| 9 | `bug-hunter.json` |
| 10 | `social-butterfly.json` |
| 11 | `challenge-champion.json` |

## On-Chain PDAs (Devnet)

| Achievement | PDA |
|-------------|-----|
| First Steps | `3Z8XVbPSSwntgc33MB5X8gYHH22w8AWQQbUDCT1D6vSD` |
| Course Completer | `FZwZjuah7sHYZz7RFXSJuan3aabassV7LwHvaNqc1Yoc` |
| Speed Runner | `28nzALqhhbGPsdrxCJ9Cc3NWtr4t2KBt6Yy7j3D1neoD` |
| Week Warrior | `7zLN5mnEVBkVh92p1A6MMUBDQxrSizkJYpoZDh2FBZqU` |
| Monthly Master | `HCddnveyF6oSUSbEyBEo1NP9Mg1LnESFs14pErPQghg5` |
| Consistency King | `ExM4xeNbmc7ihwtBVtChMzurej45NEskeqJeXiJc8d4g` |
| Rust Rookie | `GuHarrRpKrDSYDEN8Ms9u1uyvpENnJYe3uanmcAXcsCy` |
| Anchor Expert | `BhEcQZGWbZ5jtPzHYdLMeAYySQR8kYfLJ4frBMmDumNg` |
| Early Adopter | `Ewk9DWvh6u58NZGjufvHpNsfRrt411Fexf3gJ2qaotVa` |
| Bug Hunter | `6Wa3aXEA4kZCEw3ViTQ34sEja62b62dP7Y1V2mKD8Jum` |
| Social Butterfly | `BQ6VEoPH3gCDx4q5LHFxbUw1ij9GURNeES74x5VA8Nzp` |
| Challenge Champion | `5J4E7hD6JRyaEnHYYLMzTHciAT9qudKrEFXtRrrUh8rd` |

## Key Source Files

| File | Purpose |
|------|---------|
| `app/src/services/achievement-checker.ts` | Auto-claim eligibility rules |
| `app/src/services/gamification.ts` | Achievement definitions, on-chain receipt checks |
| `app/src/components/dashboard/achievement-grid.tsx` | Dashboard UI (claim, locked, unlocked states) |
| `app/src/app/api/gamification/route.ts` | Eligibility + claim API endpoints |
| `app/src/app/api/admin/achievements/` | Admin create/award/deactivate endpoints |
| `onchain-academy/programs/.../instructions/award_achievement.rs` | On-chain award instruction |
| `backend/src/routes/award-achievement.ts` | Backend signer for award transactions |
| `scripts/setup-achievements.ts` | Bulk-create all 12 achievements on-chain |

## Setup Script

```bash
npx tsx scripts/setup-achievements.ts
```

Bulk-creates all 12 achievement types on-chain via the backend API. Reads env from `app/.env.local`. Skips already-existing achievements gracefully.
