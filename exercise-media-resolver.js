/* Resolves an exercise name to the best media the app is allowed to show, and says which
   tier answered. The tiers below descend in fidelity, and everything under an exact match
   carries a label, because showing a near-miss without saying so is how a user ends up
   learning the wrong movement. */
(function (root) {
  const registry = root.IronSixExerciseRegistry || (typeof require !== 'undefined' ? require('./exercise-registry.js') : null);
  const manifest = root.IronSixMediaManifest || (typeof require !== 'undefined' ? require('./exercise-media-manifest.js') : null);
  // The legacy catalogue also covers movements the workout builders never program (and that
  // coach-curated candidates can still ask for), so it stays reachable by name on its own.
  const catalogue = root.IronSixExerciseMedia || (typeof require !== 'undefined' ? require('./exercise-media-catalog.js') : null);

  const TIERS = {
    1: 'first-party-exact',
    2: 'legacy-exact',
    3: 'alias-exact',
    4: 'canonical-variation',
    5: 'pattern-reference',
    6: 'coming-soon'
  };

  const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

  function withMedia(entry) {
    if (!entry || !entry.mediaId || !manifest) return null;
    return manifest.get(entry.mediaId);
  }

  // Tier 4/5 candidates: another exercise that already has media and is close enough to be
  // instructive. Equipment must match for a "variation"; only the pattern for a "reference".
  function related(entry, { requireEquipment }) {
    if (!registry || !entry) return null;
    const pool = registry.exercises.filter(e =>
      e.id !== entry.id && e.mediaId && e.pattern === entry.pattern &&
      (!requireEquipment || sameSet(e.equipment || [], entry.equipment || [])));
    if (!pool.length) return null;
    // Prefer first-party, then a stable alphabetical pick so the choice never flickers.
    const rank = e => { const m = manifest.get(e.mediaId); return m && m.tier === 'schematic' ? 0 : m && m.tier === 'professional' ? 0 : 1; };
    return pool.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))[0];
  }

  function result(tier, media, extra) {
    return Object.assign({ tier, tierName: TIERS[tier], media: media || null, exact: tier <= 3, provisional: !!(media && media.status === 'schematic'), label: null, via: null }, extra || {});
  }

  function resolveOne(name) {
    const entry = registry ? registry.lookup(name) : null;
    const media = withMedia(entry);

    if (media) {
      const exactTier = media.tier === 'legacy' ? (entry.mediaMatch === 'alias' ? 3 : 2) : 1;
      const out = result(exactTier, media, { exercise: entry });
      // A first-party drawing that is not yet final art says so rather than passing as final.
      if (media.status === 'schematic') out.label = 'Iron Six schematic — illustration in progress';
      return out;
    }

    // Not in the registry, but the catalogue may still hold this exact movement.
    if (!entry && catalogue) {
      const rec = catalogue.resolve(name);
      if (rec) {
        const direct = manifest && manifest.get('legacy-' + rec.id);
        if (direct) {
          const primary = String(rec.names[0] || '').toLowerCase() === String(name || '').toLowerCase();
          return result(primary ? 2 : 3, direct, { exercise: null });
        }
      }
    }

    const variation = related(entry, { requireEquipment: true });
    if (variation) {
      const m = withMedia(variation);
      return result(4, m, { exercise: entry, via: variation.name, label: 'Closest approved variation shown: ' + variation.name });
    }
    const pattern = related(entry, { requireEquipment: false });
    if (pattern) {
      const m = withMedia(pattern);
      return result(5, m, { exercise: entry, via: pattern.name, label: 'Movement-pattern reference shown: ' + pattern.name });
    }
    return result(6, null, { exercise: entry, label: 'Demo coming soon' });
  }

  // Supersets are two movements; each half resolves on its own so one is never used to stand
  // in for the other.
  function resolve(name) {
    const parts = String(name || '').split(' + ').map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) return { superset: true, parts: parts.map(p => Object.assign({ name: p }, resolveOne(p))) };
    return Object.assign({ superset: false, name: parts[0] || '' }, resolveOne(parts[0] || ''));
  }

  // The motion-demo layer (media-experience-v2.js) was written against the legacy catalogue's
  // record shape. This exposes the resolved media in that shape so it can honour the tier
  // order and the substitution label without being rewritten.
  function legacyShape(name) {
    const r = resolveOne(name);
    if (!r.media) return null;
    const frames = [r.media.start, r.media.finish].filter(Boolean);
    if (!frames.length) return null;
    return {
      frames, title: r.media.title, source: r.media.source, author: r.media.author,
      license: r.media.license, licenseUrl: r.media.licenseUrl,
      tier: r.tier, label: r.label, provisional: r.provisional, cues: r.media.cues || [], mistake: r.media.mistake || ''
    };
  }

  const api = { resolve, resolveOne, legacyShape, TIERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IronSixMediaResolver = api;
})(typeof window !== 'undefined' ? window : globalThis);
