// Treatment Coordinator tab — plan-send queue + Denticon deactivation queue.

import { REASONS } from '../constants.js';
import { getTCPlanPatients, getTCDeactivatePatients } from '../lib/model.js';
import { patients, scheduleSave } from '../lib/store.js';
import { expose } from '../lib/expose.js';
import { render } from './patients.js';

export function renderTC() {
  const planList   = getTCPlanPatients();
  const deactList  = getTCDeactivatePatients();
  const total      = planList.length + deactList.length;
  const tcList     = document.getElementById('tcList');
  const tcEmpty    = document.getElementById('tcEmpty');

  // Update tab badge
  const badge = document.getElementById('tcTabBadge');
  if (total > 0) {
    badge.textContent = total;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  if (total === 0) {
    tcList.innerHTML = '';
    tcEmpty.classList.remove('hidden');
    return;
  }
  tcEmpty.classList.add('hidden');

  const planHTML = planList.length === 0 ? '' : `
    <div class="tc-section-label">📋 Send Treatment Plan</div>
    ${planList.map(p => {
      const daysSince = Math.floor((new Date() - new Date(p.date + 'T00:00:00')) / 86400000);
      const dayLabel = daysSince === 0 ? 'Today' : daysSince === 1 ? '1 day ago' : `${daysSince} days ago`;
      const isUrgent = daysSince >= 1;
      const meta = [p.phone, p.value].filter(Boolean).join(' · ');
      const reasonLabel = REASONS.find(r => r.key === p.reason)?.label || '';
      const reasonDisplay = p.reason === 'no-tx' ? 'No treatment plan yet' : reasonLabel.replace(/^.{2}/,'');
      return `<div class="tc-card${isUrgent ? ' tc-card-urgent' : ''}">
        <div class="tc-card-info">
          <div class="tc-card-name">${p.name}</div>
          ${meta ? `<div class="tc-card-meta">${meta}</div>` : ''}
          ${p.reasonNote ? `<div class="tc-card-note">💬 "${p.reasonNote}"</div>` : ''}
        </div>
        <span class="tc-card-reason">${reasonDisplay}</span>
        <span class="tc-days-badge${isUrgent ? ' tc-days-urgent' : ''}">Logged ${dayLabel}</span>
        <button class="btn-tc-resolve" onclick="resolveTC(${p.id})">📋 Plan Sent ✓</button>
      </div>`;
    }).join('')}`;

  const deactHTML = deactList.length === 0 ? '' : `
    <div class="tc-section-label tc-section-label-deact">🚶 Deactivate in Denticon</div>
    ${deactList.map(p => {
      const daysSince = Math.floor((new Date() - new Date(p.date + 'T00:00:00')) / 86400000);
      const dayLabel = daysSince === 0 ? 'Today' : daysSince === 1 ? '1 day ago' : `${daysSince} days ago`;
      const meta = [p.phone, p.value].filter(Boolean).join(' · ');
      return `<div class="tc-card tc-card-deact">
        <div class="tc-card-info">
          <div class="tc-card-name">${p.name}</div>
          ${meta ? `<div class="tc-card-meta">${meta}</div>` : ''}
          <div class="tc-card-note">Marked "Went Elsewhere" ${dayLabel}</div>
        </div>
        <span class="tc-card-reason tc-reason-deact">Went Elsewhere</span>
        <button class="btn-tc-deact" onclick="deactivateTC(${p.id})">✓ Deactivated in Denticon</button>
      </div>`;
    }).join('')}`;

  tcList.innerHTML = planHTML + deactHTML;
}

export function resolveTC(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  p.tcResolved = true;
  p.planSentAt = new Date().toISOString();
  render(); scheduleSave();
}

export function deactivateTC(id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  p.tcDeactivated = true;
  p.tcDeactivatedAt = new Date().toISOString();
  render(); scheduleSave();
}

export function openTCPrint() {
  document.getElementById('tcPrintOverlay').classList.add('active');
  document.getElementById('tcPrintDate').textContent = 'Generated ' + new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  const planList  = getTCPlanPatients();
  const deactList = getTCDeactivatePatients();
  const content   = document.getElementById('tcPrintContent');

  let html = '';

  if (planList.length > 0) {
    html += `<h3 style="font-family:'Playfair Display',serif;font-size:1.1rem;margin:0 0 10px;color:#374151">📋 Send Treatment Plan (${planList.length})</h3>
    <table class="print-table" style="margin-bottom:28px">
      <thead><tr><th>Patient</th><th>Phone</th><th>Treatment</th><th>Reason / Note</th><th>Days on List</th><th>Plan Sent? ✓</th></tr></thead>
      <tbody>${planList.map(p => {
        const daysSince = Math.floor((new Date() - new Date(p.date + 'T00:00:00')) / 86400000);
        const reasonLabel = REASONS.find(r => r.key === p.reason)?.label.replace(/^.{2}/,'') || '';
        return `<tr>
          <td><strong>${p.name}</strong></td>
          <td>${p.phone || '—'}</td>
          <td>${p.value || '—'}</td>
          <td>${reasonLabel}${p.reasonNote ? ' — ' + p.reasonNote : ''}</td>
          <td>${daysSince === 0 ? 'Today' : daysSince + 'd'}</td>
          <td><span class="print-line"></span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  if (deactList.length > 0) {
    html += `<h3 style="font-family:'Playfair Display',serif;font-size:1.1rem;margin:0 0 10px;color:#374151">🚶 Deactivate in Denticon (${deactList.length})</h3>
    <table class="print-table">
      <thead><tr><th>Patient</th><th>Phone</th><th>Treatment</th><th>Went Elsewhere</th><th>Deactivated ✓</th></tr></thead>
      <tbody>${deactList.map(p => {
        const daysSince = Math.floor((new Date() - new Date(p.date + 'T00:00:00')) / 86400000);
        return `<tr>
          <td><strong>${p.name}</strong></td>
          <td>${p.phone || '—'}</td>
          <td>${p.value || '—'}</td>
          <td>${daysSince === 0 ? 'Today' : daysSince + 'd ago'}</td>
          <td><span class="print-line"></span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  if (!html) html = `<div class="print-empty">✅ No pending TC tasks.</div>`;
  content.innerHTML = html;
}

export function closeTCPrint() {
  document.getElementById('tcPrintOverlay').classList.remove('active');
}

expose({ resolveTC, deactivateTC, openTCPrint, closeTCPrint });
