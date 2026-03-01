# Achievement Metadata

Static Metaplex Token Metadata JSON files for the 12 predefined achievements.

## Achievements

| ID | File | Name | Category | XP | Rarity | Type |
|----|------|------|----------|----|--------|------|
| 0 | `first-steps.json` | First Steps | Progress | 50 | Common | Auto |
| 1 | `course-completer.json` | Course Completer | Progress | 200 | Rare | Auto |
| 2 | `speed-runner.json` | Speed Runner | Progress | 500 | Epic | Auto |
| 3 | `week-warrior.json` | Week Warrior | Streak | 100 | Common | Auto |
| 4 | `monthly-master.json` | Monthly Master | Streak | 300 | Rare | Auto |
| 5 | `consistency-king.json` | Consistency King | Streak | 1000 | Legendary | Auto |
| 6 | `rust-rookie.json` | Rust Rookie | Skill | 150 | Common | Auto |
| 7 | `anchor-expert.json` | Anchor Expert | Skill | 500 | Epic | Auto |
| 8 | `early-adopter.json` | Early Adopter | Special | 250 | Rare | Auto |
| 9 | `bug-hunter.json` | Bug Hunter | Special | 200 | Rare | Manual |
| 10 | `social-butterfly.json` | Social Butterfly | Special | 100 | Common | Auto |
| 11 | `challenge-champion.json` | Challenge Champion | Progress | 400 | Epic | Auto |

## Rarity Tiers

- **Common**: 50-150 XP reward
- **Rare**: 200-300 XP reward
- **Epic**: 400-500 XP reward
- **Legendary**: 1000 XP reward

## Auto vs Manual

- **Auto**: Eligibility is checked by the system (`app/src/services/achievement-checker.ts`). Users claim from the dashboard when eligible.
- **Manual**: Admin-only. Awarded via the Admin panel's "Award" button. Never auto-checked.

## Adding a New Achievement

1. Create `{achievement-id}.json` in this directory following the existing format
2. Add a new entry to `ACHIEVEMENT_DEFINITIONS` in `app/src/services/gamification.ts`
3. Add a new rule to `ACHIEVEMENT_RULES` in `app/src/services/achievement-checker.ts`
4. Create the achievement type on-chain via Admin panel or `scripts/setup-achievements.ts`
5. Update `scripts/setup-achievements.ts` with the new definition

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

## Setup Script

```bash
npx tsx scripts/setup-achievements.ts
```

Bulk-creates all 12 achievement types on-chain via the backend API. Reads env from `app/.env.local`. Skips already-existing achievements gracefully.
