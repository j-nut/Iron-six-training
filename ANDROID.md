# Iron Six for Android

The Android app uses Capacitor 8 with app ID `com.ironsix.training`. It bundles the workout UI, the approved exercise images and Supabase client locally. Logging and session recovery work without a connection. Groq and cloud backup require internet and use the existing Iron Six Vercel/Supabase services. Website updates require rebuilding the APK to update its bundled UI.

## Build and install

Install Node 22 or newer and Android Studio 2025.2.1 or newer with JDK 21, Android SDK platform 36 and its build tools. Then, from this repository:

```sh
npm ci
npm test
npm run android:sync
npm run android:open
```

In Android Studio, select a connected Android device or emulator and Run. For an installable test APK run `npm run android:apk`; the output is `android/app/build/outputs/apk/debug/app-debug.apk`. The minimum Android version is 7.0 (API 24). A modern Android System WebView is required.

The **Android test build** GitHub Actions workflow also builds a test APK and unsigned release bundle using GitHub's preinstalled JDK 21 and Android SDK 36. Its downloadable `iron-six-android-test` artifact is retained for 30 days. Debug APKs are for trying a build, not for keeping: **each CI run signs them with a different throwaway key, so a debug APK can never be installed over an existing install** — Android rejects it and you have to uninstall first, losing anything stored only on that device.

## Installing updates instead of reinstalling

Android only installs an update over an app signed with the **same key**, with a **higher version code**. Use the signed release build for anything you intend to keep using.

### One-time: create your signing key (do this yourself and keep it safe)

Losing this key means no existing install can ever be updated again, so back it up somewhere durable (a password manager or an encrypted backup).

```sh
keytool -genkeypair -v -keystore ironsix-release.jks -alias ironsix   -keyalg RSA -keysize 4096 -validity 10000
```

Keep `ironsix-release.jks` **outside** the repository. `*.jks`, `*.keystore` and `android/keystore.properties` are git-ignored so a key can never be committed by accident.

### One-time: add the key to GitHub

Turn the keystore into one line of text, then add four **repository secrets** under Settings → Secrets and variables → Actions:

```sh
base64 -w0 ironsix-release.jks   # macOS/Git Bash: base64 -i ironsix-release.jks | tr -d '
'
```

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 text printed above |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `ironsix` |
| `ANDROID_KEY_PASSWORD` | the key password you chose (often the same) |

### Building a release

Run the **Android signed release** workflow (Actions → Run workflow, with an optional version name), or push a tag such as `v1.3.0`. It runs the tests, builds, verifies the signature, fails if the build somehow used the debug key, and prints the certificate SHA-256 — that fingerprint must be identical for every release. The `iron-six-android-release` artifact holds:

- `app-release.apk` — sideload it on your phone; later releases install straight over it, keeping your data.
- `app-release.aab` — upload to Google Play.

The version code comes from the workflow run number, so it always increases. The version name comes from the workflow input or the tag.

### Building a signed release locally

Create `android/keystore.properties` (git-ignored):

```properties
storeFile=/absolute/path/to/ironsix-release.jks
storePassword=…
keyAlias=ironsix
keyPassword=…
```

Then `npm run android:sync && cd android && ./gradlew assembleRelease`. Without that file the release build stays unsigned, exactly as before. Bump the version with `-PironSixVersionCode=NN -PironSixVersionName=1.3.1`, keeping the code above the last one you installed.

### Google Play (smoothest for updates)

Uploading the `.aab` to an internal testing track lets testers install from Play and get updates automatically, with no sideloading. Play also re-signs with its own app-signing key, so keep your upload key safe regardless. The unsigned bundle from `npm run android:bundle` cannot be uploaded.

### If a phone still refuses to update

The existing install was signed with a different key (a debug APK, or a key created before this setup). It must be uninstalled once. **Before doing that, sign in and sync, or export a backup** — profiles and workouts live only on the device otherwise. After that first install of a signed release, future releases update in place.

## API host

The app calls the public production domain `https://iron-six-training.vercel.app` for `/api/*`
(`native/runtime.mjs` `API_ORIGIN`). Do not point it at a project-scoped host such as
`iron-six-training-<team>.vercel.app`: those are covered by Vercel deployment protection, which
answers with an SSO redirect or 401, and the Coach, equipment generation, load recalculation, the
post-workout review and sign-in status then fail inside the app while the website keeps working.

## Sign-in setup

Email/password sign-in uses the same Supabase accounts as the website. The app uses PKCE and opens social sign-in in the system browser. It accepts authorization codes only at this exact callback:

`com.ironsix.training://auth/callback`

Add that exact URI to the Supabase Auth redirect allowlist. Configure provider credentials using `supabase/SOCIAL_SIGN_IN.md`. Provider callbacks still use Supabase's HTTPS callback, not the app's custom URI. Request and open confirmation, password reset and email sign-in links on the same device/app that initiated them. A link opened on another device cannot complete that app's PKCE exchange; start again on the target device.

Google, Apple, Microsoft and GitHub are not activated merely by building an APK. Their existing configuration requirements remain. Real provider sign-in needs end-to-end testing after those settings are enabled.

## Native behavior

- Android Back closes dialogs, returns to Today, then minimizes the app.
- Tapping an exercise image enlarges it inside the app, so it does not navigate away from the saved workout.
- The screen stays awake while Iron Six is foregrounded. Leaving the app pauses and checkpoints the circuit; resuming does not skip unseen work intervals.
- Supabase token refresh pauses in the background and resumes when the app is active.
- Export backup opens Android's document picker and saves to a destination selected by the user. It requires no broad file access permission.
- The app forbids cleartext traffic, keeps server code and secrets out of the APK, and does not load the website as a remote WebView page.
- Android and browser guest storage are separate. Sign in and explicitly import guest records to share them through cloud sync. Do that before uninstalling or clearing app storage. Android system backup is disabled to avoid copying session credentials; cloud sync and explicit exports provide backup.

## Verification before distribution

The JavaScript tests cover native routing, callback validation, duplicate callbacks, background pause, safe export and packaged asset completeness. Also build with Android Studio and test on a physical device: sign-in and return, cold-start callback, set logging followed by force-stop/reopen, offline edits followed by sync, a complete circuit with sound and app switching, Back behavior and backup export. Test upgrades with the intended signing key. A successful JavaScript test run alone does not verify the Android binary.

Local APK compilation was blocked because this environment only has JDK 17 and automatic approval review failed on the JDK 21 download. GitHub Actions uses its preinstalled Android toolchain instead; see the Android test build run for compilation, signature verification and artifacts. Physical-device verification and release signing remain separate steps. Source pushes succeeded, but manual Vercel production deployment was blocked by automatic approval review.
