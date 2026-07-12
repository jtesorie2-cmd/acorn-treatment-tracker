// Gone Cold tab — final re-engagement, day-29 warning, day-30 auto-close.

import { getColdText, isGoneCold, ensureColdSince } from '../lib/model.js';
import { patients, scheduleSave } from '../lib/store.js';
import { expose } from '../lib/expose.js';
import { render } from './patients.js';

export function copyColdText(id, btnEl) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  const text = getColdText(p);
  navigator.clipboard.writeText(text).then(() => {
    btnEl.textContent = '✓ Copied!';
    btnEl.classList.add('copied');
    // Mark cold text as sent
    if (!p.coldTextSentAt) { p.coldTextSentAt = new Date().toISOString(); scheduleSave(); }
    setTimeout(() => { btnEl.textContent = '📱 Copy Final Text'; btnEl.classList.remove('copied'); }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    btnEl.textContent = '✓ Copied!'; btnEl.classList.add('copied');
    if (!p.coldTextSentAt) { p.coldTextSentAt = new Date().toISOString(); scheduleSave(); }
    setTimeout(() => { btnEl.textContent = '📱 Copy Final Text'; btnEl.classList.remove('copied'); }, 2000);
  });
}

export function scheduleColdPatient(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  p.outcome = 'scheduled';
  p.closed = true;
  if (!p.scheduledAt) p.scheduledAt = new Date().toISOString();
  render(); scheduleSave();
}

export function closeColdPatient(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  p.outcome = 'elsewhere';
  p.closed = true;
  render(); scheduleSave();
}

export function renderCold() {
  const coldList  = document.getElementById('coldList');
  const coldEmpty = document.getElementById('coldEmpty');
  if (!coldList) return;

  const coldPatients = patients.filter(p => isGoneCold(p));

  // Stamp coldSinceAt on any patient that doesn't have it yet
  coldPatients.forEach(p => ensureColdSince(p));

  // Update tab badge
  const badge = document.getElementById('coldTabBadge');
  if (coldPatients.length > 0) { badge.textContent = coldPatients.length; badge.classList.remove('hidden'); }
  else { badge.classList.add('hidden'); }

  if (coldPatients.length === 0) {
    coldList.innerHTML = '';
    coldEmpty?.classList.remove('hidden');
    return;
  }
  coldEmpty?.classList.add('hidden');

  // Sort: day 29 (urgent) first, then by days cold desc
  const sorted = [...coldPatients].sort((a, b) => {
    const da = a.coldSinceAt ? Math.floor((new Date() - new Date(a.coldSinceAt)) / 86400000) : 0;
    const db = b.coldSinceAt ? Math.floor((new Date() - new Date(b.coldSinceAt)) / 86400000) : 0;
    return db - da;
  });

  coldList.innerHTML = sorted.map(p => {
    const daysCold = p.coldSinceAt ? Math.floor((new Date() - new Date(p.coldSinceAt)) / 86400000) : 0;
    const daysLeft = Math.max(0, 30 - daysCold);
    const isDay29  = daysCold >= 29;
    const isUrgent = daysLeft <= 7;
    const pct      = Math.min(100, Math.round((daysCold / 30) * 100));

    const urgentBanner = isDay29 ? `
      <div style="width:100%;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;font-size:0.78rem;color:#92400e;font-weight:500;margin-bottom:4px;">
        ⚠️ Last chance — this patient closes tomorrow. Send the final text now.
      </div>` : '';

    const typeLabel = p.type === 'recare'
      ? `<span class="cold-type-badge cold-type-rc">📅 Recare</span>`
      : `<span class="cold-type-badge cold-type-tx">💜 Treatment</span>`;

    const textSent = p.coldTextSentAt
      ? `<span style="font-size:0.72rem;color:var(--teal)">✓ Final text sent</span>`
      : '';

    // Progress bar countdown
    const barColor = isDay29 ? '#f59e0b' : isUrgent ? '#f97316' : '#7dd3fc';
    const countdownLabel = isDay29 ? '⚠️ Closes tomorrow' : `Closes in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
    const daysLabel = `<div style="display:flex;flex-direction:column;gap:3px;min-width:110px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:0.68rem;font-weight:700;color:${isUrgent?'#c2410c':'#0369a1'};">${countdownLabel}</span>
      </div>
      <div style="height:5px;background:#e0f2fe;border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width 0.3s;"></div>
      </div>
      <span style="font-size:0.62rem;color:var(--muted);">Day ${daysCold} of 30</span>
    </div>`;

    return `<div class="cold-card" style="${isDay29 ? 'border-color:#fde68a;background:#fffbeb;' : ''}">
      ${urgentBanner}
      <div class="cold-card-info">
        <div class="cold-card-name">${p.name}</div>
        <div class="cold-card-meta">${p.phone ? `📞 ${p.phone} · ` : ''}${p.childName || ''}</div>
      </div>
      ${typeLabel}
      ${daysLabel}
      ${textSent}
      <button class="btn-cold-text" onclick="copyColdText(${p.id},this)" style="${isDay29 ? 'background:#d97706;' : ''}">📱 ${isDay29 ? 'Send Final Text Now' : 'Copy Final Text'}</button>
      <button class="btn-cold-text" onclick="scheduleColdPatient(${p.id})" style="background:#16a34a;">🎉 Scheduled!</button>
      <button class="btn-cold-close" onclick="closeColdPatient(${p.id})" title="Close patient">✕ Close</button>
    </div>`;
  }).join('');
}

expose({ copyColdText, scheduleColdPatient, closeColdPatient });
