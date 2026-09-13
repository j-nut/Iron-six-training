/* Profile-specific accent themes. Iron Six green remains the default. */
(() => {
  if (window.__ironSixAccentThemeLoaded) return;
  window.__ironSixAccentThemeLoaded = true;

  const PALETTE = {
    green:  {label:'Iron Six Green', hex:'#2ee580', rgb:'46,229,128'},
    blue:   {label:'Electric Blue', hex:'#5ea8ff', rgb:'94,168,255'},
    cyan:   {label:'Arctic Cyan', hex:'#32d6e6', rgb:'50,214,230'},
    purple: {label:'Pulse Purple', hex:'#a98bff', rgb:'169,139,255'},
    orange: {label:'Ember Orange', hex:'#ff9f43', rgb:'255,159,67'},
    red:    {label:'Signal Red', hex:'#ff6b6b', rgb:'255,107,107'}
  };
  const $ = id => document.getElementById(id);
  let currentProfile = null, currentTheme = null;

  function choiceFor(user) {
    const key = String(user?.accentTheme || 'green').toLowerCase();
    return PALETTE[key] ? key : 'green';
  }

  function injectStyles() {
    if ($('ironSixAccentThemeStyles')) return;
    const style = document.createElement('style');
    style.id = 'ironSixAccentThemeStyles';
    style.textContent = `
      :root{--accent-rgb:46,229,128;--accent-soft:rgba(var(--accent-rgb),.12);--accent-faint:rgba(var(--accent-rgb),.075);--accent-border:rgba(var(--accent-rgb),.32)}
      .hero{background:linear-gradient(145deg,var(--accent-soft),rgba(255,255,255,.025) 45%,rgba(255,255,255,.01))!important}
      .navbtn.active{background:rgba(var(--accent-rgb),.09)!important}
      .suggestion{background:var(--accent-faint)!important;border-color:rgba(var(--accent-rgb),.18)!important}
      .profile-card.active{border-color:rgba(var(--accent-rgb),.55)!important}
      .field:focus{background:rgba(var(--accent-rgb),.07)!important}
      .done.active{box-shadow:0 0 0 3px rgba(var(--accent-rgb),.16)!important}
      #scNextBtn{border-color:rgba(var(--accent-rgb),.45)!important;background:rgba(var(--accent-rgb),.09)!important;box-shadow:0 0 0 1px rgba(var(--accent-rgb),.05),0 4px 14px rgba(var(--accent-rgb),.08)!important}
      #scNextBtn.ready{background:rgba(var(--accent-rgb),.16)!important;border-color:rgba(var(--accent-rgb),.75)!important;box-shadow:0 0 0 1px rgba(var(--accent-rgb),.12),0 0 18px rgba(var(--accent-rgb),.22)!important}
      .awc-action.primary-lite{border-color:rgba(var(--accent-rgb),.38)!important;background:rgba(var(--accent-rgb),.08)!important}
      #exerciseList.awc-focus .set-feedback-btn.active{background:rgba(var(--accent-rgb),.14)!important}
      .accent-modal-backdrop{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.66);display:flex;align-items:flex-end;justify-content:center;padding:14px}
      .accent-modal-backdrop[hidden]{display:none}
      .accent-modal{width:min(100%,520px);background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 22px 64px rgba(0,0,0,.55)}
      .accent-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
      .accent-modal h3{margin:0;font-size:18px}.accent-modal p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.45}
      .accent-close{border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:10px;width:38px;height:38px;font-weight:800;cursor:pointer}
      .accent-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      .accent-choice{display:flex;align-items:center;gap:9px;min-height:50px;padding:9px;border:1px solid var(--line);border-radius:13px;background:var(--surface2);color:var(--text);cursor:pointer;text-align:left;font-size:11px;font-weight:750}
      .accent-choice.active{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
      .accent-swatch{width:24px;height:24px;border-radius:50%;background:var(--swatch);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);flex:0 0 auto}
      @media(max-width:420px){.accent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function apply(user = (typeof activeUser === 'function' ? activeUser() : null)) {
    injectStyles();
    const key = choiceFor(user), theme = PALETTE[key];
    document.documentElement.style.setProperty('--accent', theme.hex);
    document.documentElement.style.setProperty('--accent-rgb', theme.rgb);
    document.documentElement.style.setProperty('--accent-soft', `rgba(${theme.rgb},.12)`);
    document.documentElement.style.setProperty('--accent-faint', `rgba(${theme.rgb},.075)`);
    document.documentElement.style.setProperty('--accent-border', `rgba(${theme.rgb},.32)`);
    document.documentElement.style.setProperty('--premium-accent-soft', `rgba(${theme.rgb},.12)`);
    document.documentElement.dataset.accentTheme = key;
    currentProfile = user?.id || null;
    currentTheme = key;
    return key;
  }

  function ensureModal() {
    if ($('accentThemeModal')) return $('accentThemeModal');
    injectStyles();
    const backdrop = document.createElement('div');
    backdrop.id = 'accentThemeModal';
    backdrop.className = 'accent-modal-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `<div class="accent-modal" role="dialog" aria-modal="true" aria-labelledby="accentThemeTitle"><div class="accent-modal-head"><div><h3 id="accentThemeTitle">Accent color</h3><p>Changes highlights and controls while keeping the Iron Six dark theme.</p></div><button class="accent-close" type="button" aria-label="Close">✕</button></div><div class="accent-grid"></div></div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.accent-close').addEventListener('click', close);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !backdrop.hidden) close(); });
    return backdrop;
  }

  function renderChoices() {
    const modal = ensureModal(), grid = modal.querySelector('.accent-grid'), user = typeof activeUser === 'function' ? activeUser() : null;
    const selected = choiceFor(user);
    grid.innerHTML = Object.entries(PALETTE).map(([key,theme]) => `<button type="button" class="accent-choice ${key===selected?'active':''}" data-accent="${key}"><span class="accent-swatch" style="--swatch:${theme.hex}"></span><span>${theme.label}</span></button>`).join('');
    grid.querySelectorAll('[data-accent]').forEach(button => button.addEventListener('click', () => {
      const profile = typeof activeUser === 'function' ? activeUser() : null;
      if (!profile || !PALETTE[button.dataset.accent]) return;
      profile.accentTheme = button.dataset.accent;
      profile.localUpdatedAt = Date.now();
      if (typeof saveData === 'function') saveData();
      apply(profile);
      renderChoices();
      window.IronSixCloud?.syncNow?.(false);
      if (typeof toast === 'function') toast(`${PALETTE[button.dataset.accent].label} selected`);
    }));
  }

  function open() {
    const modal = ensureModal();
    renderChoices();
    modal.hidden = false;
  }
  function close() { const modal = $('accentThemeModal'); if (modal) modal.hidden = true; }

  injectStyles();
  apply();
  addEventListener('load', () => apply());
  setInterval(() => {
    const user = typeof activeUser === 'function' ? activeUser() : null;
    const key = choiceFor(user);
    if ((user?.id || null) !== currentProfile || key !== currentTheme) apply(user);
  }, 750);

  window.IronSixAccentTheme = { PALETTE, apply, open, close, current: () => currentTheme };
})();
