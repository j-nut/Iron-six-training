/* Watch & heart rate.
 *
 * Makes data a person's watch already collects available in Iron Six: live heart rate from a
 * Bluetooth heart-rate broadcast during a workout, and heart rate, sleep, resting heart rate and
 * HRV from the phone's health platform (Health Connect on Android today, Apple Health when the
 * iPhone app ships — both through IronSixNative.health, so the UI never needs to know which).
 * Nothing is written back, raw motion is never read and nothing here is sent to the AI review.
 *
 * All parsing and maths live in wearable-core.js. This module owns the UI, the per-profile state in
 * trainerMemory.wearables (which rides profile sync like the accent theme and Iron Marks) and the
 * hook that attaches heart rate to a finished session.
 *
 * No DOM observer and no per-frame work: an observer on the workout screen froze real phones.
 * One 1 s poll updates a single chip with textContent diffing and exits early when disconnected.
 */
(() => {
  if (window.__ironSixWearablesLoaded) return;

  function install() {
    if (window.__ironSixWearablesLoaded) return true;
    const core = window.IronSixWearableCore;
    if (!core) return false;
    window.__ironSixWearablesLoaded = true;

    const $ = id => document.getElementById(id);
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const currentUser = () => (typeof activeUser === 'function' ? activeUser() : null);
    const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const toMs = value => typeof value === 'number' ? value : value instanceof Date ? value.getTime() : Date.parse(value);
    const iso = ms => new Date(ms).toISOString();
    const MIN = 60000, HOUR = 36e5, DAY = 864e5;

    // Health platform data type names (the native bridge allowlist). Keep every name in this one place.
    const HEALTH = {heartRate:'heartRate', restingHeartRate:'restingHeartRate', heartRateVariability:'heartRateVariability', sleep:'sleep', calories:'calories', workouts:'workouts'};
    const READ_TYPES = Object.values(HEALTH);
    const LIMITS = {sessions:60, imported:300, seriesBucketMs:30000, seriesPoints:240, liveBucketMs:5000, livePoints:1500, staleMs:10000, enrichWindowMs:48 * HOUR, enrichEveryMs:10 * MIN, enrichAfterFinishMs:2 * MIN, readinessDays:30, watchWorkoutDays:7, sampleLimit:5000};

    const native = () => window.IronSixNative || null;
    const health = () => native()?.health || null;
    const nativeBle = () => native()?.heartRateBle || null;
    const webBle = () => (typeof navigator !== 'undefined' && navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function') ? navigator.bluetooth : null;
    const iPhoneBrowser = () => /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // ---- State: trainerMemory.wearables, per profile ----
    function readState(u) {
      const s = plain(u?.trainerMemory?.wearables) ? u.trainerMemory.wearables : {};
      const consent = plain(s.consent) ? s.consent : {};
      return {...s, v:1,
        consent:{...consent, liveHeartRate:consent.liveHeartRate === true, healthPlatform:consent.healthPlatform === true, fileImport:consent.fileImport === true, updatedAt:consent.updatedAt || null},
        sessions:plain(s.sessions) ? {...s.sessions} : {},
        imported:plain(s.imported) ? {...s.imported} : {},
        readiness:plain(s.readiness) ? s.readiness : null};
    }
    function prune(state) {
      const sessions = Object.entries(state.sessions);
      if (sessions.length > LIMITS.sessions) state.sessions = Object.fromEntries(sessions.sort((a, b) => (Number(b[1]?.at) || 0) - (Number(a[1]?.at) || 0)).slice(0, LIMITS.sessions));
      const imported = Object.entries(state.imported);
      if (imported.length > LIMITS.imported) state.imported = Object.fromEntries(imported.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0)).slice(0, LIMITS.imported));
      return state;
    }
    function writeState(u, change) {
      if (!u) return null;
      u.trainerMemory = plain(u.trainerMemory) ? u.trainerMemory : {};
      const draft = readState(u), next = prune((change && change(draft)) || draft);
      next.v = 1;
      u.trainerMemory.wearables = next;
      u.localUpdatedAt = Date.now();
      if (typeof saveData === 'function') saveData();
      window.IronSixCloud?.syncNow?.(false);
      return next;
    }
    const setConsent = (u, patch) => writeState(u, s => { s.consent = {...s.consent, ...patch, updatedAt:Date.now()}; });
    // After "Disconnect and delete" both consents are off, and saved watch data is no longer shown.
    const showsWatchData = state => state.consent.liveHeartRate || state.consent.healthPlatform || state.consent.fileImport;

    function status(u = currentUser()) {
      if (live.status === 'connected') return 'Connected';
      const state = u ? readState(u) : null;
      return state?.consent.healthPlatform ? 'On' : 'Off';
    }

    // ---- Live heart rate (Bluetooth broadcast) ----
    const buffer = core.createHeartRateBuffer({maxSamples:6 * 3600, maxAgeMs:6 * HOUR});
    const live = {status:'off', device:null, deviceId:null, transport:null, web:null, manual:false, error:''};

    function onReading(bytes, meta) {
      let parsed = null;
      try { parsed = core.parseHeartRateMeasurement(bytes); } catch (_) { return; }
      if (!parsed || !core.validBpm(parsed.bpm)) return;
      if (meta?.deviceName) live.device = meta.deviceName;
      buffer.push({t:Date.now(), bpm:parsed.bpm, source:'bluetooth', device:live.device || null});
      tick();
    }
    function handleDisconnect() {
      const expected = live.manual;
      live.status = 'off'; live.web = null; live.transport = null; live.manual = false;
      tick(); refreshModal(); window.IronSixProfileMenu?.render?.();
      if (!expected && typeof toast === 'function') toast('Heart rate monitor disconnected');
    }
    function liveSupport() {
      if (nativeBle()) return {available:true, transport:'native'};
      if (webBle()) return {available:true, transport:'web'};
      if (iPhoneBrowser()) return {available:false, reason:'iphone', message:'iPhone and iPad browsers can’t connect to Bluetooth heart-rate sensors. Live heart rate will come with the Iron Six iPhone app.'};
      return {available:false, reason:'browser', message:'This browser can’t connect to Bluetooth devices. Use Chrome or Edge on Android, Windows, macOS or ChromeOS, or the Iron Six Android app.'};
    }
    async function connectHeartRate() {
      if (live.status === 'connected' || live.status === 'connecting') return {ok:live.status === 'connected', device:live.device};
      const support = liveSupport();
      if (!support.available) { live.error = support.message; refreshModal(); return {ok:false, message:support.message}; }
      live.status = 'connecting'; live.error = ''; refreshModal();
      try {
        if (support.transport === 'native') {
          const ble = nativeBle();
          if (!(await ble.isAvailable())) throw new Error('Bluetooth heart rate isn’t available on this device.');
          const info = await ble.connect({onReading:(bytes, meta) => onReading(bytes, meta), onDisconnect:() => handleDisconnect()});
          live.device = info?.deviceName || 'Heart rate monitor'; live.deviceId = info?.deviceId || null; live.transport = 'native';
        } else {
          const device = await webBle().requestDevice({filters:[{services:['heart_rate']}]});
          device.addEventListener?.('gattserverdisconnected', () => { if (live.web?.device === device) handleDisconnect(); });
          const server = await device.gatt.connect();
          const service = await server.getPrimaryService('heart_rate');
          const characteristic = await service.getCharacteristic('heart_rate_measurement');
          characteristic.addEventListener('characteristicvaluechanged', event => {
            const view = event?.target?.value;
            if (view && view.buffer) onReading(new Uint8Array(view.buffer, view.byteOffset || 0, view.byteLength), {deviceName:device.name});
          });
          live.web = {device, characteristic};
          await characteristic.startNotifications();
          live.device = device.name || 'Heart rate monitor'; live.deviceId = device.id || null; live.transport = 'web';
        }
        live.status = 'connected';
        const u = currentUser();
        if (u && !readState(u).consent.liveHeartRate) setConsent(u, {liveHeartRate:true});
        tick(); refreshModal(); window.IronSixProfileMenu?.render?.();
        return {ok:true, device:live.device};
      } catch (error) {
        live.status = 'off'; live.web = null; live.transport = null;
        const cancelled = error?.name === 'NotFoundError' || /cancel|no .*selected/i.test(error?.message || '');
        live.error = cancelled ? '' : `Couldn’t connect: ${error?.message || 'the heart rate monitor did not respond.'}`;
        refreshModal();
        return {ok:false, cancelled, message:live.error};
      }
    }
    async function disconnectHeartRate() {
      if (live.status === 'off') return true;
      live.manual = true;
      try {
        if (live.transport === 'native') await nativeBle()?.disconnect?.();
        else if (live.web) {
          const {device, characteristic} = live.web;
          try { await characteristic?.stopNotifications?.(); } catch (_) {}
          device?.gatt?.disconnect?.();
        }
      } catch (_) {}
      if (live.status !== 'off') handleDisconnect();
      live.manual = false;
      return true;
    }
    function currentHeartRate(now = Date.now()) {
      if (live.status !== 'connected') return null;
      const sample = buffer.latest(now, LIMITS.staleMs);
      return sample ? {bpm:Math.round(sample.bpm), t:sample.t, device:sample.device || live.device} : null;
    }

    // One chip in the active workout's card nav. Cheap: exits early, diffs textContent.
    function tick() {
      let chip = $('wearableHrChip');
      if (live.status !== 'connected') { if (chip && !chip.hidden) chip.hidden = true; return; }
      if (document.hidden) return;
      const hr = currentHeartRate(), text = hr ? String(hr.bpm) : '—';
      const modalValue = $('wrLiveBpm');
      if (modalValue) { const t = hr ? `${text} bpm` : 'Waiting for a reading…'; if (modalValue.textContent !== t) modalValue.textContent = t; }
      const nav = $('sessionCardNav');
      if (!nav || nav.hidden || nav.classList.contains('sc-hidden')) return;
      if (!chip) {
        injectStyles();
        chip = document.createElement('span');
        chip.id = 'wearableHrChip'; chip.className = 'wr-chip'; chip.setAttribute('role', 'img');
        chip.innerHTML = '<span aria-hidden="true">♥</span><b></b>';
      }
      if (chip.parentNode !== nav) nav.append(chip);
      if (chip.hidden) chip.hidden = false;
      const value = chip.querySelector('b');
      if (value.textContent !== text) {
        value.textContent = text;
        chip.setAttribute('aria-label', hr ? `Heart rate ${text} beats per minute` : 'Heart rate: waiting for a reading');
      }
    }

    // ---- Attach live heart rate to the session being finished ----
    function attachToSession(u, session, now = Date.now()) {
      const journal = window.IronSixJournal, sessionId = u?.workoutDraft?.id;
      if (!session || !journal || !sessionId) return null;
      const events = journal.all();
      const win = core.sessionWindow(events, sessionId, now);
      if (!win || !Number.isFinite(win.start)) return null;
      session.startedAt = win.start;
      if (!buffer.size()) return null;
      const samples = buffer.samples(win.start, win.end);
      const summary = samples.length ? core.summarize(samples, win) : null;
      if (!summary) return null;
      const device = samples.map(s => s.device).filter(Boolean).pop() || live.device || null;
      session.wearable = {v:1, source:'bluetooth', device, summary,
        series:core.downsample(samples, {start:win.start, bucketMs:LIMITS.liveBucketMs, maxPoints:LIMITS.livePoints}),
        sets:core.alignSets(core.setMarksFromJournal(events, sessionId), samples)};
      return session.wearable;
    }
    let finishTimer = null;
    function wrapJournal() {
      const journal = window.IronSixJournal;
      if (!journal || typeof journal.finish !== 'function') return false;
      if (journal.finish.__wearables) return true;
      const original = journal.finish;
      const finish = function (u, session) {
        try { attachToSession(u, session); } catch (error) { try { delete session.wearable; } catch (_) {} }
        const result = original.apply(this, arguments);
        try {
          if (result) { clearTimeout(finishTimer); finishTimer = setTimeout(() => runBackground(), LIMITS.enrichAfterFinishMs); }
        } catch (_) {}
        return result;
      };
      finish.__wearables = true;
      journal.finish = finish;
      return true;
    }

    // ---- Health platform: Health Connect (Android) / Apple Health (iOS) ----
    async function healthInfo() {
      const h = health();
      if (!h) return {native:false, available:false, platform:null, name:'Health Connect'};
      try {
        const result = await h.isAvailable();
        const platform = result?.platform === 'ios' ? 'ios' : 'android';
        return {native:true, available:result?.available === true, platform, reason:result?.reason || '', name:platform === 'ios' ? 'Apple Health' : 'Health Connect'};
      } catch (error) {
        return {native:true, available:false, platform:'android', reason:error?.message || '', name:'Health Connect'};
      }
    }
    function authorizedTypes(result) {
      if (!result) return [];
      if (Array.isArray(result.readAuthorized)) return result.readAuthorized.map(String);
      if (Array.isArray(result.read)) return result.read.map(String);
      if (plain(result.read)) return Object.entries(result.read).filter(([, v]) => v === true || v === 'authorized' || v === 'granted').map(([k]) => k);
      if (Array.isArray(result.granted)) return result.granted.map(String);
      return [];
    }
    async function connectHealth() {
      const h = health(), info = await healthInfo();
      if (!h) return {ok:false, message:'Available in the Iron Six Android app.'};
      if (!info.available) return {ok:false, message:info.reason || `${info.name} isn’t available on this device.`};
      let granted = [];
      try { granted = authorizedTypes(await h.requestAuthorization({read:READ_TYPES})); }
      catch (error) { return {ok:false, message:error?.message || `${info.name} permissions couldn’t be requested.`}; }
      if (!granted.length && typeof h.checkAuthorization === 'function') { try { granted = authorizedTypes(await h.checkAuthorization({read:READ_TYPES})); } catch (_) {} }
      const ok = granted.includes(HEALTH.heartRate) || granted.includes(HEALTH.sleep);
      const u = currentUser();
      if (u && (ok || readState(u).consent.healthPlatform)) setConsent(u, {healthPlatform:ok});
      if (ok) runBackground({force:true}).then(() => refreshModal());
      return {ok, granted, message:ok ? `Connected to ${info.name}.` : `Heart rate or sleep access wasn’t allowed. You can change this in ${info.name} permissions.`};
    }
    const readSamples = (dataType, start, end) => health().readSamples({dataType, startDate:iso(start), endDate:iso(end), limit:LIMITS.sampleLimit, ascending:true}).then(r => Array.isArray(r?.samples) ? r.samples : []);
    const usable = async () => { const u = currentUser(); if (!u || !readState(u).consent.healthPlatform || !health()) return null; return (await healthInfo()).available ? u : null; };
    const sessionWindowOf = h => { const end = Number(h.ts); const start = Number(h.startedAt) || end - (Number(h.duration) || 60) * MIN; return {start, end}; };

    let enriching = null;
    function enrichRecentSessions(now = Date.now()) {
      if (enriching) return enriching;
      enriching = (async () => {
        const u = await usable();
        if (!u) return {stored:0, skipped:true};
        const state = readState(u), records = {};
        const candidates = (Array.isArray(u.history) ? u.history : []).filter(h => h?.sessionId && Number(h.ts) <= now && now - Number(h.ts) <= LIMITS.enrichWindowMs
          && !(h.wearable?.summary && Number(h.wearable.summary.coverage) >= 0.5) && !state.sessions[h.sessionId]);
        for (const h of candidates) {
          const win = sessionWindowOf(h);
          if (!(win.end > win.start)) continue;
          let raw;
          try { raw = await readSamples(HEALTH.heartRate, win.start, win.end); } catch (_) { continue; }
          const samples = raw.map(s => ({t:toMs(s.startDate), bpm:Number(s.value), source:'health-platform', device:s.sourceName || null})).filter(s => Number.isFinite(s.t) && core.validBpm(s.bpm));
          const summary = samples.length ? core.summarize(samples, win) : null;
          if (!summary) continue;
          const counts = {};
          for (const s of samples) if (s.device) counts[s.device] = (counts[s.device] || 0) + 1;
          const device = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
          records[h.sessionId] = {source:'health-platform', device, summary, series:core.downsample(samples, {start:win.start, bucketMs:LIMITS.seriesBucketMs, maxPoints:LIMITS.seriesPoints}), at:Number(h.ts)};
        }
        const stored = Object.keys(records).length;
        if (stored) writeState(u, s => { if (!s.consent.healthPlatform) return s; Object.assign(s.sessions, records); return s; });
        return {stored};
      })().catch(() => ({stored:0, error:true})).finally(() => { enriching = null; });
      return enriching;
    }

    let readinessBusy = null;
    function readinessInsight(options = {}) {
      if (readinessBusy) return readinessBusy;
      readinessBusy = (async () => {
        const now = options.now || Date.now(), u = currentUser();
        if (!u) return null;
        const state = readState(u), today = core.localDateKey(now);
        if (!state.consent.healthPlatform) { renderReadiness(u); return null; }
        if (!options.force && state.readiness?.date === today) { renderReadiness(u); return state.readiness; }
        if (!(await usable())) { renderReadiness(u); return state.readiness; }
        const start = now - LIMITS.readinessDays * DAY, input = {today};
        for (const kind of ['sleep', 'restingHeartRate', 'heartRateVariability']) {
          let raw = [];
          try { raw = await readSamples(HEALTH[kind], start, now); } catch (_) {}
          try { input[kind] = core.dailyFromSamples(raw, {kind}); } catch (_) { input[kind] = []; }
        }
        const insight = core.readinessInsight(input);
        const items = insight?.hasData && Array.isArray(insight.items) ? insight.items.map(i => ({metric:i.metric, value:i.value, usual:i.usual, direction:i.direction, text:String(i.text || '')})).filter(i => i.text) : [];
        const readiness = {date:today, items, at:now};
        if (currentUser() === u) { writeState(u, s => { if (s.consent.healthPlatform) s.readiness = readiness; return s; }); renderReadiness(u); }
        return readiness;
      })().catch(() => null).finally(() => { readinessBusy = null; });
      return readinessBusy;
    }
    // "From your watch": context only, right after the readiness note. Never changes #energy/#soreness.
    function renderReadiness(u = currentUser()) {
      const note = $('readinessNote');
      let block = $('wearableReadiness');
      const state = u ? readState(u) : null;
      const items = state?.consent.healthPlatform && state.readiness?.date === core.localDateKey(Date.now()) && Array.isArray(state.readiness.items) ? state.readiness.items : [];
      if (!note || !items.length) { if (block && !block.hidden) block.hidden = true; return; }
      injectStyles();
      if (!block) { block = document.createElement('div'); block.id = 'wearableReadiness'; block.className = 'wr-readiness'; }
      if (note.nextElementSibling !== block) note.after(block);
      const key = JSON.stringify(items.map(i => i.text));
      if (block.dataset.key !== key) {
        block.dataset.key = key;
        block.innerHTML = `<strong>From your watch</strong><ul>${items.map(i => `<li>${esc(i.text)}</li>`).join('')}</ul><small>Context only — set energy and soreness by how you feel.</small>`;
      }
      block.hidden = false;
    }

    let backgroundBusy = null;
    function runBackground(options = {}) {
      if (backgroundBusy) return backgroundBusy;
      backgroundBusy = (async () => {
        const u = currentUser();
        if (!u || !readState(u).consent.healthPlatform || !health()) { renderReadiness(u); return {skipped:true}; }
        const enriched = await enrichRecentSessions();
        const readiness = await readinessInsight({force:options.force});
        return {enriched, readiness};
      })().catch(() => ({error:true})).finally(() => { backgroundBusy = null; });
      return backgroundBusy;
    }

    // ---- Workouts recorded by the watch outside Iron Six → cardio log ----
    const watchId = w => ('watch-' + String(w?.platformId || w?.startDate || '')).slice(0, 100);
    async function recentWatchWorkouts(now = Date.now()) {
      const u = await usable();
      if (!u) return [];
      const result = await health().queryWorkouts({startDate:iso(now - LIMITS.watchWorkoutDays * DAY), endDate:iso(now), limit:50});
      const state = readState(u), logged = new Set((u.program?.cardio?.logs || []).map(x => x?.id));
      return (Array.isArray(result?.workouts) ? result.workouts : []).map(w => ({...w, id:watchId(w), mode:core.cardioModeFor(w.workoutType)}))
        .filter(w => w.mode && !state.imported[w.id] && !logged.has(w.id) && Number.isFinite(toMs(w.endDate)));
    }
    function importWatchWorkout(workout) {
      const u = currentUser(), mode = core.cardioModeFor(workout?.workoutType), end = toMs(workout?.endDate);
      if (!u || !mode || !Number.isFinite(end) || !window.IronSixCardio?.logSession) return false;
      const id = watchId(workout);
      const seconds = Number(workout.duration) > 0 ? Number(workout.duration) : (end - toMs(workout.startDate)) / 1000;
      const minutes = Math.max(1, Math.min(300, Math.round(seconds / 60) || 1));
      const logged = window.IronSixCardio.logSession(u, {id, mode, minutes, intensity:'moderate', completed:true, completedAt:iso(end), source:'watch'});
      writeState(u, s => { s.imported[id] = Date.now(); return s; });
      try { window.IronSixCardio.render?.(); } catch (_) {}
      return !!logged;
    }

    // ---- Import a workout file (TCX / GPX) ----
    let pendingFileCardio = null;
    function readFileText(file) {
      if (typeof file === 'string') return Promise.resolve(file);
      return new Promise((resolve, reject) => {
        if (!file || typeof FileReader !== 'function') { reject(new Error('No file')); return; }
        if (file.size > 30 * 1024 * 1024) { reject(new Error('That file is too large.')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Read failed'));
        reader.readAsText(file);
      });
    }
    const matched = result => Array.isArray(result) ? result.length > 0 : result != null && result !== false && result !== -1;
    const dayLabel = ms => { try { return new Date(ms).toLocaleDateString(undefined, {month:'short', day:'numeric'}); } catch (_) { return ''; } };
    async function importWorkoutFile(file) {
      const u = currentUser();
      pendingFileCardio = null;
      if (!u) return {ok:false, message:'Choose a profile first.'};
      let text;
      try { text = await readFileText(file); } catch (error) { return {ok:false, message:error?.message === 'That file is too large.' ? error.message : 'That file couldn’t be read.'}; }
      let parsed;
      try { parsed = core.parseWorkoutFile(text, {DOMParser:window.DOMParser}); } catch (_) { parsed = null; }
      if (!parsed || parsed.error) return {ok:false, message:parsed?.message || 'That file couldn’t be read as a TCX or GPX workout.'};
      const start = toMs(parsed.start), end = toMs(parsed.end), device = parsed.device || null;
      const samples = (Array.isArray(parsed.samples) ? parsed.samples : []).map(s => ({t:toMs(s.t), bpm:Number(s.bpm), source:'file', device})).filter(s => Number.isFinite(s.t) && core.validBpm(s.bpm));
      const timed = Number.isFinite(start) && Number.isFinite(end) && end > start;
      const externalId = 'file-' + (timed ? start : Date.now());
      if (samples.length && timed) {
        const workout = {...parsed, start, end, startDate:iso(start), endDate:iso(end)};
        let best = null;
        for (const h of Array.isArray(u.history) ? u.history : []) {
          if (!h?.sessionId || !Number.isFinite(Number(h.ts))) continue;
          const win = sessionWindowOf(h);
          let hit = null;
          try { hit = core.matchWorkoutToWindow([workout], win); } catch (_) {}
          if (!matched(hit)) continue;
          const overlap = Math.min(end, win.end) - Math.max(start, win.start);
          if (!best || overlap > best.overlap) best = {h, win, overlap};
        }
        if (best) {
          const summary = core.summarize(samples, best.win) || core.summarize(samples, {start, end});
          if (summary) {
            const sessionId = best.h.sessionId;
            writeState(u, s => {
              s.consent = {...s.consent, fileImport:true, updatedAt:Date.now()};
              s.sessions[sessionId] = {source:'file', device, summary, series:core.downsample(samples, {start:best.win.start, bucketMs:LIMITS.seriesBucketMs, maxPoints:LIMITS.seriesPoints}), at:Number(best.h.ts)};
              s.imported[externalId] = Date.now();
              return s;
            });
            try { window.IronSixHistory?.render?.(); } catch (_) {}
            return {ok:true, sessionId, summary, message:`Heart rate added to ${best.h.name || 'your workout'} on ${dayLabel(best.h.ts)}: avg ${Math.round(summary.avg)} · max ${Math.round(summary.max)} bpm.`};
          }
        }
      }
      const mode = core.cardioModeFor(parsed.sport);
      if (mode && timed) {
        pendingFileCardio = {id:externalId, mode, minutes:Math.max(1, Math.min(300, Math.round((end - start) / MIN) || 1)), completedAt:iso(end)};
        return {ok:true, sessionId:null, cardio:{...pendingFileCardio}, message:`${samples.length ? 'This workout doesn’t overlap a finished Iron Six session.' : 'No heart rate was found in this file.'} You can add it to your cardio log: ${pendingFileCardio.minutes} min ${mode} on ${dayLabel(end)}.`};
      }
      return {ok:false, message:samples.length ? 'This file doesn’t overlap any finished Iron Six workout.' : 'No heart rate data was found in this file.'};
    }
    function logFileCardio(entry = pendingFileCardio) {
      const u = currentUser();
      if (!u || !entry || !window.IronSixCardio?.logSession) return false;
      const logged = window.IronSixCardio.logSession(u, {id:entry.id, mode:entry.mode, minutes:entry.minutes, intensity:'moderate', completed:true, completedAt:entry.completedAt, source:'file'});
      writeState(u, s => { s.imported[entry.id] = Date.now(); return s; });
      pendingFileCardio = null;
      try { window.IronSixCardio.render?.(); } catch (_) {}
      return !!logged;
    }

    // ---- Delete ----
    async function deleteWatchData(options = {}) {
      const u = currentUser();
      if (!u) return false;
      if (!options.confirmed && !confirm('Disconnect your watch and delete watch data saved in Iron Six for this profile? Heart rate already saved with past workouts stays with those workouts but is no longer shown.')) return false;
      await disconnectHeartRate();
      buffer.clear(); pendingFileCardio = null; watchWorkouts = [];
      writeState(u, () => ({v:1, consent:{liveHeartRate:false, healthPlatform:false, fileImport:false, updatedAt:Date.now()}, sessions:{}, imported:{}, readiness:null}));
      renderReadiness(u);
      try { window.IronSixHistory?.render?.(); } catch (_) {}
      window.IronSixProfileMenu?.render?.();
      return true;
    }

    // ---- History line ----
    function historyLine(h, u = currentUser()) {
      if (!h || !u) return '';
      const state = readState(u);
      if (!showsWatchData(state)) return '';
      const saved = h.wearable?.summary ? h.wearable : null, stored = h.sessionId ? state.sessions[h.sessionId] : null;
      const record = saved && stored?.summary ? ((Number(stored.summary.coverage) || 0) > (Number(saved.summary.coverage) || 0) ? stored : saved) : saved || (stored?.summary ? stored : null);
      const avg = Math.round(Number(record?.summary?.avg)), max = Math.round(Number(record?.summary?.max));
      if (!Number.isFinite(avg) || !Number.isFinite(max)) return '';
      return `Heart rate avg ${avg} · max ${max} bpm · ${record.device || 'watch'}`;
    }

    // ---- Modal ----
    function injectStyles() {
      if ($('wearablesStyles')) return;
      const style = document.createElement('style');
      style.id = 'wearablesStyles';
      style.textContent = `
        .wr-backdrop{position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.76);display:flex;align-items:flex-end;justify-content:center;padding:8px}
        .wr-backdrop[hidden]{display:none}
        .wr-modal{width:min(100%,560px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;background:linear-gradient(155deg,rgba(255,255,255,.025),transparent 32%),var(--surface);border:1px solid #363b47;border-radius:24px;padding:22px 16px max(20px,env(safe-area-inset-bottom));box-shadow:0 24px 80px #0009;box-sizing:border-box;color:var(--text)}
        .wr-head{display:flex;align-items:flex-start;gap:12px;margin:4px 4px 18px}.wr-head div{flex:1;min-width:0}
        .wr-head h3{margin:0;font-size:22px;letter-spacing:-.7px;line-height:1.15}.wr-head p{margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.5}
        .wr-close{border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:50%;width:40px;height:40px;font-weight:700;cursor:pointer;flex:0 0 auto}
        .wr-card{padding:14px;border:1px solid var(--line);border-radius:15px;background:var(--surface2);margin:10px 0}
        .wr-card h4{margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
        .wr-card p,.wr-card li{font-size:12.5px;line-height:1.55;color:var(--muted);margin:6px 0}.wr-card ul{margin:6px 0;padding-left:18px}.wr-card strong{color:var(--text)}
        .wr-live{display:flex;align-items:baseline;gap:10px;margin:8px 0}.wr-live b{font-size:26px;color:var(--accent);letter-spacing:-.5px}.wr-live span{font-size:12px;color:var(--muted)}
        .wr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
        .wr-btn{min-height:44px;padding:9px 13px;border-radius:11px;border:1px solid var(--line);background:var(--surface);color:var(--text);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
        .wr-btn.primary{border-color:rgba(var(--accent-rgb),.5);background:rgba(var(--accent-rgb),.12)}
        .wr-btn.danger{color:#ff9b9b}.wr-btn:disabled{opacity:.5;cursor:default}
        .wr-btn:focus-visible,.wr-close:focus-visible,.wr-file:focus-within{outline:2px solid var(--text);outline-offset:3px}
        .wr-msg{font-size:12px;color:var(--text);margin:8px 0 0;min-height:0}.wr-msg:empty{display:none}
        .wr-file input{display:block;width:100%;font:inherit;font-size:12px;color:var(--muted);margin-top:8px}
        .wr-workout{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line)}.wr-workout span{flex:1;font-size:12.5px;color:var(--text)}
        .wr-chip{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;min-height:30px;padding:0 9px;border-radius:999px;border:1px solid var(--line);background:var(--surface2);color:var(--text);font-size:12px;font-variant-numeric:tabular-nums}
        .wr-chip span{color:#ff6b7a;font-size:11px}.wr-chip b{min-width:2ch;text-align:right}.wr-chip[hidden]{display:none}
        .wr-readiness{margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;font-size:12px;line-height:1.5;color:var(--muted)}
        .wr-readiness[hidden]{display:none}.wr-readiness strong{display:block;color:var(--text);font-size:12px}.wr-readiness ul{margin:4px 0;padding-left:18px}.wr-readiness small{font-size:11px}
        .history-hr{display:block;color:var(--muted);font-size:12px}
        @media(min-width:640px){.wr-backdrop{align-items:center;padding:24px}.wr-modal{padding:26px;max-height:calc(100dvh - 48px)}}
      `;
      document.head.appendChild(style);
    }
    function ensureModal() {
      injectStyles();
      let backdrop = $('wearablesModal');
      if (backdrop) return backdrop;
      backdrop = document.createElement('div');
      backdrop.id = 'wearablesModal'; backdrop.className = 'wr-backdrop'; backdrop.hidden = true;
      backdrop.innerHTML = '<div class="wr-modal" role="dialog" aria-modal="true" aria-labelledby="wrTitle"></div>';
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) { close(); return; }
        const button = event.target.closest?.('[data-wr]');
        if (button && !button.disabled) handleAction(button.dataset.wr, button);
      });
      backdrop.addEventListener('change', event => { if (event.target?.id === 'wrFile' && event.target.files?.[0]) handleFile(event.target.files[0]); });
      document.addEventListener('keydown', event => { if (event.key === 'Escape' && !backdrop.hidden) close(); });
      document.body.appendChild(backdrop);
      return backdrop;
    }
    const ui = {health:null, healthMessage:'', importMessage:'', watchMessage:''};
    let watchWorkouts = [];
    function close() { const backdrop = $('wearablesModal'); if (backdrop) backdrop.hidden = true; }
    const isOpen = () => $('wearablesModal') && !$('wearablesModal').hidden;
    function refreshModal() { if (isOpen()) render(); }

    function liveCard() {
      const support = liveSupport();
      const note = '<p>Works with heart-rate straps and watches that broadcast heart rate — e.g. Polar, Garmin (broadcast mode), Coros, Wahoo and many others. Apple Watch and most Wear OS watches don’t broadcast heart rate.</p>';
      let body;
      if (!support.available) body = `<p id="wrLiveUnavailable"><strong>Not available here.</strong> ${esc(support.message)}</p>`;
      else if (live.status === 'connected') {
        const hr = currentHeartRate();
        body = `<p><strong>${esc(live.device || 'Heart rate monitor')}</strong> connected. Your heart rate is saved with the workout you finish.</p><div class="wr-live"><b id="wrLiveBpm">${hr ? `${hr.bpm} bpm` : 'Waiting for a reading…'}</b></div><div class="wr-actions"><button type="button" class="wr-btn" data-wr="disconnect-hr">Disconnect</button></div>`;
      } else body = `<div class="wr-actions"><button type="button" class="wr-btn primary" data-wr="connect-hr" ${live.status === 'connecting' ? 'disabled' : ''}>${live.status === 'connecting' ? 'Connecting…' : 'Connect heart rate'}</button></div>`;
      return `<section class="wr-card" aria-labelledby="wrLiveTitle"><h4 id="wrLiveTitle">Live heart rate · Bluetooth</h4>${body}${note}<p class="wr-msg" role="status">${esc(live.error)}</p></section>`;
    }
    function healthCard(state) {
      const info = ui.health;
      if (!info) return '<section class="wr-card"><h4>Health platform</h4><p>Checking…</p></section>';
      if (!info.native) return `<section class="wr-card" aria-labelledby="wrHealthTitle"><h4 id="wrHealthTitle">Health Connect</h4><p>Sleep, resting heart rate, HRV and heart rate recorded by your watch can be read in the <strong>Iron Six Android app</strong> through Health Connect.</p><p>Apple Health: coming with the iPhone app.</p><div class="wr-actions"><a class="wr-btn" href="/privacy" target="_blank" rel="noopener">Privacy policy</a></div></section>`;
      const name = esc(info.name), privacy = `<button type="button" class="wr-btn" data-wr="health-privacy">Privacy policy</button>`;
      if (!info.available) return `<section class="wr-card" aria-labelledby="wrHealthTitle"><h4 id="wrHealthTitle">${name}</h4><p><strong>${name} isn’t available.</strong> ${esc(info.reason || (info.platform === 'ios' ? 'Apple Health isn’t available on this device.' : 'Install or update Health Connect from Google Play, then come back.'))}</p><div class="wr-actions">${info.platform === 'ios' ? '' : '<button type="button" class="wr-btn" data-wr="health-settings">Open Health Connect</button>'}${privacy}</div><p class="wr-msg" role="status">${esc(ui.healthMessage)}</p></section>`;
      const connected = state.consent.healthPlatform;
      const workouts = connected ? `<div id="wrWatchWorkouts"><p><strong>Recent workouts from your watch</strong></p>${watchWorkouts.length ? watchWorkouts.map((w, i) => `<div class="wr-workout"><span>${esc(dayLabel(toMs(w.endDate)))} · ${Math.max(1, Math.min(300, Math.round((Number(w.duration) || (toMs(w.endDate) - toMs(w.startDate)) / 1000) / 60) || 1))} min ${esc(w.mode)}${w.sourceName ? ` · ${esc(w.sourceName)}` : ''}</span><button type="button" class="wr-btn" data-wr="add-watch" data-index="${i}">Add to cardio log</button></div>`).join('') : '<p>No new runs, walks, rides or swims in the last 7 days.</p>'}<p class="wr-msg" role="status">${esc(ui.watchMessage)}</p></div>` : '';
      return `<section class="wr-card" aria-labelledby="wrHealthTitle"><h4 id="wrHealthTitle">${name}</h4>`
        + (connected ? `<p><strong>Connected.</strong> Iron Six reads heart rate for your workouts plus sleep, resting heart rate and HRV. Watches can take a while to sync, so Iron Six checks again later.</p>` : `<p>Read heart rate, sleep, resting heart rate and HRV that your watch already saves to ${name}.</p>`)
        + `<div class="wr-actions">${connected ? '<button type="button" class="wr-btn" data-wr="check-now">Check now</button>' : `<button type="button" class="wr-btn primary" data-wr="connect-health">Connect ${name}</button>`}<button type="button" class="wr-btn" data-wr="health-settings">Manage permissions</button>${privacy}</div><p class="wr-msg" role="status">${esc(ui.healthMessage)}</p>${workouts}</section>`;
    }
    function render() {
      const u = currentUser(), backdrop = ensureModal(), modal = backdrop.querySelector('.wr-modal');
      if (!u) return;
      const state = readState(u);
      const focusedAction = document.activeElement && modal.contains(document.activeElement) ? document.activeElement.dataset?.wr : null;
      modal.innerHTML = `<div class="wr-head"><div><h3 id="wrTitle">Watch & heart rate</h3><p>Use what your watch already records. Iron Six reads heart rate during workouts, and sleep, resting heart rate and HRV from outside workouts. It never reads raw motion, never writes anything back and never uses this for ads. Watch data stays with this profile and only syncs if you’re signed in.</p></div><button class="wr-close" type="button" data-wr="close" aria-label="Close">✕</button></div>`
        + liveCard() + healthCard(state)
        + `<section class="wr-card" aria-labelledby="wrFileTitle"><h4 id="wrFileTitle">Import a workout file</h4><p>Exported a workout from your watch app as TCX or GPX? Its heart rate is added to the matching Iron Six workout.</p><label class="wr-file">Choose a file<input id="wrFile" type="file" accept=".tcx,.gpx,application/xml,text/xml"></label>${pendingFileCardio ? '<div class="wr-actions"><button type="button" class="wr-btn primary" data-wr="log-file-cardio">Add to cardio log</button></div>' : ''}<p class="wr-msg" id="wrImportStatus" role="status">${esc(ui.importMessage)}</p></section>`
        + `<section class="wr-card" aria-labelledby="wrDeleteTitle"><h4 id="wrDeleteTitle">Your watch data</h4><p>Heart rate already saved with past workouts stays with those workouts. ${ui.health?.native ? `${esc(ui.health.name)} permissions are managed in its settings.` : ''}</p><div class="wr-actions"><button type="button" class="wr-btn danger" data-wr="delete">Disconnect and delete watch data</button>${ui.health?.native && ui.health.platform !== 'ios' ? '<button type="button" class="wr-btn" data-wr="health-settings">Health Connect settings</button>' : ''}</div></section>`;
      if (focusedAction) modal.querySelector(`[data-wr="${focusedAction}"]`)?.focus();
    }
    async function open() {
      const u = currentUser();
      if (!u) return;
      ui.importMessage = ''; ui.watchMessage = '';
      ensureModal().hidden = false;
      render();
      $('wearablesModal').querySelector('.wr-close')?.focus();
      ui.health = await healthInfo();
      watchWorkouts = [];
      if (ui.health.available && readState(u).consent.healthPlatform) { try { watchWorkouts = await recentWatchWorkouts(); } catch (_) { watchWorkouts = []; } }
      refreshModal();
    }
    async function handleAction(action, button) {
      const h = health();
      try {
        if (action === 'close') close();
        if (action === 'connect-hr') await connectHeartRate();
        if (action === 'disconnect-hr') await disconnectHeartRate();
        if (action === 'connect-health') { ui.healthMessage = 'Opening permissions…'; refreshModal(); const result = await connectHealth(); ui.healthMessage = result.message; if (result.ok) { try { watchWorkouts = await recentWatchWorkouts(); } catch (_) {} } }
        if (action === 'health-settings') await h?.openSettings?.();
        if (action === 'health-privacy') await h?.showPrivacyPolicy?.();
        if (action === 'check-now') { ui.healthMessage = 'Checking…'; refreshModal(); const out = await runBackground({force:true}); try { watchWorkouts = await recentWatchWorkouts(); } catch (_) {} ui.healthMessage = out?.enriched?.stored ? `Heart rate added to ${out.enriched.stored} recent workout${out.enriched.stored === 1 ? '' : 's'}.` : 'Up to date.'; }
        if (action === 'add-watch') { const w = watchWorkouts[Number(button.dataset.index)]; if (w) { const ok = importWatchWorkout(w); watchWorkouts = watchWorkouts.filter(x => x !== w); ui.watchMessage = ok ? `Added ${w.mode} to your cardio log.` : 'Already in your cardio log.'; } }
        if (action === 'log-file-cardio') { const ok = logFileCardio(); ui.importMessage = ok ? 'Added to your cardio log.' : 'Already in your cardio log.'; }
        if (action === 'delete') { if (await deleteWatchData()) { ui.healthMessage = ''; ui.importMessage = 'Watch data deleted for this profile.'; } }
      } catch (error) {
        ui.healthMessage = error?.message || 'Something went wrong. Try again.';
      }
      refreshModal();
    }
    async function handleFile(file) {
      ui.importMessage = 'Reading file…'; refreshModal();
      const result = await importWorkoutFile(file);
      ui.importMessage = result.message; refreshModal();
      return result;
    }

    // ---- Wiring ----
    injectStyles();
    if (!wrapJournal()) addEventListener('load', wrapJournal, {once:true});
    setInterval(() => { try { tick(); } catch (_) {} }, 1000);
    setInterval(() => { if (document.visibilityState === 'visible') runBackground(); }, LIMITS.enrichEveryMs);
    setTimeout(() => runBackground(), 4000);
    const baseRender = window.renderAll;
    if (typeof baseRender === 'function') window.renderAll = function () { const result = baseRender.apply(this, arguments); try { renderReadiness(); } catch (_) {} return result; };
    renderReadiness();

    window.IronSixWearables = {open, close, connectHeartRate, disconnectHeartRate, currentHeartRate, attachToSession, enrichRecentSessions, readinessInsight, importWorkoutFile, logFileCardio, recentWatchWorkouts, importWatchWorkout, connectHealth, deleteWatchData, historyLine, status, renderReadiness, tick, runBackground, readState, get state() { return readState(currentUser()); }, HEALTH};
    window.IronSixProfileMenu?.render?.();
    return true;
  }

  if (!install()) addEventListener('load', install, {once:true});
})();
