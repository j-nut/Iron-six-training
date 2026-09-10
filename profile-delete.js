/* Deleting a profile, including one with saved training in it.
 *
 * The original deleteUser refused any profile that had history, a cloud id, or a single journal
 * entry — "Profiles with saved workouts are kept for recovery." That is a sound instinct and a
 * dead end in practice: restoring a backup creates a profile that always has history, so a
 * duplicate could never be removed. The rule protected data by making a mess permanent.
 *
 * This replaces the refusal with a deletion that is deliberate and complete:
 *   - it says exactly what is about to be lost, and offers to export a backup first;
 *   - it removes the profile's journal entries, not just the profile row, so a later sync or
 *     replay cannot resurface workouts the user deleted;
 *   - it deletes the cloud profile row when signed in, because pullProfiles re-adds any row it
 *     finds in the cloud but not on the device. A local-only delete would come straight back on
 *     the next sync, which is worse than not offering deletion at all.
 *
 * The last profile still cannot be deleted; the app has nowhere to put you.
 */
(() => {
  if (window.__ironSixProfileDeleteLoaded) return;
  window.__ironSixProfileDeleteLoaded = true;

  const say = message => { if (typeof toast === 'function') toast(message); };

  function describe(user) {
    const sessions = (user.history || []).length;
    const logged = Object.keys(user.today || {}).length;
    const bits = [];
    if (sessions) bits.push(`${sessions} saved session${sessions === 1 ? '' : 's'}`);
    if (logged) bits.push('a workout in progress');
    return bits.length ? bits.join(' and ') : 'no saved training';
  }

  async function removeFromCloud(user) {
    const cloud = window.IronSixCloud;
    const scope = window.ironSixAccountScope;
    if (!cloud || !scope || typeof cloud.client !== 'function') return { attempted: false };
    const client = cloud.client();
    if (!client) return { attempted: false };
    try {
      // Match on client_id so a profile that never received its cloud id is still removed.
      const result = await client.from('profiles').delete().eq('user_id', scope).eq('client_id', user.id);
      if (result.error) return { attempted: true, ok: false, error: result.error.message };
    } catch (error) {
      return { attempted: true, ok: false, error: error?.message };
    }
    // Journal rows have no delete policy yet, so this is expected to be refused. It is attempted
    // anyway so that the day the policy is added, deletion becomes complete on its own — and it
    // is isolated in its own try, because a failure to tidy optional rows must never undo a
    // profile deletion that already succeeded.
    //
    // It cannot use .catch(): a Postgrest builder is only PromiseLike, so it has then() and no
    // catch(), and calling it threw a TypeError that surfaced as "could not remove this profile".
    try {
      await client.from('workout_entries').delete().eq('user_id', scope).eq('profile_client_id', user.id);
    } catch (_) { /* optional cleanup */ }
    return { attempted: true, ok: true };
  }

  async function deleteProfile(id) {
    const user = data.users.find(x => x.id === id);
    if (!user) return false;
    if (data.users.length <= 1) { say('This is your only profile, so it cannot be deleted.'); return false; }

    const signedIn = !!window.ironSixAccountScope;
    const first = `Delete “${user.name}” and ${describe(user)}?\n\nThis cannot be undone${signedIn ? ' and removes it from your account on every device' : ''}.`;
    if (!confirm(first)) return false;

    const hasTraining = (user.history || []).length || Object.keys(user.today || {}).length;
    if (hasTraining && confirm('Download a backup of everything first?\n\nOK to download, Cancel to delete without one.')) {
      let exported = true;
      try { window.IronSixJournal?.exportLog(); } catch (_) { exported = false; }
      // A blocked download must not trap someone with a duplicate they cannot remove — that is
      // the problem this feature exists to solve. Say the backup failed and let them decide.
      const question = exported
        ? 'Backup downloaded. Delete “' + user.name + '” now?'
        : 'The backup could not be downloaded on this device.\n\nDelete “' + user.name + '” anyway, without a backup?';
      if (!confirm(question)) { if (!exported) say('Nothing was deleted.'); return false; }
    }

    const cloud = await removeFromCloud(user);
    if (cloud.attempted && !cloud.ok) {
      say('Could not remove this profile from your account, so it was kept. ' + (cloud.error || 'Try again when you are back online.'));
      return false;
    }

    window.IronSixJournal?.forget(user.id);
    data.users = data.users.filter(x => x.id !== user.id);
    if (data.activeUserId === user.id) data.activeUserId = data.users[0].id;
    window.IronSixCircuit?.pause('Profile deleted');
    saveData();
    if (typeof renderAll === 'function') renderAll();
    say(`Deleted ${user.name}.`);
    return true;
  }

  // The Profiles list builds its own delete buttons on every render and wires them to
  // deleteUser, so replacing the global is what actually changes the button's behaviour.
  window.deleteUser = id => { void deleteProfile(id); };
  window.IronSixProfileDelete = { deleteProfile, describe };
})();
