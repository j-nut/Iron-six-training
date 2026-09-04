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

## Architecture

This repository is the source of truth for the Iron Six web app. Vercel should deploy from `main`. Supabase will provide authentication and persistent training data once the backend migration is complete.

No secrets or private API keys should ever be committed to this repository.
