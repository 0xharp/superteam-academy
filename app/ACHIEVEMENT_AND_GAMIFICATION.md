# Achievements, Gamification & Daily Challenges Plan

## Context

The dashboard has a hardcoded daily challenge, static achievement display, and no claim flow. The on-chain program supports `create_achievement_type`, `award_achievement`, and `deactivate_achievement_type`. We need:

1. **Daily challenges** — code-defined quiz pool, daily rotation, XP on correct answer
2. **Achievements** — auto-detection of eligibility, on-chain claiming via `award_achievement` (NO off-chain fallback)
3. **Admin achievement management** — create achievement types on-chain, manually award to users (e.g. Bug Hunter)
4. **Streak → achievement flow** — streak milestones unlock achievement eligibility
5. **XP sync improvements** — update existing daily cron to categorize achievement/reward XP

**Constraint**: On-chain program CANNOT be changed. No mock implementations — Supabase + on-chain only.

---

## Part 1: Daily Challenges

### 1.1 Challenge Pool

**New: `app/src/lib/daily-challenges.ts`**

- Define ~30 Solana quiz questions as typed array
- Each has: `id`, i18n question key, 4 option keys, `correctIndex`, `xpReward` (50), `category`
- `getTodaysChallenge()`: deterministic daily pick via `hash(YYYY-MM-DD) % pool.length`
- `checkAnswer(challengeId, selectedIndex)`: server-side validation

### 1.2 API Route

**New: `app/src/app/api/daily-challenge/route.ts`**

- `GET`: Return today's challenge (question + options, no correct answer)
- `POST { challengeId, selectedIndex }`:
  1. Auth check
  2. Validate answer via `checkAnswer()`
  3. Check `daily_challenge_completions` for today (prevent double-claim)
  4. If correct: insert completion, call `gamificationService.awardXP(userId, 50, "daily_challenge", challengeId)`, record streak activity
  5. Return `{ correct, xpEarned?, alreadyCompleted? }`

### 1.3 Schema Migration

**New: `app/supabase/migrations/010_daily_challenges.sql`**

The existing `daily_challenge_completions` table has FK to `daily_challenges`. Since we use a code-defined pool now, adjust:

```sql
ALTER TABLE daily_challenge_completions
  DROP CONSTRAINT IF EXISTS daily_challenge_completions_challenge_id_fkey;
ALTER TABLE daily_challenge_completions
  ALTER COLUMN challenge_id TYPE TEXT USING challenge_id::TEXT;
ALTER TABLE daily_challenge_completions
  ADD COLUMN IF NOT EXISTS challenge_date DATE DEFAULT CURRENT_DATE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_completion_user_date
  ON daily_challenge_completions(user_id, challenge_date);
```

### 1.4 Dashboard Component

**New: `app/src/components/dashboard/daily-challenge-card.tsx`**

- Fetches `GET /api/daily-challenge` on mount
- Shows question + 4 radio options + submit button
- On submit: `POST /api/daily-challenge` → show correct/incorrect + XP earned
- If already completed: show checkmark + "Completed today!"
- Uses `useTranslations("dailyChallenges")` for i18n

### 1.5 Update Dashboard Page

**Modify: `app/src/app/[locale]/dashboard/page.tsx`**

- Replace hardcoded daily challenge card (lines 343-362) with `<DailyChallengeCard />`

---

## Part 2: Achievement System

### 2.1 Achievement Definitions Update

**Modify: `app/src/services/gamification.ts`**

Add `achievementId` string to each definition (maps to on-chain PDA seed):

```typescript
{ id: 0, achievementId: "first-steps", name: "First Steps", ... }
{ id: 1, achievementId: "course-completer", ... }
// ... etc for all 12
```

### 2.2 Achievement Eligibility Checker

**New: `app/src/services/achievement-checker.ts`**

```typescript
export async function checkEligibility(userId: string): Promise<number[]>
```

