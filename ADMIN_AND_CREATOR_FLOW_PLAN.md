# Admin Flow — Full Implementation Plan

## Context

The admin page (`/admin`) currently shows **hardcoded mock data** — no real queries, no access control, no admin-specific API routes. The bounty lists "Admin dashboard for course management and user analytics" as a **bonus feature** (point 7 also mentions "CMS Course creator dashboard"). The `is_admin` column already exists on `profiles` (migration 002) but is unused.

The Sanity CMS has a `published` boolean on courses but **no review/approval workflow**. Creators currently publish directly. We need a **course lifecycle** where creators submit → admin reviews → admin registers on-chain → course goes live.

**Goal:** Build a real admin dashboard with access control, live data, user management, and a **course approval + on-chain registration** workflow. Also add a course status field to Sanity for the review pipeline.

---

## What Already Exists

| Component | Status |
|-----------|--------|
| `profiles.is_admin` column | **Exists** in DB (migration 002) |
| Admin page UI shell | Mock data only (`app/src/app/[locale]/admin/page.tsx`) |
| Sanity course schema | Full schema with `published` boolean + on-chain params |
| Sanity write token | **Available** (`SANITY_API_TOKEN`) — used in seed script |
| `requireAuth()` guard | **Exists** (`lib/api/auth-guard.ts`) |
| `getAdminClient()` | **Exists** (`lib/supabase/admin.ts`) |
| Backend `create_course` | **Not implemented** — program supports it but no backend route |

---

## Course Lifecycle (New)

```
Creator submits in Sanity Studio
         ↓
  status: "submitted" (published: false)
         ↓
  Appears in Admin → Course Management tab
         ↓
  Admin reviews content, adjusts on-chain params
         ↓
  ┌─── APPROVE ───────────────────── REJECT ──┐
  │                                             │
  Admin clicks "Register On-Chain"        Admin adds rejection comment
  → Backend calls `create_course`         → Status set to "rejected"
  → status: "active"                      → Creator sees feedback in Studio
  → published: true
  → Course live for learners
```

### Sanity Schema Changes

Add `status` field to course schema (`app/sanity/schemaTypes/course.ts`):
```
status: "draft" | "submitted" | "active" | "rejected" | "archived"
```
- **draft** — Creator still editing (default)
- **submitted** — Creator requests review (sets `published: false`)
- **active** — Admin approved + registered on-chain (sets `published: true`)
- **rejected** — Admin rejected with comment
- **archived** — Admin deactivated

Add `reviewComment` (text) field for admin feedback on rejection.

### Creator Flow

**Content creation:** Creators use **Sanity Studio** to write courses, modules, and lessons. They set status to "submitted" when ready for review.

**Creator dashboard** (`/creator`): An in-app page where creators see their courses, pipeline status, and stats. Matched by the `creator` wallet field on the Sanity course document — no Sanity user linking needed. Shows:
- Their submitted/active/rejected courses with status badges
- Review comments from admin on rejected courses
- Stats per course: enrollments, completions, XP distributed
- Link to Sanity Studio to edit content

This satisfies bounty bonus point 7 ("CMS Course creator dashboard").

---

## Implementation Steps

### Step 1: Add `isAdmin` to Session

**Files:**
- `app/src/types/next-auth.d.ts` — Add `isAdmin?: boolean` to Session interface
- `app/src/lib/auth.ts` — In JWT callback, fetch `profiles.is_admin`, store in `token.isAdmin`, surface in `session.isAdmin`

### Step 2: Admin Guard

**File:** `app/src/lib/api/auth-guard.ts` — Add `requireAdmin()` alongside existing `requireAuth()`

Returns 401 if not authenticated, 403 if not admin.

### Step 3: Admin Navigation Link

**File:** `app/src/components/auth/user-menu.tsx`

Conditionally show admin link when `session.isAdmin` — Shield icon + link before Settings.

### Step 4: Admin Page Access Guard (Server + Client)

**Files:**
- `app/src/app/[locale]/admin/layout.tsx` — **NEW** server-side layout: checks session via `auth()`, redirects non-admins to `/dashboard` before rendering
- `app/src/app/[locale]/admin/page.tsx` — Client-side `useSession()` as fallback (handles edge case where session loads async)

### Step 5: Sanity Schema Update

**File:** `app/sanity/schemaTypes/course.ts`

- Add `status` string field with options: draft, submitted, active, rejected, archived (default: "draft")
- Add `reviewComment` text field (admin feedback on rejection)
- Keep existing `published` field — `active` status sets it to true

### Step 6: Admin API Routes

#### `app/src/app/api/admin/stats/route.ts` — GET
Real stats: total users, active this week, total XP distributed, course count.

#### `app/src/app/api/admin/users/route.ts` — GET
Paginated user list (`profiles` + `user_stats`). Search, sort, pagination.

#### `app/src/app/api/admin/users/[id]/route.ts` — GET, PATCH
- GET: User detail with linked accounts
- PATCH: Toggle `is_admin`

#### `app/src/app/api/admin/courses/route.ts` — GET
All courses from Sanity (including non-published) with XP stats from `xp_transactions`.

