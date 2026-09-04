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

## Architecture

This repository is the source of truth for the Iron Six web app. The static build is deployable through GitHub Pages and can also be deployed to Vercel. Supabase schema/migrations are kept in the repository for cloud persistence.

No secrets or private API keys should ever be committed to this repository.