Returns array of achievement IDs the user qualifies for but hasn't claimed. Rules:

| ID | Achievement | Rule (reads from `user_stats` + `xp_transactions`) |
|----|-------------|------|
| 0 | First Steps | `lessons_completed >= 1` |
| 1 | Course Completer | `courses_completed >= 1` |
| 2 | Speed Runner | Any course with enrollment→completion in <24h |
| 3 | Week Warrior | `longest_streak >= 7` |
| 4 | Monthly Master | `longest_streak >= 30` |
| 5 | Consistency King | `longest_streak >= 100` |
| 6 | Rust Rookie | Completed a course tagged "rust" |
| 7 | Anchor Expert | Completed all courses tagged "anchor" |
| 8 | Early Adopter | User's profile is among first 100 |
| 9 | Bug Hunter | Manual admin award only (skip auto-check) |
| 10 | Social Butterfly | Has twitter + github + discord in `profiles.social_links` |
| 11 | Challenge Champion | `challenges_completed >= 50` |

Reads `user_stats.achievement_flags` to exclude already-claimed.

### 2.3 Backend Award Achievement Route

**New: `backend/src/routes/award-achievement.ts`**

```typescript
// POST /award-achievement
// Body: { achievementId: string, recipientWallet: string }
```

Flow:
1. Derive PDAs: `getAchievementTypePDA(achievementId)`, `getAchievementReceiptPDA(achievementId, recipient)`, `getMinterRolePDA(backendSigner)`
2. Fetch AchievementType to get collection address + XP reward
3. Generate new Keypair for the asset
4. Get/create recipient XP ATA
5. Call `program.methods.awardAchievement()` with all accounts
6. Return `{ success, signature, asset }`

**Modify: `backend/src/index.ts`** — Register route.

### 2.4 Frontend Claim Flow

**Modify: `app/src/app/api/gamification/route.ts`** — Add POST handler:

```typescript
// POST /api/gamification
// Body: { type: "claim-achievement", achievementIndex: number }
```

Flow:
1. Auth + wallet check (wallet required — no off-chain fallback)
2. Run eligibility check for this achievement
3. Check not already claimed (bitflags)
4. Call backend `/award-achievement` → on-chain NFT mint + XP
5. On success: update `user_stats.achievement_flags` in Supabase
6. Insert `xp_transactions` record (source: "achievement")
7. Return `{ success, signature, xpEarned, asset }`

**No off-chain fallback** — if the AchievementType PDA doesn't exist on-chain, return an error. Admin must create it first via the admin panel.

### 2.5 Update `claimAchievement` in Service

**Modify: `app/src/services/gamification.ts`**

- Remove `MockGamificationService` entirely — Supabase-only
- Update `SupabaseGamificationService.claimAchievement(userId, achievementIndex, walletAddress)`: requires wallet, calls backend `/award-achievement`
- On success: sets bitflag + records XP transaction

### 2.6 Admin: Achievement Management

#### 2.6a Backend Routes

**New: `backend/src/routes/create-achievement-type.ts`**

```typescript
// POST /admin/create-achievement-type
// Body: { achievementId, name, metadataUri, maxSupply, xpReward }
// Auth: authority signer
```

Flow:
1. Generate new Keypair for collection
2. Call `program.methods.createAchievementType({ achievementId, name, metadataUri, maxSupply, xpReward })`
3. Return `{ success, signature, achievementTypePDA, collectionAddress }`

**New: `backend/src/routes/deactivate-achievement-type.ts`**

```typescript
// POST /admin/deactivate-achievement-type
// Body: { achievementId }
```

**Modify: `backend/src/index.ts`** — Register all 3 new routes.

#### 2.6b Admin API Routes

**New: `app/src/app/api/admin/achievements/route.ts`**

- `GET`: List all AchievementType PDAs on-chain (`program.account.achievementType.all()`)
- `POST`: Create new achievement type → calls backend `/admin/create-achievement-type`

