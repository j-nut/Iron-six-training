# Profile deletion and useful history

## Confirmed cause
Production Supabase project btfrkfbxyowglrdwclei had a composite foreign key from workout_entries(user_id, profile_client_id) to profiles(user_id, client_id) with NO ACTION on delete. The UI deleted the parent first. Any saved journal entry therefore blocked deletion, before optional journal cleanup ran. RLS already allowed owners to delete profiles; this was not an authentication-policy problem.

Applied migration profile_journal_delete_cascade on 2026-09-14 and read back ON DELETE CASCADE. No profile or workout rows were deleted by this work. The migration preserves ownership policies and the append-only journal API; only a deliberate parent-profile delete cascades.

## Changes
- Confirm database deletion results, reject stale/missing authentication, serialize deletion against sync, prevent overlapping clicks and guard account changes.
- Reconcile a previously synced profile deleted on another device; keep unsynced local profiles.
- Scope local journal cleanup to the current account.
- Search/filter completed sessions, inspect exact saved sets, compare prior exercise sessions, see a matched real heaviest set, export filtered CSV safely.
- Label saved duration as planned time unless measured elapsed minutes exist; preserve blank vs zero and timed holds.
- Exclude unfinished sets from analytics, cap active calendar weeks at eight, reject future dates for consistency, refresh analytics after redraw, only award rep records against a previous matching load.

## Validation
JavaScript syntax checked before commit. Regression tests added for deletion authentication, zero-row responses, concurrent clicks, account changes, cross-device reconciliation, sync locking, history filtering, exact values, unmatched best-set values, empty/legacy states, profile switching and safe export. Full suite runs through the pull request validation workflow.

## Remaining limits
Actual user deletion is deliberately left to the profile's confirmation UI; no target profile was named.
No browser automation runtime is exposed in this Work session. UI interactions are verified with JSDOM in CI.
Native Android includes the new module through the index script list on its next build; existing APKs need updating for frontend changes.
