# Prerequisite Enrollment PDA Issue

## Problem

When a course has a prerequisite, `enroll.rs` requires the prerequisite's enrollment PDA with `completed_at` set. However, enrollment PDAs are closed (deleted) after credential issuance via `close_enrollment`. This makes it impossible to enroll in courses that require completed prerequisites once the prerequisite enrollment is closed.

## Root Cause

`enroll.rs` validates prerequisites by fetching the prerequisite course's enrollment PDA and checking `completed_at.is_some()`. After a learner collects their credential, the enrollment PDA can be closed to reclaim rent. Once closed, the PDA no longer exists, and the prerequisite check fails.

## Impact

- Learners who close their prerequisite enrollment cannot enroll in dependent courses
- This creates a permanent lock-out with no recovery path

## Suggested On-Chain Fix

Allow credential NFT ownership as an alternative prerequisite proof:

1. Accept an optional `prerequisite_credential` account in `enroll`
2. If the prerequisite enrollment PDA does not exist, verify the learner owns a credential NFT from the prerequisite course's track collection
3. Validate the credential's `completed_course_ids` attribute includes the prerequisite course

This requires an on-chain program change and cannot be fixed at the application layer alone.
