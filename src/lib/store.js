// Encrypted per-row data layer.
//
// Every patient is one row in Supabase: { id, ciphertext, version }. Rows are
// encrypted client-side (crypto.js) before upload, so the server only ever
// stores ciphertext. Saving diffs per row (instead of re-uploading one big
// blob like the old version) also means two front-desk computers editing
// different patients no longer clobber each other.

import { supa } from './supabase.js';
import { encryptText, decryptText } from './crypto.js';

export let patients = [];
export let sedationPatients = [];

const tables = {
  patients: {
    get: () => patients,
    set: v => { patients = v; },
    versions: new Map(),   // id -> last seen server version
    lastSaved: new Map(),  // id -> JSON as last synced (dirty checking)
  },
  sedation_patients: {
    get: () => sedationPatients,
    set: v => { sedationPatients = v; },
    versions: new Map(),
    lastSaved: new Map(),
  },
};

export function setSyncStatus(state, label) {
  const dot = document.getElementById('syncDot');
  const lbl = document.getElementById('syncLabel');
  if (!dot || !lbl) return;
  dot.className = 'sync-dot' + (state === 'syncing' ? ' syncing' : state === 'error' ? ' error' : '');
  lbl.textContent = label;
}

// ── Load ───────────────────────────────────────────────────
async function loadTable(name) {
  const t = tables[name];
  const { data, error } = await supa.from(name)
    .select('id,ciphertext,version')
    .order('id', { ascending: false });
  if (error) throw error;
  const objs = [];
  t.versions.clear();
  t.lastSaved.clear();
  for (const row of data) {
    try {
      const json = await decryptText(row.ciphertext);
      objs.push(JSON.parse(json));
      t.versions.set(row.id, row.version);
      t.lastSaved.set(row.id, json);
    } catch (e) {
      console.error(`Could not decrypt ${name} row ${row.id} — skipping`, e);
    }
  }
  t.set(objs);
}

export async function loadAll() {
  setSyncStatus('syncing', 'Loading…');
  try {
    await loadTable('patients');
    await loadTable('sedation_patients');
    setSyncStatus('ok', 'Synced ✓');
  } catch (e) {
    console.error('Load failed', e);
    setSyncStatus('error', 'Load failed');
    patients = [];
    sedationPatients = [];
  }
}

// ── Save ───────────────────────────────────────────────────
let saveTimer = null;
let saving = false;
let pendingResave = false;

export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
}

export async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (saving) { pendingResave = true; return; }
  saving = true;
  setSyncStatus('syncing', 'Saving…');
  try {
    for (const name of Object.keys(tables)) await saveTable(name);
    setSyncStatus('ok', 'Synced ✓');
  } catch (e) {
    console.error('Save failed', e);
    setSyncStatus('error', 'Save failed — check connection');
  }
  saving = false;
  if (pendingResave) { pendingResave = false; scheduleSave(); }
}

async function saveTable(name) {
  const t = tables[name];
  const arr = t.get();
  const currentIds = new Set(arr.map(p => p.id));

  const upserts = [];
  for (const p of arr) {
    const json = JSON.stringify(p);
    if (t.lastSaved.get(p.id) === json) continue;
    upserts.push({
      id: p.id,
      ciphertext: await encryptText(json),
      version: (t.versions.get(p.id) || 0) + 1,
      updated_at: new Date().toISOString(),
      _json: json,
    });
  }
  const deletions = [...t.lastSaved.keys()].filter(id => !currentIds.has(id));

  if (upserts.length) {
    const rows = upserts.map(({ _json, ...row }) => row);
    const { error } = await supa.from(name).upsert(rows);
    if (error) throw error;
    for (const u of upserts) {
      t.versions.set(u.id, u.version);
      t.lastSaved.set(u.id, u._json);
    }
  }
  if (deletions.length) {
    const { error } = await supa.from(name).delete().in('id', deletions);
    if (error) throw error;
    deletions.forEach(id => { t.versions.delete(id); t.lastSaved.delete(id); });
  }
}

// The only place a patient is removed from the array — array reassignment
// has to happen inside this module for the live export binding to update.
export function removePatient(id) {
  patients = patients.filter(x => x.id !== id);
}

// ── Poll for changes from other computers ──────────────────
let pollTimer = null;

export function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(poll, 5000);
}

async function poll() {
  if (saving || saveTimer) return; // local changes in flight — save first
  try {
    let changed = false;
    for (const name of Object.keys(tables)) {
      if (await pollTable(name)) changed = true;
    }
    if (changed) {
      setSyncStatus('ok', 'Updated ✓');
      document.dispatchEvent(new CustomEvent('acorn-data-updated'));
    }
  } catch (e) {}
}

async function pollTable(name) {
  const t = tables[name];
  const { data, error } = await supa.from(name).select('id,version');
  if (error) return false;

  const remote = new Map(data.map(r => [r.id, r.version]));
  const changedIds = [];
  for (const [id, v] of remote) {
    const localV = t.versions.get(id);
    if (localV === undefined || v > localV) changedIds.push(id);
  }
  const removedIds = [...t.versions.keys()].filter(id => !remote.has(id));
  if (!changedIds.length && !removedIds.length) return false;

  let arr = t.get();
  if (removedIds.length) {
    arr = arr.filter(p => !removedIds.includes(p.id));
    removedIds.forEach(id => { t.versions.delete(id); t.lastSaved.delete(id); });
  }
  if (changedIds.length) {
    const { data: rows, error: e2 } = await supa.from(name)
      .select('id,ciphertext,version').in('id', changedIds);
    if (e2) return false;
    for (const row of rows) {
      try {
        const json = await decryptText(row.ciphertext);
        const obj = JSON.parse(json);
        const idx = arr.findIndex(p => p.id === row.id);
        if (idx >= 0) arr[idx] = obj; else arr.unshift(obj);
        t.versions.set(row.id, row.version);
        t.lastSaved.set(row.id, json);
      } catch (e) {}
    }
  }
  t.set(arr);
  return true;
}
