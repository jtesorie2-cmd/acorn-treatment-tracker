// Win Back — call list of patients closed 6+ months ago.

import { REASONS } from '../constants.js';
import { isWinBackEligible } from '../lib/model.js';
import { patients, scheduleSave } from '../lib/store.js';
import { expose } from '../lib/expose.js';
import { render } from './patients.js';

export function winbackSchedule(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  p.winbackScheduled = true;
  p.outcome = 'scheduled';
  p.closed = false;
  // Re-enter active follow-up flow
  p.steps = [false, false, false];
  render(); scheduleSave();
}

export function winbackArchive(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  p.winbackArchived = true;
  renderWinBack(); scheduleSave();
}

export function winbackSaveNote(id, value) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  p.winbackNotes = value;
  scheduleSave();
}

export function renderWinBack() {
  const list  = document.getElementById('winbackList');
  const empty = document.getElementById('winbackEmpty');
  const badge = document.getElementById('winbackTabBadge');
  if (!list) return;

  const eligible = patients.filter(isWinBackEligible);
  // Sort by longest closed first
  eligible.sort((a, b) => {
    const aDate = new Date(a.scheduledAt || a.coldClosedAt || a.coldSinceAt || a.date);
    const bDate = new Date(b.scheduledAt || b.coldClosedAt || b.coldSinceAt || b.date);
    return aDate - bDate;
  });

  badge.textContent = eligible.length;
  eligible.length > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');

  if (eligible.length === 0) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  list.innerHTML = eligible.map(p => {
    const closedDate = new Date(p.scheduledAt || p.coldClosedAt || p.coldSinceAt || p.date);
    const monthsAgo  = Math.floor((Date.now() - closedDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const typeLabel  = p.type === 'recare'
      ? `<span class="winback-badge winback-rc">📅 Recare</span>`
      : `<span class="winback-badge winback-tx">💜 Treatment</span>`;
    const originalReason = p.reason ? (REASONS.find(r=>r.key===p.reason)?.label.replace(/^.{2}/,'')||'') : '';

    return `<div class="winback-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <div class="winback-name">${p.name}</div>
          <div class="winback-meta">
            ${p.phone ? `📞 ${p.phone} · ` : ''}${p.childName ? p.childName + ' · ' : ''}
            Closed ~${monthsAgo} month${monthsAgo !== 1 ? 's' : ''} ago
            ${originalReason ? ` · ${originalReason}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          ${typeLabel}
          <button class="btn-winback-scheduled" onclick="winbackSchedule(${p.id})">🎉 Scheduled!</button>
          <button class="btn-winback-archive" onclick="winbackArchive(${p.id})">✕ Archive</button>
        </div>
      </div>
      <textarea class="winback-notes" placeholder="Call log — e.g. LM 4/25, spoke to mom, number disconnected…"
        onblur="winbackSaveNote(${p.id},this.value)">${p.winbackNotes||''}</textarea>
    </div>`;
  }).join('');
}

expose({ winbackSchedule, winbackArchive, winbackSaveNote });
