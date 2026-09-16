// A debug APK is signed with a throwaway key, so it can never be installed over an existing app.
// These pin the parts that let a release install as an update instead: one stable key, a version
// code that always rises, and a key that never lands in the repository.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
assert(gradle.includes('signingConfigs'), 'release signing must be configurable');
assert(/IRONSIX_KEYSTORE_PATH|keystore\.properties/.test(gradle), 'the key comes from the environment or a git-ignored file');
assert(gradle.includes('if (ironSixSigningReady) signingConfig signingConfigs.release'), 'release builds use the key when one is configured');
assert(gradle.includes('versionCode ironSixVersionCode') && gradle.includes('versionName ironSixVersionName'), 'version must be overridable per build');
assert(!/storePassword\s+["'][^"']+["']/.test(gradle), 'no password may be hard-coded');

const ignore = fs.readFileSync('.gitignore', 'utf8');
for (const pattern of ['*.jks', '*.keystore', 'android/keystore.properties'])
  assert(ignore.includes(pattern), `${pattern} must stay out of git`);

const workflow = fs.readFileSync('.github/workflows/android-release.yml', 'utf8');
for (const secret of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'])
  assert(workflow.includes(`secrets.${secret}`), `release workflow must read ${secret}`);
assert(workflow.includes('assembleRelease') && workflow.includes('bundleRelease'), 'release workflow builds APK and AAB');
assert(workflow.includes('apksigner') && workflow.includes('--print-certs'), 'the signature and its fingerprint are verified');
assert(/CN=Android Debug/.test(workflow), 'a debug-signed release must fail the build');
// GitHub expressions have no arithmetic, so the version code is computed in the shell.
assert(workflow.includes('IRONSIX_VERSION_CODE=$((1000 + GITHUB_RUN_NUMBER))'), 'version code must always increase');
assert(!/\$\{\{[^}]*[0-9]\s*\+/.test(workflow), 'no arithmetic inside a GitHub expression');
assert(workflow.includes('npm test'), 'a release runs the test suite first');

const docs = fs.readFileSync('ANDROID.md', 'utf8');
assert(docs.includes('Installing updates instead of reinstalling'), 'ANDROID.md explains updating');
assert(docs.includes('keytool -genkeypair'), 'ANDROID.md shows how to create the key');
assert(/sign in and sync, or export a backup/i.test(docs), 'ANDROID.md warns about data before the one required uninstall');
