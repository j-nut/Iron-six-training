/* Wearable Core: heart-rate and recovery data a user's smartwatch already collects.
 *
 * This is a read-only lens on data the watch already gathered — never raw motion, never a
 * training program. It parses BLE heart-rate packets and watch export files (TCX/GPX), buffers
 * and downsamples live samples, aligns them to logged sets, and turns daily sleep/RHR/HRV
 * numbers into a short, factual readiness note (never medical, never prescriptive).
 *
 * Pure logic: no DOM, storage, network or timers. Loaded in the browser and required by Node tests.
 */
(() => {
  const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
  const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

  function validBpm(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 25 && v <= 240;
  }

  function toByteArray(bytes) {
    if (bytes instanceof Uint8Array) return bytes;
    if (typeof DataView !== 'undefined' && bytes instanceof DataView) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (typeof ArrayBuffer !== 'undefined' && bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
    if (Array.isArray(bytes)) return Uint8Array.from(bytes);
    return null;
  }

  // Bluetooth GATT Heart Rate Measurement (0x2A37). Flags byte layout: bit0 bpm width,
  // bits1-2 sensor contact, bit3 energy expended present, bit4 one-or-more RR intervals present.
  function parseHeartRateMeasurement(bytes) {
    try {
      const b = toByteArray(bytes);
      if (!b || b.length < 2) return null;
      const flags = b[0];
      let offset = 1, bpm;
      if (flags & 0x01) {
        if (b.length < offset + 2) return null;
        bpm = b[offset] | (b[offset + 1] << 8);
        offset += 2;
      } else {
        bpm = b[offset];
        offset += 1;
      }
      if (!validBpm(bpm)) return null;
      const contactBits = (flags >> 1) & 0x03;
      const contactDetected = contactBits === 0b10 ? false : contactBits === 0b11 ? true : null;
      let energyKJ = null;
      if (flags & 0x08) {
        if (b.length < offset + 2) return null;
        energyKJ = b[offset] | (b[offset + 1] << 8);
        offset += 2;
      }
      let rrIntervalsMs = null;
      if (flags & 0x10) {
        const rr = [];
        while (offset + 1 < b.length) {
          const raw = b[offset] | (b[offset + 1] << 8);
          rr.push(Math.round((raw / 1024) * 1000));
          offset += 2;
        }
        if (!rr.length) return null; // flagged but no RR data present: malformed
        rrIntervalsMs = rr;
      }
      return {bpm, contactDetected, energyKJ, rrIntervalsMs};
    } catch {
      return null;
    }
  }

  // Rolling buffer of live samples. Accepts only monotonically increasing, plausible bpm; prunes
  // by age (off the newest sample) and by count so a forgotten session can't grow unbounded.
  function createHeartRateBuffer({maxAgeMs = 4 * 3600e3, maxSamples = 20000} = {}) {
    let samples = [];
    function prune() {
      if (!samples.length) return;
      const cutoff = samples[samples.length - 1].t - maxAgeMs;
      let start = 0;
      while (start < samples.length && samples[start].t < cutoff) start++;
      if (start > 0) samples = samples.slice(start);
      if (samples.length > maxSamples) samples = samples.slice(samples.length - maxSamples);
    }
    return {
      push({t, bpm, source, device} = {}) {
        if (!validBpm(bpm) || !Number.isFinite(t)) return false;
        const last = samples[samples.length - 1];
        if (last && t <= last.t) return false; // non-monotonic or exact duplicate
        samples.push({t, bpm, source, device});
        prune();
        return true;
      },
      samples(start = -Infinity, end = Infinity) {
        return samples.filter(s => s.t >= start && s.t <= end).map(s => ({...s}));
      },
      latest(now = Date.now(), staleMs = 10000) {
        if (!samples.length) return null;
        const s = samples[samples.length - 1];
        return now - s.t > staleMs ? null : {...s};
      },
      clear() { samples = []; },
      size() { return samples.length; }
    };
  }

  function median(values) {
    const s = [...values].sort((a, b) => a - b), mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // Chart-ready [offsetSeconds, bpm] pairs, one per bucket, bpm the bucket's median. Widening the
  // bucket (rather than dropping points) keeps long histories renderable without losing shape.
  function downsample(samples, {start, bucketMs = 5000, maxPoints = 1500} = {}) {
    if (!Array.isArray(samples) || !samples.length) return [];
    const sorted = [...samples].sort((a, b) => a.t - b.t);
    const s0 = Number.isFinite(start) ? start : sorted[0].t;
    const lower = Math.min(s0, sorted[0].t), upper = sorted[sorted.length - 1].t;
    let bucket = bucketMs > 0 ? bucketMs : 5000;
    while (Math.floor((upper - lower) / bucket) + 1 > maxPoints) bucket *= 2;
    const buckets = new Map();
    for (const smp of sorted) {
      const idx = Math.floor((smp.t - s0) / bucket);
      if (!buckets.has(idx)) buckets.set(idx, []);
      buckets.get(idx).push(smp.bpm);
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([idx, bpms]) => {
      const bucketStart = s0 + idx * bucket;
      return [Math.round((bucketStart - s0) / 1000), Math.round(median(bpms))];
    });
  }

  // Coverage treats a gap between consecutive samples as "covered" only when it's short enough
  // (<=15s) to trust as continuous monitoring; longer gaps (watch off-wrist, disconnect) don't count.
  function summarize(samples, {start, end} = {}) {
    if (!Array.isArray(samples)) return null;
    const valid = samples.filter(s => s && Number.isFinite(s.t) && validBpm(s.bpm));
    if (!valid.length) return null;
    const sorted = valid.slice().sort((a, b) => a.t - b.t);
    const s = Number.isFinite(start) ? start : sorted[0].t;
    const e = Number.isFinite(end) ? end : sorted[sorted.length - 1].t;
    const win = sorted.filter(x => x.t >= s && x.t <= e);
    if (win.length < 3) return null;
    const bpms = win.map(x => x.bpm);
    const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
    let covered = 0;
    for (let i = 0; i < win.length - 1; i++) {
      const gap = win[i + 1].t - win[i].t;
      if (gap <= 15000) covered += gap;
    }
    const durationMs = e - s;
    const coverage = durationMs > 0 ? Math.round((covered / durationMs) * 100) / 100 : 1;
    return {avg, max: Math.max(...bpms), min: Math.min(...bpms), count: win.length, coverage, durationMs};
  }

  // Latest 'set' journal event per row_key (exerciseIndex-setIndex), kept only when marked done.
  function setMarksFromJournal(events, sessionId) {
    if (!Array.isArray(events)) return [];
    const latest = new Map();
    for (const e of events) {
      if (!e || e.kind !== 'set' || e.session_id !== sessionId || typeof e.row_key !== 'string') continue;
      const m = e.row_key.match(/^(\d+)-(\d+)$/);
      if (!m) continue;
      const t = Date.parse(e.client_at);
      if (!Number.isFinite(t)) continue;
      const prev = latest.get(e.row_key);
      if (!prev || t >= prev.t) {
        latest.set(e.row_key, {exerciseIndex: Number(m[1]), setIndex: Number(m[2]), t, done: !!(e.payload && e.payload.done)});
      }
    }
    const out = [];
    for (const v of latest.values()) if (v.done) out.push({exerciseIndex: v.exerciseIndex, setIndex: v.setIndex, t: v.t});
    return out.sort((a, b) => a.t - b.t);
  }

  // Per set: the peak bpm in the lead-up window (clipped to the previous set so effort doesn't
  // bleed across sets) and how much bpm dropped by ~recoveryMs later, if a sample exists near then.
  function alignSets(marks, samples, {windowBeforeMs = 90000, afterMs = 15000, recoveryMs = 60000} = {}) {
    if (!Array.isArray(marks)) return [];
    const sorted = (Array.isArray(samples) ? samples : [])
      .filter(s => s && Number.isFinite(s.t) && validBpm(s.bpm))
      .sort((a, b) => a.t - b.t);
    return marks.map((m, i) => {
      const prevT = i > 0 ? marks[i - 1].t : -Infinity;
      const lo = Math.max(prevT, m.t - windowBeforeMs), hi = m.t + afterMs;
      const inWindow = sorted.filter(s => s.t >= lo && s.t <= hi);
      const peakBpm = inWindow.length ? Math.round(Math.max(...inWindow.map(s => s.bpm))) : null;
      let recoveryDrop = null;
      if (peakBpm != null) {
        const target = m.t + recoveryMs, nextT = i + 1 < marks.length ? marks[i + 1].t : Infinity;
        let best = null, bestDiff = Infinity;
        for (const s of sorted) {
          if (s.t >= nextT) continue;
          const diff = Math.abs(s.t - target);
          if (diff <= 15000 && diff < bestDiff) { bestDiff = diff; best = s; }
        }
        if (best) recoveryDrop = Math.round(peakBpm - best.bpm);
      }
      return {exerciseIndex: m.exerciseIndex, setIndex: m.setIndex, t: m.t, peakBpm, recoveryDrop};
    });
  }

  function sessionWindow(events, sessionId, finishTs, {fallbackMinutes = 60} = {}) {
    const times = (Array.isArray(events) ? events : [])
      .filter(e => e && e.session_id === sessionId && typeof e.client_at === 'string')
      .map(e => Date.parse(e.client_at))
      .filter(Number.isFinite);
    if (!times.length) return {start: finishTs - fallbackMinutes * 60000, end: finishTs};
    return {start: Math.min(...times), end: finishTs};
  }

  // Formats an instant as a YYYY-MM-DD local date. tzOffsetMinutes follows Date#getTimezoneOffset
  // (UTC minus local, in minutes) so callers can pin a timezone for deterministic results.
  function localDateKey(ms, tzOffsetMinutes = new Date(ms).getTimezoneOffset()) {
    const d = new Date(ms - tzOffsetMinutes * 60000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // Capacitor health-plugin sample shapes -> one value per local day.
  function dailyFromSamples(samples, {kind, tzOffsetMinutes} = {}) {
    if (!Array.isArray(samples) || !samples.length) return [];
    const keyOf = ms => localDateKey(ms, tzOffsetMinutes);

    if (kind === 'sleep') {
      const totals = new Map();
      for (const s of samples) {
        if (!s) continue;
        const endMs = Date.parse(s.endDate);
        if (!Number.isFinite(endMs)) continue;
        let minutes = 0;
        if (Array.isArray(s.stages) && s.stages.length) {
          for (const st of s.stages) {
            if (!st || !['asleep', 'rem', 'deep', 'light'].includes(st.stage)) continue;
            if (Number.isFinite(st.durationMinutes)) minutes += st.durationMinutes;
            else {
              const a = Date.parse(st.startDate), b = Date.parse(st.endDate);
              if (Number.isFinite(a) && Number.isFinite(b)) minutes += (b - a) / 60000;
            }
          }
        } else if (s.sleepState === 'awake' || s.sleepState === 'inBed') {
          continue;
        } else {
          const startMs = Date.parse(s.startDate);
          if (!Number.isFinite(startMs)) continue;
          minutes = (endMs - startMs) / 60000;
        }
        if (minutes <= 0) continue;
        const key = keyOf(endMs); // attributed to the wake day
        totals.set(key, (totals.get(key) || 0) + minutes);
      }
      const out = [];
      for (const [date, minutes] of totals) {
        const value = Math.round(minutes);
        if (value < 60) continue; // naps/noise: a "night" under an hour isn't a sleep session
        out.push({date, value});
      }
      return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }

    if (kind === 'restingHeartRate' || kind === 'heartRateVariability') {
      const sums = new Map();
      for (const s of samples) {
        if (!s) continue;
        const v = Number(s.value);
        if (!Number.isFinite(v) || v <= 0) continue;
        const startMs = Date.parse(s.startDate);
        if (!Number.isFinite(startMs)) continue;
        const key = keyOf(startMs), cur = sums.get(key) || {sum: 0, count: 0};
        cur.sum += v; cur.count++;
        sums.set(key, cur);
      }
      const out = [];
      for (const [date, {sum, count}] of sums) {
        const avg = sum / count;
        out.push({date, value: kind === 'restingHeartRate' ? Math.round(avg) : Math.round(avg * 10) / 10});
      }
      return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }

    return [];
  }

  function personalBaseline(daily, {excludeDate, days = 28, min = 7} = {}) {
    if (!Array.isArray(daily)) return null;
    const filtered = daily.filter(d => d && d.date !== excludeDate && Number.isFinite(d.value))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const recent = filtered.slice(-days);
    if (recent.length < min) return null;
    return {median: median(recent.map(d => d.value)), count: recent.length};
  }

  function fmtHM(totalMinutes) {
    const h = Math.floor(totalMinutes / 60), m = Math.round(totalMinutes) - h * 60;
    return `${h} h ${m} min`;
  }

  function yesterdayKey(dateKey) {
    const d = new Date(dateKey + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // Picks today's entry (sleep) or today's-else-yesterday's (RHR/HRV, since a watch can sync late).
  function pickEntry(arr, today, allowYesterday) {
    if (!Array.isArray(arr) || !today) return null;
    const hit = arr.find(d => d && d.date === today);
    if (hit || !allowYesterday) return hit || null;
    return arr.find(d => d && d.date === yesterdayKey(today)) || null;
  }

  // Neutral, factual readiness note: today's value against the user's own recent baseline, never
  // advice. Thresholds: sleep +-20%, HRV -15%/+15%, resting heart rate +-5 bpm.
  function readinessInsight({sleep, restingHeartRate, heartRateVariability, today} = {}) {
    const items = [];

    const sleepEntry = pickEntry(sleep, today, false);
    if (sleepEntry) {
      const base = personalBaseline(sleep, {excludeDate: sleepEntry.date});
      const value = sleepEntry.value, usual = base ? base.median : null;
      let direction = 'typical';
      if (usual != null) { if (value < 0.8 * usual) direction = 'lower'; else if (value > 1.2 * usual) direction = 'higher'; }
      const text = direction === 'typical'
        ? `Slept ${fmtHM(value)}, typical for you.`
        : `Slept ${fmtHM(value)}, ${direction === 'lower' ? 'below' : 'above'} your usual ${fmtHM(usual)}.`;
      items.push({metric: 'sleep', value, usual, direction, text});
    }

    const rhrEntry = pickEntry(restingHeartRate, today, true);
    if (rhrEntry) {
      const base = personalBaseline(restingHeartRate, {excludeDate: rhrEntry.date});
      const value = rhrEntry.value, usual = base ? base.median : null;
      let direction = 'typical';
      if (usual != null) { if (value >= usual + 5) direction = 'higher'; else if (value <= usual - 5) direction = 'lower'; }
      const text = direction === 'typical'
        ? `Resting heart rate ${value} bpm, typical for you.`
        : `Resting heart rate ${value} bpm, about ${Math.abs(value - usual)} ${direction === 'higher' ? 'above' : 'below'} your usual ${usual}.`;
      items.push({metric: 'restingHeartRate', value, usual, direction, text});
    }

    const hrvEntry = pickEntry(heartRateVariability, today, true);
    if (hrvEntry) {
      const base = personalBaseline(heartRateVariability, {excludeDate: hrvEntry.date});
      const value = hrvEntry.value, usual = base ? base.median : null;
      let direction = 'typical';
      if (usual != null) { if (value < 0.85 * usual) direction = 'lower'; else if (value > 1.15 * usual) direction = 'higher'; }
      const text = direction === 'typical'
        ? `HRV ${value} ms, typical for you.`
        : `HRV ${value} ms, ${direction === 'lower' ? 'below' : 'above'} your usual ${usual}.`;
      items.push({metric: 'heartRateVariability', value, usual, direction, text});
    }

    return {items, hasData: items.length > 0};
  }

  const textOf = el => (el && el.textContent != null ? el.textContent.trim() : null);
  function firstByLocalName(el, localName) {
    const all = el.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      const node = all[i], ln = node.localName || node.tagName.replace(/^.*:/, '');
      if (ln === localName) return node;
    }
    return null;
  }

  // querySelectorAll returns a static NodeList; getElementsByTagName's live HTMLCollection re-walks
  // the whole document on every indexed access, which turns a big loop quadratic — avoid it here.
  function parseTcx(doc) {
    const activity = doc.querySelector('Activity');
    const sport = activity ? activity.getAttribute('Sport') : null;
    const samples = [];
    const trackpoints = doc.querySelectorAll('Trackpoint');
    for (let i = 0; i < trackpoints.length && samples.length < 50000; i++) {
      const tp = trackpoints[i];
      const t = Date.parse(textOf(tp.querySelector('Time')));
      if (!Number.isFinite(t)) continue;
      const hrEl = tp.querySelector('HeartRateBpm');
      const bpm = Number(textOf(hrEl && hrEl.querySelector('Value')));
      if (validBpm(bpm)) samples.push({t, bpm});
    }
    samples.sort((a, b) => a.t - b.t);
    let calories = null;
    const laps = doc.querySelectorAll('Lap');
    for (let i = 0; i < laps.length; i++) {
      const v = Number(textOf(laps[i].querySelector('Calories')));
      if (Number.isFinite(v)) calories = (calories || 0) + v;
    }
    const creator = doc.querySelector('Creator');
    const device = creator ? textOf(creator.querySelector('Name')) : null;
    return {
      format: 'tcx', sport: sport || null,
      start: samples.length ? samples[0].t : null, end: samples.length ? samples[samples.length - 1].t : null,
      samples, calories, device
    };
  }

  function parseGpx(doc) {
    const trk = doc.querySelector('trk');
    const sport = trk ? textOf(trk.querySelector('type')) : null;
    const samples = [];
    const trkpts = doc.querySelectorAll('trkpt');
    for (let i = 0; i < trkpts.length && samples.length < 50000; i++) {
      const pt = trkpts[i];
      const t = Date.parse(textOf(pt.querySelector('time')));
      if (!Number.isFinite(t)) continue;
      const bpm = Number(textOf(firstByLocalName(pt, 'hr')));
      if (validBpm(bpm)) samples.push({t, bpm});
    }
    samples.sort((a, b) => a.t - b.t);
    return {
      format: 'gpx', sport: sport || null,
      start: samples.length ? samples[0].t : null, end: samples.length ? samples[samples.length - 1].t : null,
      samples, calories: null, device: null // GPX carries no standard calories/device field
    };
  }

  // Detects TCX/GPX (XML, parsed with the caller-supplied DOMParser) or FIT/garbage; never throws.
  function parseWorkoutFile(text, {DOMParser: DP} = {}) {
    try {
      if (typeof text !== 'string' || !text.trim()) return {error: 'invalid', message: 'empty input'};
      if (text.length >= 12 && text.slice(8, 12) === '.FIT') {
        return {error: 'unsupported', message: 'FIT files are not supported here — export as TCX or GPX.'};
      }
      const isTcx = /<TrainingCenterDatabase\b/.test(text), isGpx = /<gpx\b/i.test(text);
      if (!isTcx && !isGpx) return {error: 'unsupported', message: 'Unrecognized workout file — export as TCX or GPX.'};
      const Parser = DP || (typeof window !== 'undefined' ? window.DOMParser : null);
      if (!Parser) return {error: 'invalid', message: 'no DOMParser available to parse XML'};
      const doc = new Parser().parseFromString(text, 'application/xml');
      if (!doc || doc.getElementsByTagName('parsererror').length) return {error: 'invalid', message: 'malformed XML'};
      return isTcx ? parseTcx(doc) : parseGpx(doc);
    } catch (e) {
      return {error: 'invalid', message: (e && e.message) || 'failed to parse workout file'};
    }
  }

  function toMs(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : NaN; }
    return NaN;
  }

  // Best workout whose overlap with the window, relative to the shorter of the two durations,
  // clears minOverlap. Ties go to the workout with the larger raw overlap.
  function matchWorkoutToWindow(workouts, window, {minOverlap = 0.5} = {}) {
    if (!Array.isArray(workouts) || !window) return null;
    const wStart = toMs(window.start), wEnd = toMs(window.end);
    if (!Number.isFinite(wStart) || !Number.isFinite(wEnd)) return null;
    let best = null, bestOverlap = -1;
    for (const w of workouts) {
      if (!w) continue;
      const s = toMs(w.start ?? w.startDate), e = toMs(w.end ?? w.endDate);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
      const overlap = Math.min(e, wEnd) - Math.max(s, wStart);
      if (overlap <= 0) continue;
      const shorter = Math.min(e - s, wEnd - wStart);
      if (shorter <= 0 || overlap / shorter < minOverlap) continue;
      if (overlap > bestOverlap) { bestOverlap = overlap; best = w; }
    }
    return best;
  }

  const CARDIO_MODES = {
    running: 'run', run: 'run', treadmill: 'run',
    walking: 'walk', walk: 'walk', hiking: 'walk', hike: 'walk',
    cycling: 'cycle', biking: 'cycle', bike: 'cycle', ride: 'cycle', stationarybike: 'cycle', indoorcycling: 'cycle',
    swimming: 'swim', swim: 'swim', poolswim: 'swim', openwaterswim: 'swim'
  };
  function cardioModeFor(sportOrWorkoutType) {
    if (typeof sportOrWorkoutType !== 'string') return null;
    const key = sportOrWorkoutType.trim().toLowerCase().replace(/[\s_-]+/g, '');
    return CARDIO_MODES[key] || null;
  }

  const api = {
    HR_SERVICE, HR_MEASUREMENT,
    validBpm, parseHeartRateMeasurement, createHeartRateBuffer, downsample, summarize,
    setMarksFromJournal, alignSets, sessionWindow, localDateKey, dailyFromSamples,
    personalBaseline, readinessInsight, parseWorkoutFile, matchWorkoutToWindow, cardioModeFor
  };
  if (typeof window !== 'undefined') window.IronSixWearableCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
