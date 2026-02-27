# Course Create & Update Flow — Production Vision

## Current State (Pre-Arweave)

- Course content lives in **Sanity CMS** (editable, mutable)
- `contentTxId` on-chain is set to the Sanity document `_id` as a placeholder
- No immutable content snapshot exists

---

## On-Chain Field Mutability

Verified against the on-chain program source code:

**`create_course.rs`** — Sets all fields at init. No update path for these:

| Field | Type | Immutable | Notes |
|-------|------|-----------|-------|
| `course_id` | String | Yes | PDA seed — cannot change without new PDA |
| `creator` | Pubkey | Yes | XP reward recipient wallet |
| `lesson_count` | u8 | Yes | Max 255. Changing requires new course PDA |
| `difficulty` | u8 | Yes | 1=beginner, 2=intermediate, 3=advanced |
| `track_id` | u16 | Yes | Numeric track identifier |
| `track_level` | u8 | Yes | Level within track (1–3) |
| `prerequisite` | Option\<Pubkey\> | Yes | Course PDA of prerequisite |
| `bump` | u8 | Yes | PDA bump, set once |

**`update_course.rs`** — `UpdateCourseParams` defines what CAN change:

| Field | Type | Mutable | Notes |
|-------|------|---------|-------|
| `content_tx_id` | [u8; 32] | Yes | Arweave tx ID. Increments `version` on change |
| `is_active` | bool | Yes | Deactivate/reactivate course |
| `xp_per_lesson` | u32 | Yes | Can adjust rewards post-launch |
| `creator_reward_xp` | u32 | Yes | Can adjust creator incentives |
| `min_completions_for_reward` | u16 | Yes | Can adjust threshold |

**Not in `UpdateCourseParams`** = immutable. The program has no instruction to change `lesson_count`, `difficulty`, `creator`, `track_id`, `track_level`, or `prerequisite` after creation.

---

## Production Flow: Course Creation

```
Creator (Sanity Studio)
│
│  1. Writes course content: title, description, modules, lessons, challenges
│  2. Sets on-chain params: xpPerLesson, lessonCount, trackId, trackLevel,
│     creator wallet, creatorRewardXp, minCompletionsForReward
│  3. Clicks "Publish" in Sanity Studio
│     → Webhook fires → submissionStatus = "waiting"
│
▼
Admin (Dashboard → Course Management)
│
│  4. Reviews course in admin dashboard (preview button)
│  5. Verifies:
│     - lessonCount matches actual count(modules[].lessons[])
│     - creator wallet is valid base58 Solana address
│     - trackId/trackLevel match the referenced track
│     - Content quality is acceptable
│  6. Opens Approve modal → can override xpPerLesson, creatorRewardXp,
│     minCompletionsForReward (the three admin-overridable params)
│
│  ┌─── APPROVE ─────────────────────────────────────────────────┐
│  │                                                             │
│  │  7a. Backend snapshots course content from Sanity into a    │
│  │      canonical JSON bundle:                                 │
│  │      {                                                      │
│  │        courseId, title, description, longDescription,        │
│  │        difficulty, modules: [{                               │
│  │          title, description, order, lessons: [{              │
│  │            title, slug, type, duration, content,             │
│  │            videoUrl, challenge: { prompt, starterCode,       │
│  │            solution, testCases, hints, language }            │
│  │          }]                                                  │
│  │        }]                                                    │
│  │      }                                                      │
│  │                                                             │
│  │  7b. Upload bundle to Arweave via Irys (formerly Bundlr)   │
│  │      → Returns Arweave transaction ID (43 chars base64)     │
│  │      → Encode as 32-byte content_tx_id for on-chain         │
│  │                                                             │
│  │  7c. Call create_course on-chain:                            │
│  │      - content_tx_id = Arweave tx ID                        │
│  │      - All params from Sanity (no fallbacks)                │
│  │      - Admin overrides for the three editable params        │
│  │                                                             │
│  │  7d. Update Sanity:                                          │
│  │      - submissionStatus = "approved"                        │
│  │      - published = true                                      │
│  │      - arweaveTxId = Arweave tx ID (new field, for ref)     │
│  │      - onChainTxSignature = Solana tx sig (new field)       │
│  │      - Final param values written back                      │
│  └─────────────────────────────────────────────────────────────┘
│
│  ┌─── REJECT ──────────────────────────────────────────────────┐
│  │  Admin adds review comment                                  │
│  │  submissionStatus = "rejected"                              │
│  │  Creator sees feedback in Sanity Studio                     │
│  │  Creator edits → re-publishes → webhook → "waiting" again   │
│  └─────────────────────────────────────────────────────────────┘
```

