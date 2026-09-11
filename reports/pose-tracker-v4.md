# Pose tracker v4

The opt-in Iron Six camera assistant now uses motion-aware subject association instead of the original strict all-landmarks lock.

## Association model

The implementation is a lightweight JavaScript tracker inspired by the useful ideas in ByteTrack, OC-SORT and Norfair without copying their runtime dependencies. It keeps MediaPipe Pose as the detector and associates one exercise subject using:

- constant-velocity center prediction over short gaps;
- body-scale continuity;
- bounding-box overlap;
- weighted distance between only the keypoints visible in both observations;
- high-confidence association plus low-confidence recovery for an already-locked subject;
- ambiguity pausing rather than arbitrary person selection;
- a 950 ms coast window that keeps identity but emits no invented landmarks;
- explicit re-lock after sustained loss.

No face recognition, appearance embeddings, biometric identity, image upload, landmark upload or network tracking is used.

## Side-profile changes

A true side profile can acquire from one usable shoulder/hip/knee/ankle chain even when the far-side landmarks are weak. Per-keypoint association can use confidence down to 0.18 for maintaining identity, while exercise measurements retain their own stricter visibility requirements.

MediaPipe Pose Landmarker was also changed from 0.70/0.70/0.70 detection/presence/tracking thresholds to 0.45/0.45/0.50 so a side-profile pose is not discarded before the subject tracker can evaluate it.

## Rep/form separation

Subject identity, rep measurement and form analysis are intentionally separate. A weak frame can preserve the subject track while providing no usable knee angle. Short uncertainty therefore does not automatically become a new person or erase a completed rep, while sustained uncertainty still resets the in-progress measurement.

## Regression coverage

`tests/pose-subject-tracker-v4.test.js` covers:

- true side-profile acquisition with the far side hidden;
- low-confidence recovery of the existing subject;
- resistance to a distant high-confidence bystander;
- brief total occlusion without invented landmarks;
- sustained loss requiring explicit re-lock;
- overlapping plausible people pausing rather than selecting by array order.

The tracker remains behind the existing `?pose=1` opt-in flag until real-device validation is complete.
