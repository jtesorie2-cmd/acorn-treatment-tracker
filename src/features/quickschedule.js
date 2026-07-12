// "📞 Patient Scheduling?" — inbound-call quick search + one-tap scheduled.

import { OUTCOME_MAP } from '../constants.js';
import { getCardStatus } from '../lib/model.js';
import { patients, scheduleSave } from '../lib/store.js';
import { expose } from '../lib/expose.js';
import { render } from './patients.js';

export function openQuickSchedule() {
  document.getElementById('qsOverlay').classList.remove('hidden');
  document.getElementById('qsSearch').value = '';
  renderQSResults();
  setTimeout(() => document.getElementById('qsSearch').focus(), 80);
}
export function closeQuickSchedule() { document.getElementById('qsOverlay').classList.add('hidden'); }

export function renderQSResults() {
  const q = document.getElementById('qsSearch').value.trim().toLowerCase();
  const container = document.getElementById('qsResults');

  const pool = patients.filter(p => {
    if (p.closed || (p.outcome && OUTCOME_MAP[p.outcome]?.closes)) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || (p.childName && p.childName.toLowerCase().includes(q));
  });

  if (!q && pool.length === 0) {
    container.innerHTML = `<div class="qs-empty">No active patients on the list.</div>`;
    return;
  }
  if (q && pool.length === 0) {
    container.innerHTML = `<div class="qs-empty">No match for "<strong>${q}</strong>" — they may not be on the list.</div>`;
    return;
  }

  const statusLabel = { overdue: 'Overdue', today: 'Due Today', upcoming: 'Upcoming', complete: 'All Steps Done' };
  const statusCls   = { overdue: 'qs-status-overdue', today: 'qs-status-today', upcoming: 'qs-status-upcoming', complete: '' };

  container.innerHTML = pool.slice(0, 8).map(p => {
    const status = getCardStatus(p);
    const slbl = statusLabel[status] || '';
    const scls = statusCls[status] || '';
    const meta = [p.phone, p.value].filter(Boolean).join(' · ');
    return `<div class="qs-result-card">
      <div class="qs-result-info">
        <div class="qs-result-name">${p.name}</div>
        ${meta ? `<div class="qs-result-meta">${meta}</div>` : ''}
      </div>
      ${slbl ? `<span class="qs-result-status ${scls}">${slbl}</span>` : ''}
      <button class="btn-qs-schedule" id="qsbtn-${p.id}" onclick="quickSchedulePatient(${p.id})">🎉 Scheduled!</button>
    </div>`;
  }).join('');
}

export function quickSchedulePatient(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  p.outcome = 'scheduled';
  p.closed = true;
  if (!p.scheduledAt) p.scheduledAt = new Date().toISOString();
  render(); scheduleSave();
  const btn = document.getElementById(`qsbtn-${id}`);
  if (btn) { btn.textContent = '✓ Done!'; btn.classList.add('done'); btn.disabled = true; }
  setTimeout(() => renderQSResults(), 1200);
}

expose({ openQuickSchedule, closeQuickSchedule, renderQSResults, quickSchedulePatient });
