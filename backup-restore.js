/* Restore from a backup file.
 *
 * The History tab has offered "Export backup" for a while, writing a JSON file of every profile
 * and journal entry. Nothing could read one back, so the file was a dead end: you could save
 * your training history and then had no way to put it into an account.
 *
 * This is the other half. It deliberately mirrors cloud-sync's guest import rather than
 * inventing a second path: every imported profile is added as a NEW profile owned by whoever is
 * signed in, never merged over an existing one and never deleting anything. The journal is
 * rebuilt from each profile's own history by IronSixJournal.migrateUser, which is the same
 * routine that already backfills sessions logged before the journal existed.
 *
 * The file is untrusted input — it can be hand-edited or come from anywhere — so it is parsed
 * defensively and every profile is put through normalizeUser before it is allowed near the app.
 */
(() => {
  if (window.__ironSixBackupRestoreLoaded) return;
  window.__ironSixBackupRestoreLoaded = true;

  const MAX_PROFILES = 25;
  const MAX_BYTES = 25 * 1024 * 1024;

  const say = message => { if (typeof toast === 'function') toast(message); };

  // Small stable digest of the file, so importing the same backup twice does not silently
  // duplicate a year of training.
  function digest(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  // Accepts the app's own export shape and a raw profile blob copied out of device storage,
  // because both are things a person can plausibly be holding when they say "my backup".
  function readBackup(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { throw Error('That file is not valid JSON.'); }
    if (!parsed || typeof parsed !== 'object') throw Error('That file is not an Iron Six backup.');
    const source = Array.isArray(parsed.users) ? parsed
      : parsed.profiles && Array.isArray(parsed.profiles.users) ? parsed.profiles
      : null;
    if (!source) throw Error('That file is not an Iron Six backup.');
    const users = source.users.filter(u => u && typeof u === 'object' && String(u.name || '').trim());
    if (!users.length) throw Error('That backup contains no training profiles.');
    if (users.length > MAX_PROFILES) throw Error(`That backup contains ${users.length} profiles, which is more than Iron Six will import at once.`);
    return { users, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null };
  }

  function summarise(users) {
    const sessions = users.reduce((total, u) => total + (Array.isArray(u.history) ? u.history.length : 0), 0);
    const names = users.map(u => String(u.name).trim()).slice(0, 4).join(', ');
    return `${users.length} profile${users.length === 1 ? '' : 's'} (${names}${users.length > 4 ? '…' : ''}) and ${sessions} saved session${sessions === 1 ? '' : 's'}`;
  }

  function restore(text) {
    const backup = readBackup(text);
    const stamp = digest(text);
    const scope = window.ironSixAccountScope || null;
    const where = scope ? 'your signed-in account' : 'this device';
    if (!confirm(`Import ${summarise(backup.users)} into ${where}?\n\nThey are added as new profiles. Nothing already here is changed or removed.`)) return null;

    let added = 0, skipped = 0;
    for (const source of backup.users) {
      const marker = `${stamp}:${source.id || source.name}`;
      if (data.users.some(u => u.importedBackupId === marker)) { skipped++; continue; }
      const user = normalizeUser(JSON.parse(JSON.stringify(source)));
      user.id = (crypto.randomUUID ? crypto.randomUUID() : 'u_' + stamp + '_' + added);
      user.importedBackupId = marker;
      user.localUpdatedAt = Date.now();
      user.workoutDraft = null;
      user.today = {};
      if (scope) user.accountOwner = scope;
      // Cloud identity belongs to the profile it was issued for, never to a copy of it.
      for (const key of ['cloudId', '_cloudVersion', '_cloudFingerprint', '_remoteProfile', 'cloudNormalizedThrough']) delete user[key];
      data.users.push(user);
      window.IronSixJournal?.migrateUser(user);
      added++;
    }
    if (!added) { say('Those profiles were already imported from this backup.'); return { added, skipped }; }
    // saveData is cloud-sync's wrapper, so this also queues the upload when signed in.
    saveData();
    if (typeof renderAll === 'function') renderAll();
    say(`Imported ${added} profile${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} already imported` : ''}.${scope ? ' Syncing to your account…' : ''}`);
    return { added, skipped };
  }

  function pickFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > MAX_BYTES) { say('That file is too large to be an Iron Six backup.'); return; }
      const reader = new FileReader();
      reader.onerror = () => say('That file could not be read.');
      reader.onload = () => {
        try { restore(String(reader.result || '')); }
        catch (error) { say(error.message || 'That backup could not be imported.'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function install() {
    const exportButton = document.getElementById('exportWorkoutLog');
    if (exportButton && !document.getElementById('restoreWorkoutBackup')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn secondary';
      button.id = 'restoreWorkoutBackup';
      button.textContent = 'Restore backup';
      button.addEventListener('click', pickFile);
      exportButton.after(document.createTextNode(' '), button);
    }
    // Also reachable from the account panel, which is where someone looks after signing in and
    // finding their history missing.
    const actions = document.getElementById('accountActions');
    if (actions && !document.getElementById('accountRestoreBackup')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn secondary';
      button.id = 'accountRestoreBackup';
      button.textContent = 'Restore from backup file';
      button.addEventListener('click', pickFile);
      document.getElementById('accountImport')?.after(button) || actions.appendChild(button);
    }
  }

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function') window.renderAll = function () { baseRenderAll(); install(); };
  install();
  addEventListener('load', install);
  setTimeout(install, 1500);

  window.IronSixBackupRestore = { readBackup, restore, pickFile, install };
})();
