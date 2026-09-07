# Iron Six workout music

Iron Six exposes three music lanes:

1. **Iron Six Radio** — Audius discovery/streaming through `/api/music`. The server filters out gated/unlisted tracks and only returns tracks whose Audius `license` metadata indicates commercial use is allowed. Tracks with missing/unclear license metadata, All Rights Reserved, or NonCommercial terms are excluded.
2. **Iron Six Originals** — first-party or separately licensed tracks listed in `music-originals.js`. Do not add a track unless commercial rights to both the sound recording and underlying composition are documented.
3. **Spotify** — optional external launch only. The current implementation does not depend on Spotify playback APIs or a Spotify subscription.

The Audius creator can disable API streaming at the platform level. Iron Six does not cache or rehost Audius recordings; playback uses the Audius stream endpoint and keeps artist/title/license attribution visible in the app.

Music must remain independent from workout timing. Circuit timers, cues, pausing, and workout persistence must continue to work if radio is unavailable or the user plays music in another app.
