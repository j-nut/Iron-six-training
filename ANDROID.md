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

The **Android test build** GitHub Actions workflow also builds a test APK and unsigned release bundle using GitHub's preinstalled JDK 21 and Android SDK 36. Its downloadable `iron-six-android-test` artifact is retained for 30 days. It does not publish to Google Play or use a release signing key. Each CI debug build may have a different test signing key; use a stable private release key before distributing updates to users.

`npm run android:bundle` creates an **unsigned** release bundle. Configure your private signing key in Android Studio to make a distributable signed release. Keep signing keys outside this repository. Use the same signing key for future updates, so users can update without uninstalling and losing local-only records. Do not treat a debug APK as a Play Store release.

## Sign-in setup

Email/password sign-in uses the same Supabase accounts as the website. The app uses PKCE and opens social sign-in in the system browser. It accepts authorization codes only at this exact callback:

`com.ironsix.training://auth/callback`

Add that exact URI to the Supabase Auth redirect allowlist. Configure provider credentials using `supabase/SOCIAL_SIGN_IN.md`. Provider callbacks still use Supabase's HTTPS callback, not the app's custom URI. Request and open confirmation, password reset and email sign-in links on the same device/app that initiated them. A link opened on another device cannot complete that app's PKCE exchange; start again on the target device.

Google, Apple, Microsoft and GitHub are not activated merely by building an APK. Their existing configuration requirements remain. Real provider sign-in needs end-to-end testing after those settings are enabled.

## Native behavior

- Android Back closes dialogs, returns to Today, then minimizes the app.
- The screen stays awake while Iron Six is foregrounded. Leaving the app pauses and checkpoints the circuit; resuming does not skip unseen work intervals.
- Supabase token refresh pauses in the background and resumes when the app is active.
- Export backup opens Android's document picker and saves to a destination selected by the user. It requires no broad file access permission.
- The app forbids cleartext traffic, keeps server code and secrets out of the APK, and does not load the website as a remote WebView page.
- Android and browser guest storage are separate. Sign in and explicitly import guest records to share them through cloud sync. Do that before uninstalling or clearing app storage. Android system backup is disabled to avoid copying session credentials; cloud sync and explicit exports provide backup.

## Verification before distribution

The JavaScript tests cover native routing, callback validation, duplicate callbacks, background pause, safe export and packaged asset completeness. Also build with Android Studio and test on a physical device: sign-in and return, cold-start callback, set logging followed by force-stop/reopen, offline edits followed by sync, a complete circuit with sound and app switching, Back behavior and backup export. Test upgrades with the intended signing key. A successful JavaScript test run alone does not verify the Android binary.

This initial project has not yet produced a verified APK in the development environment because installation of JDK 21 was blocked by automatic approval review. The environment only has JDK 17. The Vercel release push succeeded, but manual production deployment was also blocked by automatic approval review. These are build/deployment limitations, not completed release steps.
