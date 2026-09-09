# Iron Six New Illustration Progress

Source of truth: `exercise-registry.js` on `main`.

Rules for this replacement set:
- Use only exact canonical exercise names from the registry.
- No invented exercises.
- No commercial-gym machines/cable stacks unless they are explicitly part of the canonical exercise/equipment definition.
- Use the approved Iron Six visual system: dark navy studio background, gray faceless clothed mannequin, 3-stage START / MIDPOINT / TOP form guide.
- Verify grip, fingers, wrists, joint alignment, stance, and equipment contact before accepting an image.
- Do not regenerate a checked item unless it is intentionally rejected for quality.

## Checklist

- [x] 1½-Rep Bodyweight Squat
- [x] Ab Wheel Rollout
- [x] Band Chest Fly
- [x] Band Curl
- [x] Band Face Pull
- [x] Band Hammer Curl
- [x] Band Hamstring Curl
- [x] Band Lat Pulldown
- [x] Band Lateral Raise
- [x] Band Pallof Press
- [x] Band Pressdown
- [x] Band Row
- [x] Band Straight-Arm Pulldown
- [x] Banded Hip Thrust
- [x] Barbell Back Squat
- [x] Barbell Bench Press
- [x] Barbell Box Squat
- [x] Barbell Curl
- [x] Barbell Good Morning
- [x] Barbell Hip Thrust
- [x] Barbell Overhead Press
- [x] Barbell Romanian Deadlift
- [x] Barbell Row
- [x] Barbell Standing Calf Raise
- [x] Bodyweight Curl Isometric
- [x] Bodyweight Split Squat
- [x] Chest-Supported Dumbbell Row
- [x] Chin-Up
- [x] Close-Grip Bench Press
- [x] Close-Grip Push-Up
- [x] Cyclist Squat
- [x] Diamond Push-Up
- [x] Dumbbell Bench Press
- [x] Dumbbell Bulgarian Split Squat
- [x] Dumbbell Curl
- [x] Dumbbell Flat Press
- [x] Dumbbell Fly
- [x] Dumbbell Front Squat
- [x] Dumbbell Hammer Curl
- [x] Dumbbell Hip Thrust
- [x] Dumbbell Lateral Raise
- [x] Dumbbell Pullover
- [x] Dumbbell Rear-Delt Fly
- [x] Dumbbell Rear-Delt Row
- [x] Dumbbell Romanian Deadlift
- [x] Dumbbell Shoulder Press
- [x] Dumbbell Skull Crusher
- [x] Feet-Elevated Push-Up
- [x] Goblet Squat
- [x] Half-Kneeling Landmine Press
- [x] Hamstring Walkout
- [x] Hard-Style Plank
- [x] High-Bar Back Squat
- [x] Incline Barbell Bench Press
- [x] Incline Dumbbell Curl
- [x] Incline Dumbbell Press
- [x] Isometric Lat Press
- [x] Landmine Hack Squat
- [x] Landmine Press
- [x] Landmine Reverse Lunge
- [x] Landmine Romanian Deadlift
- [x] Landmine Rotation
- [x] Landmine Row
- [x] Landmine Squat
- [x] Landmine T-Bar Row
- [x] Lean-Away Lateral Raise
- [x] Meadows Row
- [x] One-Arm Dumbbell Row
- [x] Paused Barbell Back Squat
- [x] Paused Barbell Bench Press
- [x] Pendlay Row
- [x] Pike Push-Up
- [x] Plank
- [x] Prone Lat Pull
- [x] Prone Y-T Raise
- [x] Pull-Up
- [x] Push-Up
- [x] Single-Leg Calf Raise
- [x] Single-Leg Glute Bridge
- [x] Single-Leg Hip Hinge
- [x] Tempo Bodyweight Squat
- [x] Tempo Push-Up
- [x] Towel Isometric Curl
- [x] Weighted Standing Calf Raise
- [x] Wide Push-Up

## Status

- Professional illustration generation: **85 / 85 complete**.
- Isometric Lat Press uses the approved self-resisted cue treatment (`SET → PRESS DOWN → HOLD / SQUEEZE`).
- App integration is the remaining step: copy the approved PNGs into the app's media asset set, map them to the existing canonical `mediaId` values, mark those manifest records `approved`, run the media coverage tests/audit, then deploy.

## Notes

Images created previously for exercises that are not canonical registry entries (for example machine/cable variants, Arnold press, front raise, side plank, mountain climber, etc.) do **not** count toward this checklist and should not be wired into the replacement library.