**New: `app/src/app/api/admin/achievements/[achievementId]/route.ts`**

- `POST { action: "deactivate" }`: Deactivate achievement type
- `POST { action: "award", recipientWallet }`: Manually award to a user (for Bug Hunter etc.)

#### 2.6c Admin UI Tab

**Modify: `app/src/app/[locale]/admin/page.tsx`**

Add "Achievements" tab (after Tracks):

- **List view**: Table of all on-chain AchievementType PDAs showing: achievementId, name, currentSupply/maxSupply, xpReward, isActive
- **Create dialog**: Form with fields: achievementId, name, metadataUri, maxSupply, xpReward → calls POST `/api/admin/achievements`
- **Award dialog**: Select user by wallet address → calls POST `/api/admin/achievements/[id]` with action=award
- **Deactivate button**: Calls deactivate action

### 2.7 Dashboard Achievement Grid

**New: `app/src/components/dashboard/achievement-grid.tsx`**

- Takes `achievements: Achievement[]` + `eligible: number[]`
- 3 states per card: **locked** (dimmed), **eligible** (glowing + "Claim" button), **claimed** (checkmark)
- Claim button → POST `/api/gamification` → success toast
- Uses `useTranslations("gamification")` for labels

### 2.8 Update Dashboard Page

**Modify: `app/src/app/[locale]/dashboard/page.tsx`**

- Fetch eligible achievements via new API param: `GET /api/gamification?type=eligible`
- Replace static achievement grid with `<AchievementGrid />`

---

## Part 3: XP Sync Improvements

### 3.1 Better Transaction Parsing

**Modify: `app/src/services/onchain-sync.ts`**

In `parseTransaction()`, improve the `coursePda` assignment:

- `award_achievement` account layout: `[config, achievement_type, achievement_receipt, minter_role, asset, collection, recipient, recipient_token_account, xp_mint, ...]`
  - `accounts[8]` = xp_mint → identifies this as achievement
  - Store `accounts[1]` (AchievementType PDA) as coursePda with prefix: `"ach:<pda>"`
- `reward_xp` account layout: `[config, minter_role, xp_mint, recipient_token_account, minter, token_program]`
  - `accounts[2]` = xp_mint → identifies this as reward
  - Keep `NON_COURSE_XP_LABEL`
- Course instructions: `accounts[4]` = xp_mint (already handled)

### 3.2 Better Source Categorization

**Modify: `app/src/services/leaderboard.ts`** in `recordXpEvent()`:

```typescript
const source = record.coursePda.startsWith("ach:")
  ? "achievement"
  : record.coursePda === NON_COURSE_XP_LABEL
    ? "onchain_sync"
    : "onchain_sync";
```

### 3.3 Update XP Source Type

**Modify: `app/src/types/gamification.ts`**

Add `"daily_challenge"` to `XPTransaction.source` union.

---

## Part 4: i18n

**Modify: `app/src/messages/en.json`, `pt-BR.json`, `es.json`**

Add keys:

```
dailyChallenges.title, .completed, .correct, .incorrect, .xpEarned,
  .alreadyCompleted, .submitAnswer, .selectAnswer
dailyChallenges.q_*.question, .q_*.option0-3 (for each quiz question)

gamification.claimAchievement, .achievementClaimed, .eligible, .locked,
  .claiming, .claimFailed

dashboard.dailyChallengeCompleted, .viewAllAchievements

achievements.{id}.name, achievements.{id}.description (for all 12)
```

---

## Part 5: Streak → Achievement Flow

No code changes needed beyond what's above. The flow is:

1. User earns XP → `awardXP()` updates streak in `user_stats`
2. Dashboard fetches achievements + eligible list
3. If `longest_streak >= 7` and "Week Warrior" not claimed → shows as eligible
4. User clicks "Claim" → on-chain NFT minted + XP awarded
5. Same for 30-day and 100-day milestones

