/* First run on a new account.
 *
 * Signing in to an account that has nothing in it used to drop you straight onto a placeholder
 * profile with a stranger's body weight in it, and no hint that either setting it up or
 * restoring a backup was a thing you could do. Someone with a backup would start logging against
 * the placeholder and only discover the import later, by which point they have two profiles.
 *
 * So the account is asked once, at the only moment the answer is obvious: set this profile up,
 * or restore a backup instead. Both are offered, neither is forced, and it never asks again in
 * the same session.
 */
(() => {
  if (window.__ironSixOnboardingLoaded) return;
  window.__ironSixOnboardingLoaded = true;

  const $ = id => document.getElementById(id);
  let handled = false;

  const signedIn = () => { try { return !!window.IronSixCloud?.session()?.user; } catch (_) { return false; } };

  // "Nothing in it" means exactly that: one profile, never trained in, never synced down from
  // the cloud. Anything else is someone's real account and must not be interrupted.
  function accountIsEmpty() {
    if (!Array.isArray(data?.users) || data.users.length !== 1) return false;
    const user = data.users[0];
    return !(user.history || []).length
      && !Object.keys(user.today || {}).length
      && !user.cloudId
      && !user.importedBackupId;
  }

  function injectStyles() {
    if ($('onboardingStyles')) return;
    const style = document.createElement('style');
    style.id = 'onboardingStyles';
    style.textContent = `
      #onboardingModal .modal{max-width:420px}
      #onboardingModal h3{margin:0 0 5px;font-size:18px}
      #onboardingModal .ob-sub{margin:0 0 16px;font-size:13px;color:var(--muted);line-height:1.5}
      .ob-choice{display:block;width:100%;text-align:left;border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:14px;padding:14px;margin-bottom:10px;font:inherit;cursor:pointer;min-height:64px}
      .ob-choice:hover{border-color:rgba(255,255,255,.24)}
      .ob-choice strong{display:block;font-size:14px;font-weight:820}
      .ob-choice span{display:block;font-size:12px;color:var(--muted);margin-top:3px;line-height:1.45}
      .ob-skip{border:0;background:none;color:var(--muted);font:inherit;font-size:12.5px;padding:8px 0;cursor:pointer;width:100%}
    `;
    document.head.appendChild(style);
  }

  function close() { $('onboardingModal')?.remove(); }

  function open(email) {
    if ($('onboardingModal')) return;
    injectStyles();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.id = 'onboardingModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `<div class="modal"><h3>Welcome to Iron Six</h3>`
      + `<p class="ob-sub">${email ? 'Signed in as ' + email + '. ' : ''}This account is empty. How would you like to start?</p>`
      + `<button type="button" class="ob-choice" id="obSetUp"><strong>Set up my profile</strong><span>Your name, body weight, height and training level, so the first weights it suggests are in the right range.</span></button>`
      + `<button type="button" class="ob-choice" id="obRestore"><strong>Restore a backup</strong><span>Bring in training history you exported before. Your profiles and sessions come back with it.</span></button>`
      + `<button type="button" class="ob-skip" id="obSkip">Skip for now</button></div>`;
    document.body.appendChild(modal);

    modal.querySelector('#obSkip').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.querySelector('#obSetUp').addEventListener('click', () => {
      close();
      // The profile editor already collects every field; send them to it rather than building a
      // second form that could drift from it.
      if (typeof showView === 'function') showView('profiles');
      setTimeout(() => {
        const name = $('profileName');
        name?.closest('.section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        name?.focus();
        name?.select?.();
      }, 120);
    });
    modal.querySelector('#obRestore').addEventListener('click', () => {
      close();
      window.IronSixBackupRestore?.pickFile();
    });
  }

  function check() {
    if (handled || !signedIn() || typeof data === 'undefined') return;
    if (!accountIsEmpty()) { handled = true; return; }
    handled = true;
    let email = '';
    try { email = window.IronSixCloud.session().user.email || ''; } catch (_) { }
    open(email);
  }

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function') window.renderAll = function () { baseRenderAll(); check(); };
  // The session arrives after first paint; a short poll catches it without cloud-sync needing a
  // hook, and stops as soon as the question has been asked or answered elsewhere.
  const timer = setInterval(() => { if (handled) { clearInterval(timer); return; } check(); }, 1200);

  window.IronSixOnboarding = { check, open, close, accountIsEmpty, reset: () => { handled = false; } };
})();
