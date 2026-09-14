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
    if (!scope) return { attempted: false };
    if (!cloud?.client?.() || cloud.session?.()?.user?.id !== scope)
      return { attempted: true, ok: false, error: 'Sign in again before deleting an account profile.' };
    try {
      // The database cascades journal deletion in the same transaction as the parent.
      const result = await cloud.client().from('profiles').delete()
        .eq('user_id', scope).eq('client_id', user.id).select('id');
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new Error('The database did not confirm deletion.');
      if (!result.data.length && user.cloudId)
        throw new Error('No profile was removed. Sync your account and try again.');
      return { attempted: true, ok: true };
    } catch (error) {
      return { attempted: true, ok: false, error: error?.message };
    }
  }

  let deleting = false;
  async function deleteProfile(id) {
    if (deleting) { say('A profile deletion is already in progress.'); return false; }
    deleting = true;
    try { return await deleteConfirmedProfile(id); }
    catch (error) { say('Could not remove this profile. ' + (error?.message || 'Please try again.')); return false; }
    finally { deleting = false; }
  }

  async function deleteConfirmedProfile(id) {
    const user = data.users.find(x => x.id === id);
    if (!user) return false;
    if (data.users.length <= 1) { say('This is your only profile, so it cannot be deleted.'); return false; }

    const accountScope = window.ironSixAccountScope;
    const signedIn = !!accountScope;
    const first = `Delete “${user.name}” and ${describe(user)}?\n\nThis cannot be undone${signedIn ? ' and removes it from your account on every device' : ''}.`;
    if (!confirm(first)) return false;

    const hasTraining = (user.history || []).length || Object.keys(user.today || {}).length;
    if (hasTraining && confirm('Download a backup of everything first?\n\nOK to download, Cancel to delete without one.')) {
      let exported = typeof window.IronSixJournal?.exportLog === 'function';
      try { if (exported) await window.IronSixJournal.exportLog(); } catch (_) { exported = false; }
      // A blocked download must not trap someone with a duplicate they cannot remove — that is
      // the problem this feature exists to solve. Say the backup failed and let them decide.
      const question = exported
        ? 'Backup downloaded. Delete “' + user.name + '” now?'
        : 'The backup could not be downloaded on this device.\n\nDelete “' + user.name + '” anyway, without a backup?';
      if (!confirm(question)) { if (!exported) say('Nothing was deleted.'); return false; }
    }

    const commit = async () => {
      if (accountScope !== window.ironSixAccountScope || !data.users.includes(user))
        throw new Error('The account or profile changed. Please try again.');
      if (data.users.length <= 1) { say('This is your only profile, so it cannot be deleted.'); return false; }
      const cloud = await removeFromCloud(user);
      if (cloud.attempted && !cloud.ok) {
        say('Could not remove this profile from your account, so it was kept. ' + (cloud.error || 'Try again when you are back online.'));
        return false;
      }
      // An auth callback may have replaced the whole data object while the request was pending.
      if (accountScope !== window.ironSixAccountScope || !data.users.includes(user)) {
        say('Account changed. Sync the original account to see the deletion.');
        return false;
      }
      window.IronSixJournal?.forget(user.id);
      data.users = data.users.filter(x => x.id !== user.id);
      if (data.activeUserId === user.id) data.activeUserId = data.users[0].id;
      if (typeof calibrationRequest !== 'undefined') calibrationRequest++;
      window.IronSixCircuit?.pause('Profile deleted');
      const saved = saveData();
      if (typeof renderAll === 'function') renderAll();
      say(saved === false ? 'Profile removed, but this device could not save the change. Keep this page open and retry saving.' : `Deleted ${user.name}.`);
      return saved !== false;
    };
    return signedIn && window.IronSixCloud?.withProfileDeletion
      ? window.IronSixCloud.withProfileDeletion(commit) : commit();
  }

  // The Profiles list builds its own delete buttons on every render and wires them to
  // deleteUser, so replacing the global is what actually changes the button's behaviour.
  window.deleteUser = id => { void deleteProfile(id); };
  window.IronSixProfileDelete = { deleteProfile, describe };
})();
