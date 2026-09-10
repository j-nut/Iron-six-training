/* Profile menu.
 *
 * The topbar carried a raw <select> of profiles and a text button that said "Sign in" or
 * "Account". Two problems: nothing about it told you whether you were actually signed in, and
 * the only label that did was rewritten by a single line deep inside cloud-sync, so any render
 * failure left it stuck on "Sign in" while your profiles sat on screen.
 *
 * This replaces both with one avatar button that reads its state from the live session every
 * time it renders, and a menu holding the things you actually want: who you are, which profile
 * you are training as, and how to leave.
 *
 * The original <select> stays in the DOM but hidden. renderUserSelect and the change handler in
 * ui3.js still drive it, so nothing that depends on it has to change.
 */
(() => {
  if (window.__ironSixProfileMenuLoaded) return;
  window.__ironSixProfileMenuLoaded = true;

  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const cloud = () => window.IronSixCloud || null;
  const sessionUser = () => { try { return cloud()?.session()?.user || null; } catch (_) { return null; } };
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';

  function injectStyles() {
    if ($('profileMenuStyles')) return;
    const style = document.createElement('style');
    style.id = 'profileMenuStyles';
    style.textContent = `
      .topbar .user-switch{display:none!important}
      #ironCloudButton{display:none!important}
      #profileMenuButton{margin-left:auto;display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:999px;padding:5px 11px 5px 5px;font:inherit;font-weight:800;font-size:12.5px;cursor:pointer;min-height:40px}
      #profileMenuButton:hover{border-color:rgba(255,255,255,.24)}
      .pm-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:850;background:var(--accent);color:#0b0c0f;flex:0 0 auto}
      .pm-avatar.guest{background:var(--surface);color:var(--muted);border:1px solid var(--line)}
      .pm-caret{color:var(--muted);font-size:10px}
      #profileMenu{position:absolute;top:calc(100% + 6px);right:0;z-index:60;width:min(290px,calc(100vw - 24px));background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;text-align:left}
      #profileMenu[hidden]{display:none}
      .pm-head{padding:13px 14px;border-bottom:1px solid var(--line)}
      .pm-head strong{display:block;font-size:13px}
      .pm-head span{display:block;font-size:11.5px;color:var(--muted);margin-top:2px;word-break:break-all}
      .pm-group{padding:7px 0;border-bottom:1px solid var(--line)}
      .pm-group:last-child{border-bottom:0}
      .pm-label{padding:5px 14px;font-size:10px;font-weight:850;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
      .pm-item{display:flex;width:100%;align-items:center;gap:9px;padding:11px 14px;background:none;border:0;color:var(--text);font:inherit;font-size:13px;text-align:left;cursor:pointer;min-height:44px}
      .pm-item:hover{background:var(--surface2)}
      .pm-item b{flex:1;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pm-item small{color:var(--muted);font-size:11px}
      .pm-item .pm-tick{color:var(--accent);font-weight:850}
      .pm-item.danger{color:#ff9b9b}
      .topbar{position:relative}
    `;
    document.head.appendChild(style);
  }

  function close() {
    const menu = $('profileMenu');
    if (menu) menu.hidden = true;
    $('profileMenuButton')?.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    const menu = $('profileMenu');
    if (!menu) return;
    const open = menu.hidden;
    // Un-hide before rendering: render() skips the menu body while it is hidden, so rendering
    // first left the panel showing whatever it held last time — or nothing at all on first open.
    menu.hidden = !open;
    $('profileMenuButton')?.setAttribute('aria-expanded', String(open));
    if (open) render();
  }

  function install() {
    const top = document.querySelector('.topbar');
    if (!top || $('profileMenuButton')) return;
    injectStyles();
    const button = document.createElement('button');
    button.id = 'profileMenuButton';
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span class="pm-avatar" id="pmAvatar">?</span><span id="pmName"></span><span class="pm-caret">▾</span>';
    button.addEventListener('click', event => { event.stopPropagation(); toggle(); });
    const menu = document.createElement('div');
    menu.id = 'profileMenu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.addEventListener('click', event => event.stopPropagation());
    top.append(button, menu);
    document.addEventListener('click', close);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  }

  function render() {
    const button = $('profileMenuButton'), menu = $('profileMenu');
    if (!button || !menu || typeof activeUser !== 'function') return;
    const user = activeUser(), account = sessionUser(), signedIn = !!account;

    $('pmAvatar').textContent = initials(user?.name);
    $('pmAvatar').classList.toggle('guest', !signedIn);
    $('pmName').textContent = user?.name || 'Profile';
    button.setAttribute('aria-label', `${user?.name || 'Profile'} — ${signedIn ? 'signed in as ' + account.email : 'not signed in'}`);
    if (menu.hidden) return;

    const profiles = (data?.users || []).map(u => `<button type="button" role="menuitem" class="pm-item" data-switch="${esc(u.id)}"><b>${esc(u.name)}</b>${u.id === user?.id ? '<span class="pm-tick">✓</span>' : ''}</button>`).join('');
    menu.innerHTML = `<div class="pm-head"><strong>${signedIn ? 'Signed in' : 'Not signed in'}</strong><span>${signedIn ? esc(account.email) : 'Your training is saved on this device only'}</span></div>`
      + `<div class="pm-group"><div class="pm-label">Training as</div>${profiles}`
      + `<button type="button" role="menuitem" class="pm-item" data-action="add"><b>Add a profile</b></button></div>`
      + `<div class="pm-group"><button type="button" role="menuitem" class="pm-item" data-action="equipment"><b>Manage equipment</b></button>`
      + `<button type="button" role="menuitem" class="pm-item" data-action="account"><b>${signedIn ? 'Account & backup' : 'Sign in or create account'}</b></button>`
      + (signedIn ? `<button type="button" role="menuitem" class="pm-item" data-action="sync"><b>Sync now</b></button>` : '')
      + `</div>`
      + (signedIn ? `<div class="pm-group"><button type="button" role="menuitem" class="pm-item danger" data-action="signout"><b>Sign out</b></button></div>` : '');

    menu.querySelectorAll('[data-switch]').forEach(item => item.addEventListener('click', () => {
      close();
      if (item.dataset.switch !== user?.id && typeof switchUser === 'function') switchUser(item.dataset.switch);
    }));
    menu.querySelectorAll('[data-action]').forEach(item => item.addEventListener('click', () => {
      const action = item.dataset.action;
      close();
      if (action === 'add' && typeof openNewUser === 'function') openNewUser();
      // The account modal owns sign-in, sign-out and sync; drive its controls rather than
      // duplicating that logic where it could drift.
      if (action === 'account') cloud()?.openAccount?.();
      if (action === 'sync') cloud()?.syncNow?.(true);
      if (action === 'signout') { cloud()?.openAccount?.(); $('accountSignOut')?.click(); }
      if (action === 'equipment') {
        if (typeof showView === 'function') showView('profiles');
        ($('openEquipmentManagerBtn') || $('equipmentBadges'))?.click();
      }
    }));
  }

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function') window.renderAll = function () { baseRenderAll(); install(); render(); };
  install(); render();
  // The session arrives after first paint and cloud-sync has no hook to announce it, so the
  // avatar polls. It only ever repaints the button: rebuilding the menu body underneath someone
  // mid-tap would swallow their click.
  addEventListener('load', () => { install(); render(); });
  setInterval(() => { if ($('profileMenu')?.hidden !== false) render(); }, 1500);

  window.IronSixProfileMenu = { install, render, toggle, close, initials };
})();
