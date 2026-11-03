# Exact dumbbell weights

Adds exact weight availability on top of the progression/reliability changes in PR #98. The user owns all their smaller dumbbells through 30 lb plus 40 and 50 lb, so a 50 lb maximum must not imply ownership of 35 or 45 lb.

## User flow

Profiles → Which dumbbell weights do you have? → Choose exact weights. Toggle the weights you own, use a regular range as a starting point, or add a custom weight. Save profile to apply. The same chooser is available during equipment onboarding. Dumbbell exercise cards have a “Don't have this weight?” shortcut to the chooser.

Weights are pounds per dumbbell. Regular increments remain the default for existing users. Exact mode is opt-in; an empty inventory cannot be saved. Switching back to regular mode clears the exact list deliberately.

## Programming and persistence

The optional capacities.dumbbellWeights array is authoritative when populated. Normalization keeps finite numeric weights from 0.5 through 250 lb, removes duplicates, sorts, and bounds list length. Profile validation rejects malformed/empty lists. Saving derives the maximum from the list and keeps barbell settings separate.

Initial estimates, nearest-weight rounding, next available increases/decreases, history carry-forward, Light/Heavy adjustments, and backoffs use owned weights. A 30 → 40 lb gap uses the existing oversized-jump policy to build reps first. The app does not infer new ownership from logged history when an exact list is configured. Completed and manually entered rows remain intact; newly recommended rows respect the list.

The existing capacities JSON payload carries the list through account sync and backups; no database migration or signing changes are needed. Simulated upload/pull and reload tests cover persistence. Real authenticated cross-device acceptance remains a separate gate.

## Verification

Tests cover 4,860 effort/difficulty/goal scenarios including missing historical 35/45 lb values, regular-increment compatibility, fractional/custom weights, large gaps, lower backoffs, profile save/reload, empty selection, onboarding, and the workout shortcut while preserving saved sets. See the PR for final full-suite/build/CI results. No camera testing is part of this change.
