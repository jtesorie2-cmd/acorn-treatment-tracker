// Monthly deactivation reminder — on the 1st, list last month's
// "went elsewhere" patients for the office manager to deactivate in Denticon.

import { getDeactPatients } from '../lib/model.js';
import { expose } from '../lib/expose.js';

export function buildDeactTable(deactList) {
  if (!deactList.length) {
    return `<div class="deact-empty">No patients marked "Went Elsewhere" last month.</div>`;
  }
  const rows = deactList.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td>${p.phone || '—'}</td>
      <td>${new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</td>
      <td>${p.value || '—'}</td>
    </tr>`).join('');
  return `<table class="deact-table">
    <thead><tr><th>Patient</th><th>Phone</th><th>Treatment Date</th><th>Treatment Description</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function checkDeactReminder() {
  const now = new Date();
  if (now.getDate() !== 1) return; // Only on the 1st
  const storageKey = `deact-shown-${now.getFullYear()}-${now.getMonth()}`;
  try {
    if (localStorage.getItem(storageKey)) return; // Already shown this month
    localStorage.setItem(storageKey, '1');
  } catch(e) {}

  // Get last month's data
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const deactList = getDeactPatients(lastMonth.getFullYear(), lastMonth.getMonth());
  const monthLabel = lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  document.getElementById('deactMonthLabel').textContent = `Patients from ${monthLabel} who went elsewhere`;
  document.getElementById('deactTableContainer').innerHTML = buildDeactTable(deactList);
  document.getElementById('deactOverlay').classList.remove('hidden');
}

export function closeDeact() {
  document.getElementById('deactOverlay').classList.add('hidden');
}

export function openDeactPrint() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthLabel = lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const deactList = getDeactPatients(lastMonth.getFullYear(), lastMonth.getMonth());

  document.getElementById('deactPrintSub').textContent = `${monthLabel} · Generated ${now.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}`;
  document.getElementById('deactPrintContent').innerHTML = buildDeactTable(deactList);
  document.getElementById('deactPrintOverlay').classList.add('active');
  document.getElementById('deactOverlay').classList.add('hidden');
}

export function closeDeactPrint() {
  document.getElementById('deactPrintOverlay').classList.remove('active');
}

// ── Help Modal ─────────────────────────────────────────────
export function openHelp() { document.getElementById('helpOverlay').classList.remove('hidden'); }
export function closeHelp() { document.getElementById('helpOverlay').classList.add('hidden'); }

expose({ checkDeactReminder, closeDeact, openDeactPrint, closeDeactPrint, openHelp, closeHelp });
