/* Iron Marks UI: trophy case, the earned-mark moment after a workout, and the avatar ring + emblem.
 *
 * All achievement logic lives in iron-marks-engine.js. This module only presents it and stores the
 * two things a person chooses or has already seen — the worn emblem and the marks already shown —
 * in trainerMemory.achievements, which rides the existing profile sync (like the accent theme).
 *
 * No DOM observer: an observer on the workout screen froze interaction on real phones. A light
 * poll re-evaluates only when the history signature changes.
 */
(() => {
  if (window.__ironSixMarksLoaded) return;
  const engine = window.IronSixMarksEngine;
  if (!engine) return;
  window.__ironSixMarksLoaded = true;

  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentUser = () => (typeof activeUser === 'function' ? activeUser() : null);
  const CELEBRATE_WINDOW_MS = 12 * 36e5;

  // Bold, open silhouettes at avatar size; a double hex die at badge size.
  // Paths use currentColor and need no assets, font glyphs, SVG IDs or network requests.
  const ICONS = {
    spark:'<path fill="currentColor" stroke="none" d="m13 2-8 12h6l-1 8 9-13h-6z"/>',
    hex:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m8 10 4 7 4-7M12 7v3"/>',
    hammer:'<path fill="currentColor" stroke="none" d="m4 7 5-5 11 6-5 6-4-3-6 10-3-2 6-10z"/>',
    anvil:'<path fill="currentColor" stroke="none" d="M2 6h13V4h7v5l-4 4h-4v3l4 2v3H6v-3l4-2v-3H8L2 9z"/>',
    crown:'<path d="m3 7 5 5 4-8 4 8 5-5-2 11H5zM6 21h12"/>',
    kettlebell:'<path d="M8 9V6a4 4 0 0 1 8 0v3"/><path fill="currentColor" stroke="none" d="M7 8h10l3 6v4l-3 4H7l-3-4v-4z"/>',
    compass:'<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path fill="currentColor" stroke="none" d="m17 7-3 7-7 3 3-7z"/>',
    sunrise:'<path d="M3 19h18M6 16a6 6 0 0 1 12 0M12 2v4M3 7l3 3M21 7l-3 3"/>',
    gauge:'<path d="M4 19a10 10 0 1 1 16 0M12 3v3M4 8l2 2M20 8l-2 2M8 21h8M12 16l4-6"/><circle cx="12" cy="16" r="2" fill="currentColor" stroke="none"/>',
    sixsix:'<path d="M10 4H6L3 9v10h7v-7H3M21 4h-4l-3 5v10h7v-7h-7"/>',
    medal:'<path d="m7 3 5 5 5-5M12 7l7 4v8l-7 4-7-4v-8zM9 15l2 2 4-4"/>',
    ring:'<path d="m12 2 9 5v10l-9 5-9-5V7z"/><circle cx="12" cy="12" r="5"/>',
    hidden:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" stroke-dasharray="2 3"/><path d="M10 10a2 2 0 1 1 3 1.7L12 13M12 16h.01"/>'
  };
  const icon = (id, size = 20, detail = 1) => {
    const detailed = size >= 32;
    const glyph = (ICONS[id] || ICONS.medal) + (detail>=2?'<path d="M2 3v3M22 18v3" stroke-width="1.4"/>':'') + (detail>=3?'<path d="m3 21 3-1M18 4l3-1" stroke-width="1.4"/>':'');
    return `<svg class="im-icon" data-im-glyph="${esc(id)}-${size}-${detail}" viewBox="${detailed ? '0 0 40 40' : '0 0 24 24'}" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${detailed ? `<path d="m20 1 17 9.5v19L20 39 3 29.5v-19z" fill="currentColor" fill-opacity=".07" stroke-opacity=".45"/><path d="m20 4 14 8v16l-14 8-14-8V12z" stroke-opacity=".16"/><g transform="translate(8 8)">${glyph}</g>` : glyph}</svg>`;
  };
  const markIcon = mark => icon(mark.emblem || mark.evolvedEmblem || (mark.ring ? 'ring' : 'medal'), 40, mark.detail || 1);

  // Results are cached against a fingerprint of everything in finished history that a mark reads.
  // Saves happen on every set input during a workout, but those only touch today's draft. Rebuilding
  // all achievements on each of them made the 1.5 s avatar repaint re-run the whole engine while
  // someone was logging sets — periodic main-thread work of the kind that froze phones before.
  // The fingerprint pass itself is only taken after a save or when the cheap shape of history
  // (profile, length, endpoint timestamps, array identity) changes; idle polls cost nothing.
  let cache = {fp:null, sig:null, history:null, result:null}, dirty = true;
  const HASH_MOD = 2147483647;
  const mix = (x, value) => { const str = String(value ?? ''); for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) % HASH_MOD; return (x * 31 + 7) % HASH_MOD; };
  function fingerprint(u) {
    const h = Array.isArray(u?.history) ? u.history : [];
    let x = mix(17, u?.id);
    for (const s of h) {
      x = mix(x, s?.sessionId || s?.ts); x = mix(x, s?.workoutKey); x = mix(x, s?.sets); x = mix(x, s?.plannedSets); x = mix(x, s?.trainingMode);
      x = mix(x, s?.readiness?.energy); x = mix(x, s?.readiness?.soreness); x = mix(x, s?.unit);
      for (const d of s?.details || []) {
        x = mix(x, d?.name); x = mix(x, d?.base); x = mix(x, d?.seedKey); x = mix(x, d?.unit);
        for (const set of d?.sets || []) { x = mix(x, set?.weight); x = mix(x, set?.reps); x = mix(x, set?.rir); x = mix(x, set?.done); x = mix(x, set?.unit); }
      }
    }
    return `${u?.id}|${h.length}|${x}`;
  }
  const signature = u => { const h = Array.isArray(u?.history) ? u.history : []; return `${u?.id}|${h.length}|${h[0]?.ts || 0}|${h[h.length - 1]?.ts || 0}`; };
  function evaluate(u = currentUser()) {
    if (!u) return null;
    const sig = signature(u);
    // Mid-workout saves only touch today's draft; defer the fingerprint until the workout ends.
    if (cache.result && sig === cache.sig && cache.history === u.history && (!dirty || midWorkout(u))) return cache.result;
    dirty = false;
    const fp = fingerprint(u);
    if (fp !== cache.fp || !cache.result) cache = {fp, sig, history:u.history, result:engine.evaluate(u)};
    else { cache.sig = sig; cache.history = u.history; }
    return cache.result;
  }

  function readState(u) {
    const s = u?.trainerMemory?.achievements;
    return {...(s||{}), emblem:s?.emblem || null, seen:Array.isArray(s?.seen) ? s.seen : [], introduced:!!s?.introduced};
  }
  function writeState(u, patch) {
    if (!u) return;
    u.trainerMemory = u.trainerMemory && typeof u.trainerMemory === 'object' ? u.trainerMemory : {};
    const before=readState(u);
    const next={...before,...patch,version:2};
    if(before.introduced&&before.version!==2)next.seen=[...new Set([...next.seen,...evaluate(u).marks.filter(m=>m.unlocked).map(m=>m.id)])];
    u.trainerMemory.achievements = next;
    u.localUpdatedAt = Date.now();
    if (typeof saveData === 'function') saveData();
    window.IronSixCloud?.syncNow?.(false);
  }

  function injectStyles() {
    if ($('ironMarksStyles')) return;
    const style = document.createElement('style');
    style.id = 'ironMarksStyles';
    style.textContent = `
      .im-ringed{position:relative;isolation:isolate;--im-metal:conic-gradient(from 25deg,#3f4855,#9ea8b5 18%,#626c7a 35%,#85909e 55%,#424d5c 75%,#abb5c1 92%,#3f4855)}
      .im-ringed[data-ring="bronze"]{--im-metal:conic-gradient(from 25deg,#764725,#edbd87 18%,#98603a 36%,#dca36d 58%,#764725 78%,#edbd87)}
      .im-ringed[data-ring="steel"]{--im-metal:conic-gradient(from 25deg,#6a849e,#eff7ff 20%,#93aac0 39%,#dceafa 60%,#6a849e 80%,#eff7ff)}
      .im-ringed[data-ring="gold"]{--im-metal:conic-gradient(from 25deg,#977126,#ffe9a0 20%,#c49b3c 39%,#f5d574 60%,#977126 80%,#ffe9a0)}
      .im-ringed[data-ring="emerald"]{--im-metal:conic-gradient(from 25deg,#12634c,#a6f5d4 16%,#24936e 30%,#6bdfad 45%,#125e49 60%,#60d5a4 78%,#c2ffe7 90%,#12634c)}
      .im-ringed:before{content:"";position:absolute;inset:-5px;border:2px solid transparent;border-radius:inherit;background:var(--im-metal) border-box;mask:linear-gradient(#fff 0 0) padding-box,linear-gradient(#fff 0 0);mask-composite:exclude;pointer-events:none}
      .im-avatar.im-ringed:before{inset:-7px;border-width:3px}
      .im-ringed[data-ring="emerald"]:after{content:"";position:absolute;top:-7px;left:calc(50% - 3px);width:6px;height:6px;background:#bdf9dd;transform:rotate(45deg);border:1px solid #176c50}
      .im-icon{display:block;flex-shrink:0}
      .im-backdrop{position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.76);display:flex;align-items:flex-end;justify-content:center;padding:8px}
      .im-backdrop[hidden]{display:none}
      .im-modal{width:min(100%,680px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;background:linear-gradient(155deg,rgba(255,255,255,.025),transparent 32%),var(--surface);border:1px solid #363b47;border-radius:24px;padding:22px 16px max(20px,env(safe-area-inset-bottom));box-shadow:0 24px 80px #0009;box-sizing:border-box}
      .im-head{display:flex;align-items:center;gap:16px;margin:4px 4px 24px}
      .im-head>div:nth-child(2){min-width:0;flex:1}
      .im-head h3{margin:0;font-size:22px;letter-spacing:-.7px;line-height:1.15}.im-head p{margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.5}
      .im-head .im-close{margin-left:auto;align-self:flex-start}
      .im-close{border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:50%;width:40px;height:40px;font-weight:700;cursor:pointer;flex:0 0 auto}
      .im-avatar{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--accent);color:#0b0c0f;font-weight:900;font-size:18px;flex:0 0 auto}
      .im-section{margin:26px 0 0}.im-section h4{margin:0 0 12px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
      .im-bar{height:5px;border-radius:99px;background:#373e4b;overflow:hidden;margin-top:9px}.im-bar i{display:block;height:100%;border-radius:inherit;background:var(--accent)}
      .im-ringline{padding:14px 16px;border:1px solid var(--line);border-radius:14px;font-size:13px;color:var(--text);background:var(--surface2);line-height:1.6}.im-ringline small{color:var(--muted)}
      .im-emblems{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
      .im-emblem{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:86px;padding:9px 3px;border:1px solid var(--line);border-radius:13px;background:var(--surface2);color:var(--text);font:inherit;font-size:11px;font-weight:650;cursor:pointer}
      .im-emblem small{font-size:9px;font-weight:500;color:var(--muted)}
      .im-emblem.active{border-color:var(--accent);background:rgba(var(--accent-rgb),.09);box-shadow:inset 0 0 0 1px var(--accent)}
      .im-emblem:disabled{color:var(--muted);background:var(--surface);border-style:dashed;cursor:not-allowed}.im-emblem:disabled .im-icon{opacity:.65}
      .im-emblem:focus-visible,.im-close:focus-visible,.im-wear:focus-visible{outline:2px solid var(--text);outline-offset:3px}
      .im-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}
      .im-card{position:relative;display:flex;gap:12px;align-items:flex-start;padding:15px 12px;border:1px solid var(--line);border-radius:15px;background:var(--surface2)}
      .im-badge{width:44px;height:44px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--muted)}
      .im-card.earned{background:linear-gradient(115deg,rgba(var(--accent-rgb),.055),transparent 75%),var(--surface2);border-color:rgba(var(--accent-rgb),.23)}
      .im-card.earned .im-badge{color:var(--accent)}.im-card.locked .im-badge{color:#8e98aa}.im-card.hidden{border-style:dashed;background:transparent}
      .im-body{flex:1;min-width:0}.im-body strong{display:block;font-size:13px;line-height:1.4}.im-body span{display:block;font-size:12px;color:var(--muted);line-height:1.5;margin-top:3px}.im-body em{display:block;font-style:normal;font-size:11px;color:var(--text);margin-top:8px;line-height:1.5;font-weight:600}
      .im-count{font-size:10px;color:var(--muted);white-space:nowrap;display:block;margin-top:9px;letter-spacing:.03em}
      .im-earned-list{display:grid;gap:10px;margin:4px 0 20px}.im-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}
      .im-wear{border:1px solid rgba(var(--accent-rgb),.45);background:rgba(var(--accent-rgb),.1);color:var(--text);border-radius:10px;min-height:44px;padding:9px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;margin-top:10px}
      #ironMarksEarned:not([hidden]) .im-head .im-avatar{animation:im-settle 520ms cubic-bezier(.22,.8,.22,1) both}
      @keyframes im-settle{from{opacity:0;transform:translateY(8px) scale(.88)}to{opacity:1;transform:translateY(0) scale(1)}}
      @media(prefers-reduced-motion:reduce){#ironMarksEarned:not([hidden]) .im-head .im-avatar{animation:none}}

      .im-jump{display:flex;gap:8px;margin-top:12px}.im-jump button{flex:1;min-height:44px;background:var(--surface2);border:1px solid var(--line);border-radius:10px;color:var(--text);font:inherit;font-size:12px;cursor:pointer}.im-mark-group{border-top:1px solid var(--line);padding-top:14px}.im-mark-group summary{cursor:pointer;font-size:13px;font-weight:700;min-height:36px;line-height:1.5}.im-mark-group summary small{font-size:11px;font-weight:400;color:var(--muted);float:right}.im-jump button:focus-visible,.im-mark-group summary:focus-visible{outline:2px solid var(--text);outline-offset:3px}
      .im-help{font-size:12px;color:var(--muted);line-height:1.5;margin:8px 0 12px}
      .im-customize{display:grid;gap:12px}.im-customize label{font-size:12px;color:var(--muted);display:grid;gap:6px}.im-customize select{width:100%;min-height:44px;border:1px solid var(--line);border-radius:10px;background:var(--surface2);color:var(--text);font:inherit;padding:10px}
      .im-story{padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--surface2);margin:8px 0;font-size:13px}.im-story p{font-size:12px;color:var(--muted);line-height:1.6}.im-story summary{cursor:pointer;min-height:24px;font-weight:650}.im-block-days{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.im-block-days span{font-size:11px;color:var(--muted);padding:8px;background:var(--surface);border-radius:8px}.im-block-days b{display:block;color:var(--text);margin-top:4px}
      #ironMarksGoal.im-today-goal{display:block;text-align:left;width:100%;padding:12px 0 0;margin-top:12px;border:0;border-top:1px solid var(--line);background:transparent;color:var(--text);font:inherit;cursor:pointer;min-height:44px;box-shadow:none}#ironMarksGoal[hidden]{display:none}#ironMarksGoal span{display:block;font-size:11px;line-height:1.4;color:var(--muted)}#ironMarksGoal strong{display:block;font-size:12px;margin:4px 0}#ironMarksGoal small{color:var(--muted);float:right;font-size:11px}.im-customize select:focus-visible,#ironMarksGoal:focus-visible{outline:2px solid var(--text);outline-offset:3px}
      /* On the launch screen the goal is a single tappable line, so Begin workout stays the one focus.
         The full explanation lives in the trophy case and the button's accessible name. */
      #today.session-prestart #ironMarksGoal.im-today-goal{display:flex;align-items:baseline;gap:8px;padding:9px 0 0;margin-top:10px;min-height:36px}
      #today.session-prestart #ironMarksGoal span:first-child{flex:0 0 auto;font-size:11px}
      #today.session-prestart #ironMarksGoal strong{flex:1;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #today.session-prestart #ironMarksGoal strong small{float:none;margin-left:6px}
      #today.session-prestart #ironMarksGoal span:last-child{display:none}
      @media(min-width:640px){.im-backdrop{align-items:center;padding:24px}.im-modal{padding:28px;max-height:calc(100dvh - 48px)}.im-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.im-emblems{grid-template-columns:repeat(6,minmax(0,1fr))}}

    `;
    document.head.appendChild(style);
  }

  function paintAvatar(el, u, fallbackText) {
    if (!el || !u) return;
    injectStyles();
    const result = evaluate(u), avatar = engine.avatarFor(u, result);
    el.classList.toggle('im-ringed', !!avatar.ring);
    if (avatar.ring) el.style.setProperty('--im-ring', avatar.ring.color); else el.style.removeProperty('--im-ring');
    el.dataset.ring = avatar.ring?.id || '';
    el.dataset.emblem = avatar.emblem || '';
    if (avatar.emblem) {
      const art = icon(avatar.emblem, el.classList.contains('im-avatar') ? 32 : 17, avatar.detail);
      const size = el.classList.contains('im-avatar') ? 32 : 17;
      if (el.firstElementChild?.getAttribute('data-im-glyph') !== `${avatar.emblem}-${size}-${avatar.detail}`) el.innerHTML = art;
    }
    else if (fallbackText != null) el.textContent = fallbackText;
    el.setAttribute('title', [avatar.ring ? `${avatar.ring.label} ring` : '', avatar.emblem ? `${engine.EMBLEMS[avatar.emblem]} · ${engine.EVOLUTIONS[avatar.detail-1].label}` : '', avatar.title || ''].filter(Boolean).join(' · '));
  }
  // Called by the profile menu after it writes initials, so the emblem simply replaces them.
  function decorateAvatar(el, u) { paintAvatar(el, u, initialsOf(u)); }

  function summary(u = currentUser()) {
    const r = evaluate(u);
    return r ? `${r.marks.filter(m => m.unlocked).length} / ${r.marks.length}` : '';
  }

  function ensureModal(id, label) {
    injectStyles();
    let backdrop = $(id);
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = id;
    backdrop.className = 'im-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `<div class="im-modal" role="dialog" aria-modal="true" aria-label="${esc(label)}"></div>`;
    backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.hidden = true; });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') backdrop.hidden = true; });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  const initialsOf = u => window.IronSixProfileMenu?.initials?.(u?.name) || String(u?.name || '?').slice(0, 1).toUpperCase();
  const dateOf = ts => { try { return new Date(ts).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}); } catch (_) { return ''; } };

  function markCard(mark) {
    if (mark.hidden) return `<div class="im-card hidden"><div class="im-badge">${icon('hidden', 40)}</div><div class="im-body"><strong>Hidden mark</strong><span>Keep training to reveal it.</span></div></div>`;
    const pct = Math.min(100, Math.max(0, Math.round(mark.value / mark.target * 100)));
    const status = mark.unlocked
      ? `<em>Earned${mark.unlockedAt ? ' ' + esc(dateOf(mark.unlockedAt)) : ''}${mark.emblem ? ` · unlocks the ${esc(engine.EMBLEMS[mark.emblem])} emblem` : ''}${mark.ring ? ' · avatar ring' : ''}</em>`
      : `<div class="im-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>`;
    return `<div class="im-card ${mark.unlocked ? 'earned' : 'locked'}" data-mark="${esc(mark.id)}"><div class="im-badge">${markIcon(mark)}</div><div class="im-body"><strong>${esc(mark.title)}</strong><span>${esc(mark.text)}</span>${status}${mark.unlocked ? '' : `<small class="im-count">Locked · ${mark.value} / ${mark.target}</small>`}</div></div>`;
  }

  function evidence(event) {
    if(!event)return 'Confirmed from your completed training logs.';
    return `${event.name}: ${event.from} → ${event.to} reps at ${event.weight} ${event.unit}, RIR ${event.rir}. Repeated ${dateOf(event.ts)}.`;
  }
  function customization(u, r) {
    const state=readState(u),avatar=engine.avatarFor(u,r),evo=avatar.emblem?r.evolutions[avatar.emblem]:null;
    const options=(items,value)=>items.map(o=>`<option value="${esc(o.id)}" ${o.id===value?'selected':''} ${o.unlocked===false?'disabled':''}>${esc(o.label)}${o.unlocked===false?' · Locked':''}</option>`).join('');
    const ringOptions=[{id:'auto',label:'Highest earned ring'},{id:'none',label:'No ring'},...engine.RINGS.map(t=>({id:t.id,label:`${t.label} · ${t.rotations} rotations`,unlocked:r.stats.rotations>=t.rotations}))];
    const detailOptions=[{id:'auto',label:'Auto · highest earned'},...engine.EVOLUTIONS.map(t=>({id:String(t.level),label:t.label,unlocked:!!evo&&evo.level>=t.level}))];
    const titles=r.titles.map(t=>({...t,label:t.label+(t.mark?' · '+r.marks.find(m=>m.id===t.mark)?.title:'')}));
    return `<div class="im-section" id="imStylePanel"><h4>Make it yours</h4><p class="im-help">Your favorites stay yours. Choose any earned ring and detail level.</p><div class="im-customize">
      <label>Avatar ring<select data-custom="ring">${options(ringOptions,state.ring||'auto')}</select></label>
      <label>Emblem detail<select data-custom="detail" ${evo?'':'disabled'}>${options(detailOptions,state.detail||'auto')}</select></label>
      <label>Profile title<select data-custom="title">${options(titles,state.title||'none')}</select></label></div>
      ${evo?`<p class="im-help">${esc(engine.EMBLEMS[avatar.emblem])} · ${engine.EVOLUTIONS[avatar.detail-1].label}. ${evo.level<3?`Next: ${engine.EVOLUTIONS[evo.level].label} at ${evo.tiers[evo.level].target} ${esc(evo.requirement)} (${evo.value} so far).`:'Every detail level earned.'}</p>`:'<p class="im-help">Wear an emblem to see its evolution path.</p>'}</div>`;
  }
  function depthPanel(r) {
    const current=r.depth.blocks.current,latest=r.depth.blocks.completed.at(-1),events=r.depth.improvements.slice().reverse();
    return `<div class="im-section" id="imProgressPanel"><h4>Your training story</h4><div class="im-story"><strong>Balanced block ${current.number}</strong><p>Four successful sessions of each program day. No deadline; recovery days do not reset your progress.</p><div class="im-block-days">${engine.ROTATION.map(k=>`<span>${esc(engine.DAY_NAMES[k])}<b>${Math.min(current.counts[k],4)} / 4</b></span>`).join('')}</div><div class="im-bar" aria-label="${current.done} of 24 block sessions"><i style="width:${current.done/24*100}%"></i></div></div>
      ${latest?`<details class="im-story"><summary>Block ${latest.number} complete · ${dateOf(latest.end)}</summary><p>${latest.sessions} successful sessions across all six program days. ${latest.improvements.length} confirmed rep improvement${latest.improvements.length===1?'':'s'} recorded during this block.</p>${latest.improvements.slice(-3).map(e=>`<p>${esc(evidence(e))}</p>`).join('')}${!latest.improvements.length?'<p>Comparable performance data was not available or no repeatable rep increase was recorded. Completing the block is an achievement of its own.</p>':''}</details>`:''}
      ${r.depth.blocks.completed.length>1?`<details class="im-story"><summary>Earlier balanced blocks (${r.depth.blocks.completed.length-1})</summary>${r.depth.blocks.completed.slice(0,-1).reverse().map(b=>`<p><strong>Block ${b.number} · ${dateOf(b.end)}</strong><br>${b.sessions} successful sessions · ${b.improvements.length} confirmed improvements.</p>`).join('')}</details>`:''}
      <details class="im-story"><summary>Personal progress · ${r.depth.improvements.length} confirmed</summary><p>Extra reps count after you repeat them at least 24 hours later at the same exercise, load and logged RIR. This recognizes your logs, not a form assessment or a new weight target.</p>${events.slice(0,3).map(e=>`<p>${esc(evidence(e))}</p>`).join('')}${events.length>3?`<details><summary>Earlier improvements (${events.length-3})</summary>${events.slice(3).map(e=>`<p>${esc(evidence(e))}</p>`).join('')}</details>`:''}${!events.length?'<p>Keep logging reps and RIR as you follow your plan. Missing effort data, assisted and bodyweight movements are not compared.</p>':''}</details></div>`;
  }
  function customize(key,value) {
    const u=currentUser(),r=evaluate(u);if(!u||!r)return false;
    const avatar=engine.avatarFor(u,r);
    const allowed=key==='ring'?(value==='auto'||value==='none'||engine.RINGS.some(t=>t.id===value&&r.stats.rotations>=t.rotations))
      :key==='detail'?(value==='auto'||(avatar.emblem&&['1','2','3'].includes(value)&&Number(value)<=r.evolutions[avatar.emblem].level))
      :key==='title'?r.titles.some(t=>t.id===value&&t.unlocked):false;
    if(!allowed)return false;
    writeState(u,{[key]:value});window.IronSixProfileMenu?.render?.();open();return true;
  }
  function renderGoal() {
    const u=currentUser(),host=u?.trainingMode==='circuit'?document.querySelector('#today > .hero'):$('sessionStart');
    let goal=$('ironMarksGoal');
    if(!u||!host){if(goal)goal.hidden=true;return;}
    if(!goal){goal=document.createElement('button');goal.type='button';goal.id='ironMarksGoal';goal.className='im-today-goal';goal.addEventListener('click',open);}
    if(goal.parentNode!==host)host.append(goal);
    goal.hidden=midWorkout(u);
    if(goal.hidden)return;
    const r=evaluate(u),next=engine.nextGoal(u,r),avatar=engine.avatarFor(u,r);
    const content=`<span>${avatar.title?esc(avatar.title)+' · ':''}Your next mark</span><strong>${esc(next.title)} <small>${next.value} / ${next.target}</small></strong><span>${esc(next.text)}</span>`;
    if(goal.innerHTML!==content)goal.innerHTML=content;
    const label=`Your next mark: ${next.title}, ${next.value} of ${next.target}. ${next.text}`;
    if(goal.getAttribute('aria-label')!==label)goal.setAttribute('aria-label',label);
  }

  function open() {
    const u = currentUser(), r = evaluate(u);
    if (!u || !r) return;
    const backdrop = ensureModal('ironMarksModal', 'Iron Marks'), modal = backdrop.querySelector('.im-modal'), state = readState(u);
    const earned = r.marks.filter(m => m.unlocked).length, worn = engine.avatarFor(u, r).emblem;
    const closest = r.marks.filter(m => !m.unlocked && !m.hidden).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 3);
    const ringLine = r.nextRing
      ? `${r.stats.rotations} full rotation${r.stats.rotations === 1 ? '' : 's'} <small>· ${esc(r.nextRing.label)} ring at ${r.nextRing.rotations}</small><div class="im-bar"><i style="width:${Math.round(r.stats.rotations / r.nextRing.rotations * 100)}%"></i></div>`
      : `${r.stats.rotations} full rotations <small>· every ring earned</small>`;
    const emblemButtons = Object.entries(engine.EMBLEMS).map(([id, label]) => {
      const mark = r.marks.find(m => m.emblem === id), owned = r.emblems.includes(id);
      if (!owned && mark?.hidden) return '';
      return `<button type="button" class="im-emblem ${worn === id ? 'active' : ''}" data-wear="${id}" aria-pressed="${worn === id}" ${owned ? '' : 'disabled'} title="${esc(owned ? label : `${label}: ${mark?.text || ''}`)}">${icon(id, 32, worn===id ? engine.avatarFor(u,r).detail : r.evolutions[id]?.level || 1)}<span>${esc(label)}</span><small>${worn === id ? '✓ Wearing' : owned ? 'Owned' : 'Locked'}</small></button>`;
    }).join('');
    modal.innerHTML = `<div class="im-head"><div class="im-avatar" id="imAvatarPreview"></div><div><h3>Iron Marks</h3><p>${earned} of ${r.marks.length} earned${r.ring ? ` · ${esc(r.ring.label)} ring earned` : ''}. Earned from finished sessions; missed days never cost a mark.</p></div><button class="im-close" type="button" aria-label="Close">✕</button></div>`
      + `<div class="im-ringline">${ringLine}</div><nav class="im-jump" aria-label="Iron Marks sections"><button type="button" data-jump="imCollectionPanel">Marks</button><button type="button" data-jump="imProgressPanel">Progress</button><button type="button" data-jump="imStylePanel">Style</button></nav>`
      + `<div class="im-section"><h4>Profile emblem</h4><div class="im-emblems"><button type="button" class="im-emblem ${worn ? '' : 'active'}" data-wear="" aria-pressed="${!worn}"><span>${esc(initialsOf(u))}</span><span>Initials</span><small>${worn ? 'Available' : '✓ Wearing'}</small></button>${emblemButtons}</div></div>`
      + customization(u,r) + depthPanel(r)
      + (closest.length ? `<div class="im-section"><h4>Closest next</h4><div class="im-grid">${closest.map(markCard).join('')}</div></div>` : '')
      + `<div id="imCollectionPanel">${engine.GROUPS.map(g => {const group=r.marks.filter(m=>m.group===g.id);return `<details class="im-section im-mark-group" ${g.id==='six'?'open':''}><summary>${esc(g.title)} <small>${group.filter(m=>m.unlocked).length} / ${group.length} earned</small></summary><div class="im-grid">${group.map(markCard).join('')}</div></details>`;}).join('')}</div>`;
    paintAvatar(modal.querySelector('#imAvatarPreview'), u, initialsOf(u));
    modal.querySelector('.im-close').addEventListener('click', () => { backdrop.hidden = true; });
    modal.querySelectorAll('[data-wear]').forEach(button => button.addEventListener('click', () => wear(button.dataset.wear || null, true)));
    modal.querySelectorAll('[data-jump]').forEach(button=>button.addEventListener('click',()=>modal.querySelector('#'+button.dataset.jump)?.scrollIntoView({block:'start',behavior:'instant'})));
    modal.querySelectorAll('[data-custom]').forEach(select=>select.addEventListener('change',()=>customize(select.dataset.custom,select.value)));
    const wornTitle=engine.avatarFor(u,r).title;if(wornTitle)modal.querySelector('.im-head p').insertAdjacentHTML('afterbegin',`<strong>${esc(wornTitle)}</strong><br>`);
    backdrop.hidden = false;
    if (state.introduced === false) writeState(u, {introduced:true, seen:r.marks.filter(m => m.unlocked).map(m => m.id)});
  }

  function wear(emblem, reopen) {
    const u = currentUser(), r = evaluate(u);
    if (!u || !r || (emblem && !r.emblems.includes(emblem))) return false;
    writeState(u, {emblem:emblem || null});
    window.IronSixProfileMenu?.render?.();
    if (reopen && $('ironMarksModal') && !$('ironMarksModal').hidden) open();
    if (typeof toast === 'function') toast(emblem ? `${engine.EMBLEMS[emblem]} emblem on` : 'Showing your initials');
    return true;
  }

  function celebrate(marks) {
    const u = currentUser();
    const backdrop = ensureModal('ironMarksEarned', 'Iron Mark earned'), modal = backdrop.querySelector('.im-modal');
    const worn = engine.avatarFor(u, evaluate(u)).emblem;
    modal.innerHTML = `<div class="im-head"><div class="im-avatar" id="imEarnedAvatar"></div><div><h3>${marks.length === 1 ? 'Iron Mark earned' : `${marks.length} Iron Marks earned`}</h3><p>From the session you just finished.</p></div><button class="im-close" type="button" aria-label="Close">✕</button></div>`
      + `<div class="im-earned-list">${marks.map(m => `<div class="im-card earned"><div class="im-badge">${markIcon(m)}</div><div class="im-body"><strong>${esc(m.title)}</strong><span>${esc(m.text)}</span>${m.evolvedEmblem ? `<em>A new detail level for your ${esc(engine.EMBLEMS[m.evolvedEmblem])} emblem. Choose it in your collection.</em>` : ''}${m.group==='progress' ? `<em>${esc(evidence(evaluate(u).depth.improvements.filter(e=>e.ts<=m.unlockedAt).at(-1)))}</em>` : ''}${m.group==='blocks' ? `<em>${evaluate(u).depth.blocks.completed.find(b=>b.end===m.unlockedAt)?.sessions || 24} successful sessions across all six days.</em>` : ''}${m.ring ? `<em>Unlocked the ${esc(m.title.replace(/ Ring$/, ''))} ring. Choose it in your collection.</em>` : ''}${m.emblem && m.emblem !== worn ? `<button type="button" class="im-wear" data-wear="${m.emblem}">Wear the ${esc(engine.EMBLEMS[m.emblem])} emblem</button>` : ''}</div></div>`).join('')}</div>`
      + `<div class="im-actions"><button type="button" class="btn secondary" data-all>See all marks</button><button type="button" class="btn primary" data-done>Nice</button></div>`;
    paintAvatar(modal.querySelector('#imEarnedAvatar'), u, initialsOf(u));
    const done = () => { backdrop.hidden = true; };
    modal.querySelector('.im-close').addEventListener('click', done);
    modal.querySelector('[data-done]').addEventListener('click', done);
    modal.querySelector('[data-all]').addEventListener('click', () => { done(); open(); });
    modal.querySelectorAll('[data-wear]').forEach(button => button.addEventListener('click', () => {
      if (wear(button.dataset.wear, false)) { button.textContent = 'Wearing it'; button.disabled = true; paintAvatar(modal.querySelector('#imEarnedAvatar'), currentUser(), initialsOf(currentUser())); }
    }));
    backdrop.hidden = false;
  }

  const midWorkout = u => Object.entries(u?.today || {}).some(([key, set]) => /^\d+-\d+$/.test(key) && set && (set.done || String(set.weight || '').trim() || String(set.reps || '').trim()));

  // Compare earned marks with the ones already shown. First run for a profile records what was
  // already earned without a fanfare; marks that arrive through sync or a restore (not unlocked
  // recently) are recorded quietly too, so nobody is congratulated twice for the same session.
  function check(now = Date.now()) {
    const u = currentUser();
    if (!u || (typeof document !== 'undefined' && document.hidden) || midWorkout(u)) return null;
    if ($('ironMarksEarned') && !$('ironMarksEarned').hidden) return null;
    const r = evaluate(u), state = readState(u), unlocked = r.marks.filter(m => m.unlocked);
    if (state.introduced && state.version !== 2) {
      writeState(u,{seen:[...new Set([...state.seen,...unlocked.map(m=>m.id)])]});
      return {upgraded:true};
    }
    if (!state.introduced) {
      writeState(u, {introduced:true, seen:unlocked.map(m => m.id)});
      if (unlocked.length && typeof toast === 'function') toast(`Iron Marks are here: you have already earned ${unlocked.length}. Find them in your profile menu.`);
      return {introduced:unlocked.length};
    }
    const fresh = unlocked.filter(m => !state.seen.includes(m.id));
    if (!fresh.length) return null;
    writeState(u, {seen:[...new Set([...state.seen, ...fresh.map(m => m.id)])]});
    const recent = fresh.filter(m => m.unlockedAt && now - m.unlockedAt <= CELEBRATE_WINDOW_MS);
    if (recent.length) celebrate(recent);
    window.IronSixProfileMenu?.render?.();
    return {celebrated:recent.map(m => m.id), quiet:fresh.length - recent.length};
  }

  injectStyles();
  setInterval(() => { try { check(); renderGoal(); } catch (error) { console.error('[Iron Six] marks check failed', error); } }, 1500);
  addEventListener('load', () => window.IronSixProfileMenu?.render?.());
  window.IronSixMarks = {open, check, wear, summary, evaluate, decorateAvatar, readState, customize, renderGoal, fingerprint};
  // A save may have corrected history in place (same length and timestamps), so it re-checks the
  // fingerprint once; saves that only touched today's draft leave the fingerprint, and results, alone.
  const baseSave=window.saveData;
  if(typeof baseSave==='function')window.saveData=function(){dirty=true;return baseSave.apply(this,arguments);};
  const baseRender=window.renderAll;
  if(typeof baseRender==='function')window.renderAll=function(){const result=baseRender.apply(this,arguments);renderGoal();return result;};
  window.IronSixProfileMenu?.render?.();
  renderGoal();
})();
