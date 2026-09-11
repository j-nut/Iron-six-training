# Camera workout assistant v3

This branch extends the opt-in `?pose=1` camera spike with conservative camera-visible form observations and hands-free set logging. It remains off by default.

## Scope

- Rep counting and subject/working-side locking remain on-device and keep the v2 interruption/re-lock rules.
- Squat form watch uses only confidence-gated shoulder/hip/knee/ankle landmarks from the locked working side. It can flag repeated depth inconsistency, large torso-angle changes from setup, hips rising ahead of the chest, and unusually fast descents. These are observations, not injury/safety diagnoses.
- Curl, push-up and overhead-press form watch is deliberately limited to repeated unusually fast reps until view-specific geometry has been validated on real phones.
- Voice is opt-in. Commands write through the existing set inputs/buttons so journal, save, calibration and cloud-adaptation behavior remain canonical.
- Video frames and pose landmarks are not uploaded by this feature. Browser/Android speech recognition may use the platform provider's network service; Iron Six does not store microphone audio.

## Voice commands

Examples: `185 pounds`, `one eighty five pounds`, `185 for 8`, `8 reps`, `RIR 2`, `8 reps two reps in reserve`, `bodyweight`, `set done`, `move on`, `previous exercise`, `re-lock`, and `stop voice`.

A bare number such as `12` is intentionally ignored because it is ambiguous. `Set done` requires an actual rep count from speech, a manually persisted reps value, or at least one camera-counted rep; a prefilled target is not treated as completed work.

## Android

The native build registers a small `VoiceCommand` Capacitor plugin around Android `SpeechRecognizer`. It requests microphone permission only when voice is enabled, prefers on-device recognition when Android reports it available, and destroys the recognizer after every one-shot command. The manifest adds camera and microphone permissions plus the recognition-service query required for Android 11+ discovery.

## Acceptance checks before merging to production

1. Bodyweight squat, 10 deliberate reps: count must match or under-count; no phantom reps while standing still.
2. Another person crosses the background: tracker must pause/re-lock rather than jump people.
3. Deliberately vary squat depth for several reps: a depth-consistency observation should appear only after completed, repeated evidence.
4. Deliberately pitch the torso more on two reps: a torso cue should appear after repeated evidence; normal reps should not invent a problem.
5. Voice: say `185 pounds`, `8 reps`, `RIR 2`; verify the exact current set fields and saved journal update.
6. Voice: say `set done`; verify the set completes, next-set recommendations recalculate, and the camera starts a fresh rep/form set without losing the subject lock.
7. Voice: with only the prefilled target reps and no camera count, say `set done`; it must refuse to complete.
8. Complete the final set and say `set done`; verify the focused workout moves to the next exercise/review.
9. Deny microphone permission: camera/form watch must continue and no set data changes.
10. Hide/background/close the app during listening: camera and voice must stop.
11. Android: install the test APK, repeat checks 1-10, and confirm whether the voice UI reports on-device Android or Android speech service.

Do not market the form watch as proving an exercise is safe, detecting every form fault, or uniquely identifying a person. Real-device trainer review remains required before broadening rules or enabling the feature by default.
