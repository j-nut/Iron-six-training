# Iron Six workout music

Iron Six exposes three music lanes:

1. **Iron Six Radio** — rights-filtered discovery and streaming through `/api/music`.
2. **Iron Six Originals** — first-party or separately licensed tracks listed in `music-originals.js`. Do not add a track unless commercial rights to both the sound recording and the underlying composition are documented.
3. **Spotify** — optional external launch only. The current implementation does not depend on Spotify playback APIs or a Spotify subscription.

## The rights rule

A track is surfaced only when its own license metadata explicitly permits commercial use. Missing metadata, unclear metadata, All Rights Reserved and any NonCommercial term are all rejected. "Free to listen" is not "free to embed in a commercial app." This gate is never relaxed to make a station look fuller.

`commercialLicense()` in `api/music.js` is the single gate every source passes through. Sources other than Audius must additionally pass `explicitCommercialDeed()`, which requires the license URL to name a specific commercially usable deed (`/licenses/by/`, `/licenses/by-sa/`, `/licenses/by-nd/`, `/publicdomain/zero/`, `/publicdomain/mark/`). Both gates fail closed: an unrecognised payload yields zero tracks, never an unvetted one.

## Station discovery

Earlier versions issued one upstream trending query per genre. After the license filter that often left one or two playable tracks. Radio now pools several upstream queries per station, deduplicates by track id, applies the same strict license gate, then ranks what survives.

Four station families are defined server-side in `api/music.js`:

| Station | Genres pooled | BPM target |
| --- | --- | --- |
| Circuit / Hype | Electronic, House, Techno, Trap, Drum & Bass, Dubstep, Hardstyle, Future Bass | 130–175 |
| Heavy / Strength | Rock, Metal, Hip-Hop/Rap, Electronic, Alternative | 100–160 |
| Focus | Electronic, Techno, House, Alternative | 110–145 |
| Cooldown | Electronic, Alternative | 60–105 |

Each station issues genre trending (week and month), underground discovery, and keyword search fallbacks, bounded to ten upstream calls. Queries run concurrently and independently, so a station stays usable when some of them fail. Ranking favours a BPM inside the station window, a matching station genre, a matching mood tag and a sane track duration.

The legacy `/api/music?genre=Electronic` contract still works and is now pooled the same way. `Match workout` maps live workout state to a station: circuit mode selects Circuit / Hype, low energy selects Focus, and strength-focused workout keys select Heavy / Strength.

The server returns a ranked pool of up to forty tracks and the client shuffles it, so the same station does not replay a fixed order.

## Additional sources

`api/music.js` normalises every source into one track model, so a new provider only has to supply a normaliser and pass both rights gates.

- **ccMixter** — implemented as a normaliser (`cleanCcMixter`) and gated behind the `MUSIC_CCMIXTER` environment variable, which is **off by default**. Its response shape has not yet been verified against the live ccMixter API from a networked environment. Verify a real response, confirm attribution rendering, then enable the flag on a preview deployment before production.
- **Free Music Archive** — not integrated. Only per-track CC0, public-domain or CC BY records would qualify; the catalogue as a whole is not commercially free.
- **Pixabay Music** — not integrated. Its license permits use inside a larger work but restricts standalone redistribution. Confirm the in-app playback model fits their current terms before integrating, and never expose raw downloads.

Do not scrape arbitrary sites, and do not add a source that cannot supply per-track license metadata.

## Attribution

Artist, title, source and license stay visible in the player while a track plays, with a link to the original where the source provides one. Iron Six does not cache or rehost Audius recordings; playback uses the Audius stream endpoint. The Audius creator can disable API streaming at the platform level.

## Independence from the workout

Music must remain independent from workout timing. Circuit timers, cues, pausing and workout persistence must continue to work if radio is unavailable or the user plays music in another app. Regression tests assert that the player never calls workout persistence and never drives the circuit timer.
