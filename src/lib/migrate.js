// One-time migration from the legacy storage format.
//
// The old app stored ALL patients as two big encrypted blobs in the
// tracker_data table (id 1 = patients, id 2 = sedation), encrypted with a
// key that was hardcoded in the page source — which is why it provided no
// real protection. This module is the ONLY place that legacy key survives;
// it is used once, read-only, to carry the data forward into per-row
// storage encrypted under the real vault key. After migrating, drop the
// tracker_data table (see docs/SECURITY.md).

import { supa } from './supabase.js';
import { encryptText } from './crypto.js';

const LEGACY_KEY = 'AcornPedsDental2024!xK9mQ3rL7nP2';

async function legacyDecrypt(b64) {
  const raw = new TextEncoder().encode(LEGACY_KEY.padEnd(32).slice(0, 32));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

async function tableIsEmpty(name) {
  const { count, error } = await supa.from(name).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return (count ?? 0) === 0;
}

// Legacy ids were Date.now() at creation — collisions are possible in
// imported data, and each id is now a primary key.
function dedupeIds(list) {
  const seen = new Set();
  for (const p of list) {
    while (seen.has(p.id)) p.id += 1;
    seen.add(p.id);
  }
  return list;
}

async function insertRows(table, objs) {
  if (!objs.length) return;
  const rows = [];
  for (const p of objs) {
    rows.push({ id: p.id, ciphertext: await encryptText(JSON.stringify(p)), version: 1 });
  }
  const { error } = await supa.from(table).upsert(rows);
  if (error) throw error;
}

// Runs on every boot but only acts when the new tables are still empty and a
// legacy blob exists. Returns true when a migration happened.
export async function migrateIfNeeded() {
  try {
    if (!(await tableIsEmpty('patients')) || !(await tableIsEmpty('sedation_patients'))) return false;

    const { data, error } = await supa.from('tracker_data').select('*');
    if (error || !data) return false; // legacy table gone — nothing to migrate

    const mainRow = data.find(r => r.id === 1);
    const sedRow  = data.find(r => r.id === 2);

    let legacyPatients = [];
    let legacySed = [];
    try { if (mainRow?.value) legacyPatients = JSON.parse(await legacyDecrypt(mainRow.value)); } catch (e) {}
    try { if (sedRow?.value)  legacySed = JSON.parse(await legacyDecrypt(sedRow.value)); } catch (e) {}
    if (!legacyPatients.length && !legacySed.length) return false;

    await insertRows('patients', dedupeIds(legacyPatients));
    await insertRows('sedation_patients', dedupeIds(legacySed));
    console.info(`Migrated ${legacyPatients.length} patients and ${legacySed.length} sedation patients from legacy storage.`);
    return true;
  } catch (e) {
    console.error('Legacy migration failed (will retry next load)', e);
    return false;
  }
}