---

## Production Flow: Course Content Update

When a creator edits an already-approved course:

```
Creator edits in Sanity Studio → publishes
│
▼
Webhook fires
│
├─ If submissionStatus == "approved":
│  │
│  │  Option A: Auto-update (content-only changes)
│  │  ─────────────────────────────────────────────
│  │  Detect what changed. If ONLY content fields changed
│  │  (title, description, lesson content, challenge text)
│  │  and NOT structural fields (lesson count, module count):
│  │
│  │  1. Re-snapshot content → upload to Arweave → new tx ID
│  │  2. Call update_course(new_content_tx_id) on-chain
│  │     → course.version increments automatically
│  │  3. Update Sanity arweaveTxId field
│  │  4. Course stays approved, no admin intervention
│  │
│  │  Option B: Structural change requires re-review
│  │  ───────────────────────────────────────────────
│  │  If lesson count changed or modules were added/removed:
│  │
│  │  1. submissionStatus → "waiting" (re-enters review queue)
│  │  2. Admin must re-review and re-approve
│  │  3. CRITICAL: If lessonCount changed, the existing on-chain
│  │     Course account CANNOT be updated (lesson_count is immutable).
│  │     Options:
│  │     a) Deactivate old course, create new Course PDA
│  │        (breaks existing enrollments)
│  │     b) Add migrate_course instruction to on-chain program
│  │        (future enhancement)
│  │     c) Reject the change — tell creator lessonCount is locked
│  │
│  │  Decision: For v1, go with option (c). Creators cannot change
│  │  lesson count after approval. They must get it right before
│  │  submitting. Document this clearly in Sanity field descriptions.
│
├─ If submissionStatus is null or "waiting":
│  │  Normal first-time submission flow
│  │  submissionStatus → "waiting"
│
└─ If submissionStatus == "rejected":
   │  Creator is re-submitting after revision
   │  submissionStatus → "waiting"
```

---

## Production Flow: Admin Param Update

No Arweave involved — just on-chain + Sanity:

```
Admin clicks "Update Params" in dashboard
│
├─ Can change: xpPerLesson, creatorRewardXp, minCompletionsForReward
│
├─ 1. Update Sanity document with new values
├─ 2. Call update_course on-chain with changed fields
│     (only sends non-null fields, program applies selectively)
└─ 3. Course stays approved, no re-review needed
```

---

## Production Flow: Deactivation & Reactivation

```
Deactivate:
  1. Call update_course(new_is_active: false) on-chain
  2. Update Sanity: submissionStatus = "deactivated", published = false
  3. Course hidden from catalog, existing enrollments preserved but frozen

Reactivate (future):
  1. Admin clicks "Reactivate" in dashboard
  2. Call update_course(new_is_active: true) on-chain
  3. Update Sanity: submissionStatus = "approved", published = true
  4. Course reappears in catalog, enrollments resume
```

---

## Arweave Integration Checklist (When Ready)

- [ ] Add `@irys/sdk` to backend dependencies
- [ ] Add `IRYS_PRIVATE_KEY` and `IRYS_RPC_URL` env vars
- [ ] Create `backend/src/lib/arweave.ts` — snapshot Sanity content + upload
- [ ] Add `arweaveTxId` field to Sanity course schema (read-only, set by system)
- [ ] Add `onChainTxSignature` field to Sanity course schema (read-only)
- [ ] Update `create-course` backend route to accept Arweave tx ID
- [ ] Update admin approve flow to: snapshot → upload → create_course
- [ ] Update webhook to handle content re-upload for approved courses
- [ ] Add content verification endpoint: fetch Arweave → compare with on-chain hash

---

## Webhook Enhancement Needed

Currently the webhook (`app/src/app/api/webhooks/sanity/route.ts`) only:
- Sets `submissionStatus = "waiting"` for courses without a status
- Revalidates cache tags

For production, it needs to:
1. Detect edits to **approved** courses
2. Determine if the edit is content-only or structural
3. For content-only: trigger auto re-upload to Arweave + on-chain update
4. For structural (lesson count change): set status back to "waiting"

This requires the webhook to receive the **full document** (or a diff) from Sanity,
not just the document type. Configure the Sanity webhook projection to include
`submissionStatus`, `lessonCount`, and a content hash for change detection.