#### `app/src/app/api/admin/courses/[courseId]/route.ts` — PATCH
Admin actions on a course:
- **approve** — Update Sanity: status → "active", published → true. Calls backend to register on-chain via `create_course`.
- **reject** — Update Sanity: status → "rejected", add reviewComment
- **archive** — Update Sanity: status → "archived", published → false. Calls backend `update_course(is_active: false)`.
- **update** — Modify on-chain params before approval (xpPerLesson, creatorRewardXp, minCompletionsForReward)

Uses Sanity write client with `SANITY_API_TOKEN`.

#### `app/src/app/api/admin/analytics/route.ts` — GET
Time-series: XP per day, enrollments per day. `?period=7|30`.

### Step 7: Backend Route for On-Chain Course Registration

**File:** `backend/src/routes/create-course.ts` — NEW

POST endpoint that:
1. Accepts course params (courseId, creator, lessonCount, difficulty, xpPerLesson, trackId, trackLevel, prerequisite, creatorRewardXp, minCompletionsForReward, contentTxId)
2. Builds and sends `create_course` instruction signed by backend signer (which must be the authority or delegated)
3. Returns transaction signature

**Note:** On-chain `create_course` requires `config.authority` signer. If backend signer ≠ authority, this needs the authority to sign (Squads multisig). For devnet, backend signer IS the authority. For mainnet, this would need Squads integration.

Also add: `backend/src/routes/update-course.ts` for `update_course` instruction.

Register new routes in `backend/src/index.ts`.

### Step 8: Rewrite Admin Page

**File:** `app/src/app/[locale]/admin/page.tsx` — Full rewrite

**Tab 1: Overview**
- 4 stat cards from `/api/admin/stats`
- Bar charts for weekly enrollment + XP from `/api/admin/analytics`

**Tab 2: User Management**
- Searchable, sortable, paginated table
- Columns: Avatar+Name, Email/Wallet, XP, Level, Joined, Admin badge
- Toggle admin action

**Tab 3: Course Management**
- Table showing ALL courses (including submitted/rejected)
- Columns: Title, Status badge (color-coded), Course ID, Track, Difficulty, Enrollments, XP Distributed
- Status filter dropdown (all / submitted / active / rejected / draft)
- Row actions:
  - **submitted** → "Approve" (registers on-chain) / "Reject" (opens comment dialog)
  - **active** → "Archive" / "Edit Params"
  - **rejected** → "Re-review"
- Expandable row detail: on-chain params, creator info, review comment

### Step 9: Creator Dashboard Page

**Files:**
- `app/src/app/[locale]/creator/page.tsx` — **NEW** creator dashboard
- `app/src/app/api/admin/courses/creator/route.ts` — **NEW** GET endpoint returning courses filtered by `creator` wallet matching session's `walletAddress`

The page shows:
- List of creator's courses with status badges (draft, submitted, active, rejected)
- Review comments on rejected courses
- Per-course stats (enrollments, completions, XP distributed) for active courses
- "Edit in Sanity Studio" link per course
- Requires auth (any authenticated user with linked wallet), not admin-only

### Step 10: i18n Keys

**Files:** `en.json`, `pt-BR.json`, `es.json`

Expand admin section: search, pagination, column headers, status labels, action buttons, course lifecycle labels, empty states.

---

## Files Summary

| Action | File |
|--------|------|
| MODIFY | `app/src/types/next-auth.d.ts` |
| MODIFY | `app/src/lib/auth.ts` |
| MODIFY | `app/src/lib/api/auth-guard.ts` |
| MODIFY | `app/src/components/auth/user-menu.tsx` |
| MODIFY | `app/src/app/[locale]/admin/page.tsx` (full rewrite) |
| MODIFY | `app/sanity/schemaTypes/course.ts` |
| MODIFY | `app/src/messages/en.json` |
| MODIFY | `app/src/messages/pt-BR.json` |
| MODIFY | `app/src/messages/es.json` |
| MODIFY | `backend/src/index.ts` (register new routes) |
| CREATE | `app/src/app/[locale]/admin/layout.tsx` (server-side guard) |
| CREATE | `app/src/app/[locale]/creator/page.tsx` (creator dashboard) |
| CREATE | `app/src/app/api/admin/stats/route.ts` |
| CREATE | `app/src/app/api/admin/users/route.ts` |
| CREATE | `app/src/app/api/admin/users/[id]/route.ts` |
| CREATE | `app/src/app/api/admin/courses/route.ts` |
| CREATE | `app/src/app/api/admin/courses/[courseId]/route.ts` |
| CREATE | `app/src/app/api/admin/courses/creator/route.ts` |
| CREATE | `app/src/app/api/admin/analytics/route.ts` |
| CREATE | `backend/src/routes/create-course.ts` |
| CREATE | `backend/src/routes/update-course.ts` |

---

## Verification

1. Set your profile as admin: `UPDATE profiles SET is_admin = true WHERE email = '...';`
2. Sign in → admin link appears in user menu dropdown
3. `/admin` loads real stats, user table, course table, analytics charts
4. Non-admin user → `/admin` redirects to `/dashboard`
5. API routes return 403 for non-admin users
6. In Sanity Studio: create a course, set status to "submitted"
7. In admin dashboard: course appears in Course Management with "submitted" badge
8. Click "Approve" → course registered on-chain, status → "active", visible to learners
9. Click "Reject" on another → enters comment, status → "rejected"
10. Build passes: `npx next build`
11. Backend builds: `cd backend && npm run build`
