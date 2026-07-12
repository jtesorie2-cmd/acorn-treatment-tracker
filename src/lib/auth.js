// One office password, two real jobs:
//  1. It signs into the shared Supabase Auth account — the server (not this
//     page) verifies it, and Row Level Security only opens up after sign-in.
//  2. It derives the key that unwraps the data-encryption master key
//     (see crypto.js). Wrong password = no login AND no readable data.

import { supa } from './supabase.js';
import { OFFICE_EMAIL, KDF_ITERATIONS, AUTO_LOCK_MINUTES } from '../config.js';
import {
  createVault, unlockVault, rewrapVault, lockVault,
  saveSessionKey, restoreSessionKey,
} from './crypto.js';

async function signIn(password) {
  const { error } = await supa.auth.signInWithPassword({ email: OFFICE_EMAIL, password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      throw new Error('Incorrect password. Please try again.');
    }
    throw new Error(`Sign-in failed: ${error.message} — if this office account hasn't been created yet, see docs/SECURITY.md.`);
  }
}

async function fetchVault() {
  const { data, error } = await supa.from('vault_meta').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(`Couldn't reach the data vault: ${error.message}`);
  return data;
}

// Returns 'ok' when signed in and unlocked, or 'needs-rewrap' when the
// password is valid for sign-in but the vault was sealed under a previous
// password (i.e. the Auth password was rotated without re-sealing).
export async function login(password) {
  await signIn(password);
  let vault = await fetchVault();

  if (!vault) {
    // First run — mint and store the vault.
    const fields = await createVault(password, KDF_ITERATIONS);
    const { error } = await supa.from('vault_meta').insert({ id: 1, ...fields });
    if (error) {
      // Another device won the race — reload their vault and unlock normally.
      vault = await fetchVault();
      if (!vault) throw new Error(`Couldn't initialize the data vault: ${error.message}`);
      await unlockVault(password, vault);
    }
    saveSessionKey();
    return 'ok';
  }

  try {
    await unlockVault(password, vault);
  } catch (e) {
    return 'needs-rewrap';
  }
  saveSessionKey();
  return 'ok';
}

// After an Auth password rotation: unlock with the previous password, then
// re-seal the vault under the new (current) password.
export async function rewrapWithOldPassword(oldPassword, newPassword) {
  const vault = await fetchVault();
  if (!vault) throw new Error('No vault found to re-seal.');
  try {
    await unlockVault(oldPassword, vault);
  } catch (e) {
    throw new Error("That previous password didn't unlock the vault. Please try again.");
  }
  const fields = await rewrapVault(newPassword, KDF_ITERATIONS);
  const { error } = await supa.from('vault_meta').update(fields).eq('id', 1);
  if (error) throw new Error(`Couldn't re-seal the vault: ${error.message}`);
  saveSessionKey();
}

// True when a Supabase session and the per-tab vault key both survive a
// reload — the app can boot without asking for the password again.
export async function trySessionRestore() {
  const { data } = await supa.auth.getSession();
  if (!data?.session) return false;
  return restoreSessionKey();
}

export async function signOutAndLock() {
  lockVault();
  try { await supa.auth.signOut(); } catch (e) {}
  location.reload();
}

// Lock the tab after a period with no interaction.
export function startAutoLock() {
  let timer = null;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { signOutAndLock(); }, AUTO_LOCK_MINUTES * 60 * 1000);
  };
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, arm, { passive: true }));
  arm();
}
