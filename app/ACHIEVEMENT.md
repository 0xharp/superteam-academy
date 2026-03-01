# Admin Award by Username, On-Chain Achievement Status, Show All 12

## Context

Three changes requested:
1. Admin award should take username, resolve wallet server-side (error if no wallet linked)
2. Remove off-chain achievement bookkeeping from claim flow — only do on-chain. Cron job already syncs XP from on-chain.
3. Dashboard + admin should use on-chain data to check claim status
4. Dashboard should show all 12 achievements (currently hardcoded to 6)
5. Dashboard claim should error if no wallet linked

## Change 1: Admin Award — Username Instead of Wallet

### `app/src/app/[locale]/admin/page.tsx`
- Rename `achAwardWallet` state → `achAwardUsername`
- Change dialog: label "Username", placeholder "@username"
- Send `{ action: "award", recipientUsername }` instead of `recipientWallet`

### `app/src/app/api/admin/achievements/[achievementId]/route.ts`
- Accept `recipientUsername` instead of `recipientWallet`
- Supabase lookup: `profiles.select("wallet_address").eq("username", username).single()`
- If no profile → 404 "User not found"
- If no wallet → 400 "User has no wallet linked"
- Pass resolved wallet to backend

### i18n keys (all 3 locale files)
- `admin.recipientUsername`: "Username"
- `admin.userNotFound`: "User not found"
- `admin.noWalletLinked`: "User has no wallet linked"

## Change 2: On-Chain Only Claim Flow

### `app/src/services/gamification.ts` — `claimAchievement()`
Remove the off-chain updates after on-chain success (lines 338-350):
- Remove `achievement_flags` bitflag update in Supabase
- Remove `awardXP()` call

The cron sync (`onchain-sync.ts`) already picks up achievement XP from on-chain via `award_achievement` instruction parsing (`ach:<accounts[1]>` pattern at line 173).

After this, `claimAchievement()` will:
1. Check not already claimed **on-chain** (try fetch AchievementReceipt PDA)
2. Call backend `/award-achievement` (on-chain mint)
3. Return success/failure — no Supabase writes

### `app/src/services/gamification.ts` — `getAchievements()`
Replace Supabase bitflag reads with on-chain AchievementReceipt PDA lookups:
- For each achievement definition, derive receipt PDA: `["achievement_receipt", achievementId, wallet]`
- `program.account.achievementReceipt.fetchNullable(pda)` — if exists, unlocked
- Needs wallet address (passed as parameter)
- If no wallet → all achievements show as locked

### `app/src/services/interfaces.ts`
Update `GamificationService.getAchievements()` signature to accept optional `walletAddress`:
```ts
getAchievements(userId: string, walletAddress?: string): Promise<Achievement[]>;
```

### `app/src/app/api/gamification/route.ts`
- Pass `session.walletAddress` to `getAchievements()`
- For claim: already checks wallet exists (line 93) — good

### New helper in `app/src/lib/solana/on-chain.ts`
Add `getAchievementReceiptPDA(achievementId: string, recipient: PublicKey)` using string seeds (matching backend PDA derivation).

## Change 3: Show All 12 Achievements on Dashboard

### `app/src/components/dashboard/achievement-grid.tsx`
- Remove `.slice(0, 6)` — use all achievements
- Grid: `grid-cols-3 sm:grid-cols-4 lg:grid-cols-6`
- Skeleton count: 12 instead of 6

## Change 4: Dashboard Claim — Wallet Required
Already handled: `POST /api/gamification` line 93 returns error if no wallet. The UI should surface this properly — it already does via `toast.error(data.error)`.

## Files Modified

| File | Change |
|------|--------|
| `app/src/app/[locale]/admin/page.tsx` | Username input in award dialog |
| `app/src/app/api/admin/achievements/[achievementId]/route.ts` | Resolve username → wallet |
| `app/src/services/gamification.ts` | On-chain getAchievements + remove off-chain from claim |
| `app/src/services/interfaces.ts` | Add walletAddress param to getAchievements |
| `app/src/app/api/gamification/route.ts` | Pass walletAddress to getAchievements |
| `app/src/lib/solana/on-chain.ts` | Add receipt PDA helper |
| `app/src/components/dashboard/achievement-grid.tsx` | Show all 12, responsive grid |
| `app/src/messages/en.json` | i18n keys |
| `app/src/messages/es.json` | i18n keys |
| `app/src/messages/pt-BR.json` | i18n keys |

## Verification
1. `npx tsc --noEmit` — clean compile
2. Admin award dialog: enter username → resolves wallet → awards on-chain
3. Admin award dialog: enter username of user without wallet → error message
4. Dashboard: all 12 achievements visible
5. Dashboard: claimed achievements show as unlocked (via on-chain receipt check)
6. Dashboard claim: calls on-chain only, no Supabase writes
