# Camera helper loading fix

## Symptom
On the protected Vercel preview, the camera assistant could open while voice reported `Voice parser did not load`.

## Cause
The camera shell was part of the initial page bundle, but the form and voice helpers were requested later as dynamic scripts. That allowed a protected preview to reach a partially loaded state. The helper callback also assumed cached/preloaded helpers could execute synchronously after later state declarations.

## Fix
- Load `pose-form-coach.js` and `workout-voice.js` directly before `pose-spike.js` in `index.html`.
- Cache-bust the camera assistant as `pose-spike.js?v=3`.
- Keep dynamic loading as a fallback and propagate `_vercel_share` when present.
- Defer the already-loaded helper callback to a microtask so preloaded helpers cannot hit the earlier declaration-order hazard.
- Log explicit helper-load failures instead of silently swallowing them.

The camera/form/voice feature remains behind the existing `?pose=1` / `ironSixPoseSpike` opt-in flag. Production is not changed by this branch.
