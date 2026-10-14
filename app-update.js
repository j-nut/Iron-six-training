/* App updates.
 *
 * Android (sideloaded APK): the app asks /api/app-version for the newest signed GitHub Release at
 * launch and on resume (at most every 6 hours), compares it with the installed versionCode, and
 * offers a one-tap update: download through the native AppUpdate plugin (allowlisted URL, SHA-256
 * checked on the phone), then Android's own installer, which only accepts an update signed with
 * the same key. If the native plugin is missing it opens the APK download in the browser instead.
 *
 * Web: the site is always current after a reload, so it watches /release.json and offers a
 * Reload when the published files change. It never reloads by itself mid-workout.
 *
 * The banner is never shown over the setup wizard or an open modal, never blocks logging, and
 * everything saved stays saved: the existing save path runs before the installer opens.
 */
(() => {
  'use strict';
  if (window.__ironSixAppUpdateLoaded) return;
  window.__ironSixAppUpdateLoaded = true;

  const HOUR = 3600 * 1000;
  const CHECK_EVERY = 6 * HOUR, SNOOZE_FOR = 24 * HOUR, WEB_POLL = 10 * 60 * 1000;
  const KEY_CHECKED = 'ironSixUpdateCheckedAt', KEY_LATEST = 'ironSixUpdateLatest', KEY_SNOOZE = 'ironSixUpdateSnooze';
  const APK_URL = /^https:\/\/github\.com\/j-nut\/Iron-six-training\/releases\/download\/android-build-([1-9][0-9]*)\/iron-six\.apk$/;

  // JSDOM and native navigation can close the document while a check is still in flight.
  const alive = () => typeof document !== 'undefined' && !!document?.getElementById;
  const $ = id => (alive() ? document.getElementById(id) : null);
  const native = () => window.IronSixNative || null;
  const isAndroid = () => !!native()?.appInfo;
  const now = () => Date.now();
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  const say = message => { try { if (typeof window.toast === 'function') window.toast(message); else if (typeof toast === 'function') toast(message); } catch (_) {} };

  const state = {
    installed: null, version: '', latest: read(KEY_LATEST)?.android || null, minimum: read(KEY_LATEST)?.minimumAndroidBuild || null,
    kind: null, busy: false, message: '', progress: null, webBaseline: null, webCurrent: null, webDismissed: null, retry: null
  };

  function validLatest(json) {
    const a = json?.android;
    if (!a || !Number.isInteger(a.build) || a.build <= 0) return null;
    const match = APK_URL.exec(String(a.apkUrl || ''));
    if (!match || Number(match[1]) !== a.build || !/^[a-f0-9]{64}$/i.test(String(a.sha256 || ''))) return null;
    const minimum = Number.isInteger(json.minimumAndroidBuild) && json.minimumAndroidBuild > 0 ? json.minimumAndroidBuild : null;
    return { android: { build: a.build, tag: String(a.tag || ''), apkUrl: a.apkUrl, sha256: String(a.sha256).toLowerCase(), publishedAt: a.publishedAt || null }, minimumAndroidBuild: minimum };
  }

  // Setup and modal flows own the screen; the banner waits until they close.
  function blocked() {
    if (!alive()) return true;
    try { if (window.IronSixOnboarding?.isOpen?.()) return true; } catch (_) {}
    return !!document.querySelector('.modal-backdrop.show, dialog[open], #poseSheet.show');
  }

  function decide() {
    if (!isAndroid()) return state.webCurrent && state.webBaseline && state.webCurrent !== state.webBaseline && state.webDismissed !== state.webCurrent ? 'reload' : null;
    const latest = state.latest, installed = state.installed;
    if (!latest || !installed || latest.build <= installed) return null;
    if (state.minimum && installed < state.minimum) return 'unsupported';
    const snooze = read(KEY_SNOOZE);
    if (snooze && snooze.build === latest.build && snooze.until > now()) return null;
    return 'available';
  }

  function injectStyles() {
    if ($('appUpdateStyles')) return;
    const style = document.createElement('style');
    style.id = 'appUpdateStyles';
    style.textContent = `
      #appUpdateBanner{position:fixed;left:12px;right:12px;top:calc(10px + var(--app-safe-top,0px));z-index:25;max-width:560px;margin:0 auto;background:var(--surface);color:var(--text);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.45);padding:12px 14px;display:grid;gap:9px}
      #appUpdateBanner[hidden]{display:none}
      #appUpdateBanner.urgent{border-left-color:#ffb547}
      #appUpdateBanner .au-title{font-weight:850;font-size:14px;line-height:1.35}
      #appUpdateBanner .au-message{color:var(--muted);font-size:12.5px;line-height:1.45}
      #appUpdateBanner .au-message:empty{display:none}
      #appUpdateBanner .au-actions{display:flex;gap:8px;flex-wrap:wrap}
      #appUpdateBanner .au-actions .btn{min-height:44px;padding:10px 16px;flex:0 0 auto}
      #appUpdateBanner .au-progress{height:6px;border-radius:999px;background:var(--surface2);overflow:hidden}
      #appUpdateBanner .au-progress[hidden]{display:none}
      #appUpdateBanner .au-progress span{display:block;height:100%;width:0;background:var(--accent);transition:width .2s}
    `;
    document.head.appendChild(style);
  }

  function banner() {
    if (!alive()) return null;
    let el = $('appUpdateBanner');
    if (el) return el;
    if (!document.body) return null;
    injectStyles();
    el = document.createElement('section');
    el.id = 'appUpdateBanner';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'App update');
    el.innerHTML = '<div class="au-title" id="appUpdateTitle"></div><div class="au-message" id="appUpdateMessage"></div>'
      + '<div class="au-progress" id="appUpdateProgress" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" hidden><span></span></div>'
      + '<div class="au-actions"><button type="button" class="btn primary" id="appUpdateGo"></button><button type="button" class="btn secondary" id="appUpdateLater">Later</button></div>';
    document.body.appendChild(el);
    $('appUpdateGo').addEventListener('click', () => { if (state.kind === 'reload') reload(); else void update(); });
    $('appUpdateLater').addEventListener('click', later);
    return el;
  }

  function render() {
    clearTimeout(state.retry);
    if (!alive()) return;
    state.kind = decide();
    // Keep the profile menu's "Update available" row and avatar dot in step with this state.
    try { window.IronSixProfileMenu?.render?.(); } catch (_) {}
    const el = $('appUpdateBanner');
    if (!state.kind) { if (el) el.hidden = true; return; }
    if (blocked() && !state.busy) {
      if (el) el.hidden = true;
      state.retry = setTimeout(render, 3000);
      return;
    }
    const b = banner(); if (!b) return;
    const latest = state.latest;
    const titles = {
      available: `Update available — build ${latest?.build}`,
      unsupported: 'This version is no longer supported — update to keep syncing',
      reload: 'A new version of Iron Six is ready'
    };
    $('appUpdateTitle').textContent = titles[state.kind];
    $('appUpdateMessage').textContent = state.message;
    b.classList.toggle('urgent', state.kind === 'unsupported');
    const go = $('appUpdateGo');
    go.textContent = state.kind === 'reload' ? 'Reload' : (state.busy ? 'Updating…' : 'Update');
    go.disabled = state.busy;
    // A required update has no snooze; the banner stays but never blocks logging.
    $('appUpdateLater').hidden = state.kind === 'unsupported' || state.busy;
    const bar = $('appUpdateProgress');
    bar.hidden = state.progress == null;
    if (state.progress != null) { bar.setAttribute('aria-valuenow', String(state.progress)); bar.firstElementChild.style.width = state.progress + '%'; }
    b.hidden = false;
  }

  function later() {
    if (state.kind === 'reload') state.webDismissed = state.webCurrent;
    else if (state.kind === 'available' && state.latest) write(KEY_SNOOZE, { build: state.latest.build, until: now() + SNOOZE_FOR });
    state.message = '';
    render();
  }

  async function installedInfo() {
    if (state.installed) return state.installed;
    try { const info = await native().appInfo(); state.installed = info?.build || null; state.version = info?.version || ''; } catch (_) {}
    return state.installed;
  }

  // Android: ask the server which signed build is newest. force bypasses the 6-hour throttle.
  let inFlight = null;
  function check(force = false) {
    if (inFlight && !force) return inFlight;
    const previous = inFlight || Promise.resolve();
    const run = previous.catch(() => {}).then(() => (isAndroid() ? checkAndroid(force) : checkWeb()));
    inFlight = run.finally(() => { if (inFlight === tracked) inFlight = null; });
    const tracked = inFlight;
    return inFlight;
  }

  async function checkAndroid(force) {
    await installedInfo();
    const last = Number(read(KEY_CHECKED)) || 0;
    if (!force && now() - last < CHECK_EVERY) { render(); return { kind: state.kind, cached: true }; }
    try {
      const response = await fetch('/api/app-version', { cache: 'no-store' });
      if (!response?.ok) throw Error('unavailable');
      const json = validLatest(await response.json());
      if (!json) throw Error('invalid');
      write(KEY_LATEST, json); write(KEY_CHECKED, now());
      state.latest = json.android; state.minimum = json.minimumAndroidBuild;
    } catch (_) {
      render();
      return { kind: state.kind, error: true };
    }
    if (force) { try { localStorage.removeItem(KEY_SNOOZE); } catch (_) {} }
    render();
    return { kind: state.kind };
  }

  async function checkWeb() {
    if (typeof fetch !== 'function') return { kind: null, error: true };
    try {
      const response = await fetch('/release.json', { cache: 'no-store' });
      if (!response?.ok) throw Error('unavailable');
      const json = await response.json();
      if (!json || typeof json.files !== 'object') throw Error('invalid');
      const signature = JSON.stringify(Object.keys(json.files).sort().map(name => [name, json.files[name]]));
      if (!state.webBaseline) state.webBaseline = signature;
      state.webCurrent = signature;
    } catch (_) { render(); return { kind: state.kind, error: true }; }
    render();
    return { kind: state.kind };
  }

  // The settings row: bypasses the throttle and always answers.
  async function checkNow() {
    if (state.busy) return { kind: state.kind };
    state.webDismissed = null;
    const result = await check(true);
    if (result.error) say("Couldn't check for updates. Try again when you're online.");
    else if (!result.kind) say("You're up to date");
    return result;
  }

  async function saveFirst() {
    try { window.saveData?.(); } catch (_) {}
    try {
      const flush = window.IronSixJournal?.flush?.();
      if (flush && typeof flush.then === 'function') await Promise.race([flush.catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]);
    } catch (_) {}
  }

  async function fallback(latest) {
    try {
      await native().openUpdateDownload(latest.apkUrl);
      state.message = `Your browser is downloading build ${latest.build}. Open the downloaded file to install it — your workouts stay saved.`;
    } catch (_) {
      state.message = 'Could not open the download. Try again in a moment.';
    }
  }

  async function update() {
    const latest = state.latest, api = native();
    if (state.busy || !latest || !api) return;
    state.busy = true; state.message = 'Saving your training…'; state.progress = null; render();
    await saveFirst();
    let unlisten = null;
    try {
      if (!api.canInstallUpdates?.()) { await fallback(latest); return; }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { state.message = "You're offline. Connect to the internet, then tap Update again."; return; }
      state.message = 'Downloading the update…'; state.progress = 0; render();
      unlisten = await api.onUpdateProgress?.(event => {
        const total = Number(event?.total), received = Number(event?.received);
        if (total > 0 && received >= 0) { state.progress = Math.max(0, Math.min(100, Math.round(received / total * 100))); render(); }
      });
      await api.downloadUpdate({ url: latest.apkUrl, sha256: latest.sha256, build: latest.build });
      state.progress = 100; await saveFirst();
      const result = await api.installUpdate({ build: latest.build, sha256: latest.sha256 });
      state.progress = null;
      state.message = result?.needsPermission
        ? 'Allow installs from Iron Six, then tap Update again.'
        : "Follow Android's prompt to finish the update. Your workouts are saved.";
    } catch (error) {
      state.progress = null;
      const code = error?.code || '';
      if (code === 'UNIMPLEMENTED') await fallback(latest);
      else if (code === 'CHECKSUM') state.message = "The download didn't match the published release, so it was deleted. Nothing was installed. Try again later.";
      else if (typeof navigator !== 'undefined' && navigator.onLine === false) state.message = "You're offline. Connect to the internet, then tap Update again.";
      else state.message = "The update couldn't be downloaded. Check your connection and try again.";
    } finally {
      try { await unlisten?.remove?.(); } catch (_) {}
      state.busy = false;
      render();
    }
  }

  function reload() {
    try { window.saveData?.(); } catch (_) {}
    location.reload();
  }

  /* An update the user already knows about, even after tapping Later: the menu keeps offering it so
   * nobody has to wait out the 24-hour snooze. Android: {from, to}; web: {reload:true}. */
  function pending() {
    if (!isAndroid()) return state.webCurrent && state.webBaseline && state.webCurrent !== state.webBaseline ? { reload: true } : null;
    const latest = state.latest, installed = state.installed;
    return latest && installed && latest.build > installed ? { from: installed, to: latest.build } : null;
  }

  function label() {
    const ready = pending();
    if (!isAndroid()) return ready ? 'New version ready' : 'Web app';
    if (ready) return `Build ${ready.from} → ${ready.to}`;
    return state.installed ? `Build ${state.installed}` : 'Android app';
  }

  // The menu's "Update now": clears any snooze, shows the banner and starts the update straight away.
  async function updateNow() {
    try { localStorage.removeItem(KEY_SNOOZE); } catch (_) {}
    state.webDismissed = null;
    if (!pending()) return checkNow();
    if (!isAndroid()) { render(); return { kind: state.kind }; }
    render();
    await update();
    return { kind: state.kind };
  }

  window.IronSixAppUpdate = { check, checkNow, update, updateNow, pending, render, label, later, decide, state };

  const kick = () => { check(false).catch(() => {}); };
  addEventListener('pageshow', kick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  if (isAndroid()) { installedInfo().then(kick, kick); }
  else { kick(); setInterval(kick, WEB_POLL); }
})();
