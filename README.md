# Iron Six Training

Adaptive strength and hypertrophy trainer.

## Current capabilities

- Multi-user profiles
- Equipment-aware exercise substitutions
- Workout duration presets and custom durations
- Adaptive load suggestions using actual weight, reps, and RIR
- Progressive workout variation rather than random exercise rotation
- Landmine, barbell, dumbbell, bands, pull-up bar, medicine ball, and ab-wheel support
- Six-workout rotation with A/B/C variants
- Context-aware AI Coach with cloud, on-device, and deterministic fallbacks
- Email/password accounts, email confirmation, password recovery, and optional email-link login
- Separate per-account local storage; guest data is imported only by explicit choice
- Every set edit saved immediately to a local journal, then inserted into a secured Supabase table with database acknowledgement and retry
- Append-only workout revisions, archived-session recovery, and downloadable JSON backups
- Traditional sets or guided circuits with warm-up, work/rest intervals, sound cues, pause, skip, and screen-wake support
- Explicit 15/20-minute budgets that prioritize major movements and overdue muscle groups

## Account and workout persistence

Apply `supabase/schema.sql`, then `supabase/workout-journal.sql` for a fresh Supabase project. These tables were applied to the configured Iron Six project on September 5, 2026.

`workout_entries` is the authoritative workout journal. Each input, including an unfinished set or intentional blank, gets an immutable UUID. Authenticated clients have SELECT and INSERT permissions only. RLS checks account ownership, and a composite foreign key enforces profile ownership. Repeated delivery confirms the existing UUID instead of replacing it. `profiles.runtime_state` is a convenience snapshot, not the only copy of workout data.

Device storage (localStorage plus an IndexedDB mirror) queues edits while offline. Only a successful insert or duplicate lookup counts as database confirmation. The interface distinguishes device-only, pending, confirmed, and unavailable-storage states. Reset, mode changes, and workout changes archive rather than delete recorded sessions. Account scopes and asynchronous request guards prevent cross-account uploads. Conflicting profile updates require an explicit choice.

Guest entries are device-only. Clearing browser data before pending uploads finish can still lose those pending entries; no browser app can guarantee zero loss. JSON export is available in History. Supabase backups and restore retention depend on the project's plan and settings.

Configure the production URL in Supabase Auth's site URL and redirect allowlist for confirmation/recovery emails. Use a production SMTP provider for reliable delivery. Leaked-password protection was flagged as disabled by the project security advisor; enable it in Supabase Auth where supported. Never add service-role keys to the client.

## Guided sessions

The planner reserves warm-up, transitions/rest, and cool-down time before allocating working sets. Circuit mode avoids heavy barbell/technical stations, uses 30/30, 40/20, or 45/20 work/transition intervals, and reserves 45 seconds between rounds. Low energy selects the steady pace. The timer uses elapsed timestamps, pauses when hidden, and recovers paused after reload. Browser sound requires an initial tap and may depend on device sound settings. Timer completion never fabricates reps or marks skipped work complete.

## Camera rep counting (experiment, off by default)

An off-by-default spike counts reps from the front camera using on-device pose estimation. Open the app with `?pose=1` to enable it; with the flag off it loads nothing and changes nothing. No frame, image or landmark leaves the device, and it makes no form judgments. It is web-only for now and needs a network connection on first use. See `POSE_SPIKE.md`.

## Verification

`npm ci && npm test` runs engine, DOM interaction, account-isolation, conflict-resolution, offline retry, recovery, time-budget, and timer regression tests. Auth tests use a simulated Supabase client; they do not send emails or exercise the project's SMTP configuration. Live database checks were performed inside a rolled-back transaction for own-account writes, cross-account reads/inserts, parent ownership, and append-only permissions.

## Architecture

This repository is the source of truth for the Iron Six web app. The static build is deployable through GitHub Pages and can also be deployed to Vercel. Supabase schema/migrations are kept in the repository for cloud persistence.

No secrets or private API keys should ever be committed to this repository.