---

## Files Summary

### New Files (12)
| File | Purpose |
|------|---------|
| `app/src/lib/daily-challenges.ts` | Challenge pool + daily picker |
| `app/src/app/api/daily-challenge/route.ts` | GET/POST daily challenge |
| `app/src/services/achievement-checker.ts` | Eligibility rules |
| `app/src/components/dashboard/daily-challenge-card.tsx` | Quiz UI |
| `app/src/components/dashboard/achievement-grid.tsx` | Claimable grid |
| `backend/src/routes/award-achievement.ts` | On-chain award_achievement |
| `backend/src/routes/create-achievement-type.ts` | On-chain create_achievement_type |
| `backend/src/routes/deactivate-achievement-type.ts` | On-chain deactivate_achievement_type |
| `app/src/app/api/admin/achievements/route.ts` | Admin: list + create achievements |
| `app/src/app/api/admin/achievements/[achievementId]/route.ts` | Admin: award + deactivate |
| `app/supabase/migrations/010_daily_challenges.sql` | Schema tweak |
| `app/src/services/achievement.ts` | AchievementService implementation |

### Modified Files (11)
| File | Change |
|------|--------|
| `app/src/services/gamification.ts` | Remove mock, add `achievementId`, update `claimAchievement` for on-chain |
| `app/src/services/interfaces.ts` | Add `AchievementService` + `AchievementChecker` interfaces |
| `app/src/services/onchain-sync.ts` | Parse achievement instruction accounts |
| `app/src/services/leaderboard.ts` | Source categorization for achievement XP |
| `app/src/types/gamification.ts` | Add `daily_challenge` source type |
| `app/src/app/[locale]/dashboard/page.tsx` | Use new components |
| `app/src/app/[locale]/admin/page.tsx` | Add Achievements tab |
| `app/src/app/api/gamification/route.ts` | POST claim + GET eligible |
| `backend/src/index.ts` | Register 3 new routes |
| `app/src/messages/en.json` | English translations |
| `app/src/messages/pt-BR.json` + `es.json` | Translated strings |

## Execution Order

1. Schema migration (`010_daily_challenges.sql`)
2. Types update (`gamification.ts` — add `daily_challenge` source)
3. Interfaces update (`interfaces.ts` — `AchievementService`, checker types)
4. Daily challenge pool (`daily-challenges.ts`)
5. Daily challenge API route (`api/daily-challenge/route.ts`)
6. Achievement checker service (`achievement-checker.ts`)
7. Backend routes: `award-achievement`, `create-achievement-type`, `deactivate-achievement-type`
8. Backend `index.ts` — register routes
9. Achievement service (`achievement.ts`)
10. Update gamification service — remove mock, add `achievementId`, on-chain `claimAchievement`
11. Update gamification API — POST claim + GET eligible
12. Admin API routes (`api/admin/achievements/`)
13. Admin UI — Achievements tab
14. Dashboard components (`daily-challenge-card`, `achievement-grid`)
15. Update dashboard page
16. XP sync improvements (`onchain-sync.ts`, `leaderboard.ts`)
17. i18n — all 3 locales
18. `pnpm run build` verification

## Verification

1. `pnpm run build` passes
2. `GET /api/daily-challenge` returns today's quiz
3. `POST /api/daily-challenge` awards XP on correct answer, prevents double-claim
4. `GET /api/gamification?type=eligible` returns eligible achievement IDs
5. `POST /api/gamification { type: "claim-achievement" }` calls on-chain `award_achievement` — fails cleanly if AchievementType not created
6. Admin panel: create achievement type → appears in list
7. Admin panel: manually award achievement to user → on-chain NFT minted
8. Dashboard shows interactive daily challenge + claimable achievements
9. XP sync cron categorizes achievement XP properly
10. All 3 locales have translations
