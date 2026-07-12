// End-of-Day batch add — catch anyone missed at checkout.

import { REASONS, RECARE_REASONS, TC_REASONS } from '../constants.js';
import { todayStr } from '../lib/dates.js';
import { newPatient, isDuplicate } from '../lib/model.js';
import { patients, scheduleSave } from '../lib/store.js';
import { expose } from '../lib/expose.js';
import { render } from './patients.js';

let eodQueue = [];

export function openEOD() {
  eodQueue = [];
  document.getElementById('eodOverlay').classList.remove('hidden');
  renderEOD();
  setTimeout(() => document.getElementById('eodName')?.focus(), 80);
}
export function closeEOD() { document.getElementById('eodOverlay').classList.add('hidden'); }

export function renderEOD() {
  const todayFmt = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' });
  const addedHTML = eodQueue.length ? `<div class="added-list">${eodQueue.map(q=>`
    <div class="added-item"><span class="added-check">✓</span><div><div class="added-name">${q.name}${q.isTC?' <span style="font-size:0.68rem;color:#7c3aed;font-weight:600">💜 TC</span>':''} <span style="font-size:0.68rem;font-weight:600;color:${q.type==='recare'?'#0369a1':'#6d28d9'}">${q.type==='recare'?'📅 Recare':'💜 Treatment'}</span></div><div class="added-phone">${q.phone||'No phone'}</div></div></div>`).join('')}</div>` : '';
  document.getElementById('eodContent').innerHTML = `
    <div class="eod-tag">End of Day · ${todayFmt}</div>
    <h2>${eodQueue.length === 0 ? 'Who Left Without Scheduling?' : 'Anyone Else?'}</h2>
    <p>${eodQueue.length === 0 ? "Log any patients who didn't book before leaving. We'll set up their follow-up schedule automatically." : "Keep going, or tap Done when you've got everyone."}</p>
    ${addedHTML}
    <div class="modal-fields">
      <div class="modal-field"><label>Child's First Name</label><input type="text" id="eodChildFirst" placeholder="First name" /></div>
      <div class="modal-field"><label>Child's Last Name</label><input type="text" id="eodChildLast" placeholder="Last name" /></div>
      <div class="modal-field"><label>Phone Number</label><input type="tel" id="eodPhone" placeholder="(555) 000-0000" oninput="formatPhone(this)" /></div>
      <div class="modal-field">
        <label>What didn't they schedule?</label>
        <select id="eodType" class="qa-select" onchange="updateEODReasonOptions()">
          <option value="treatment">💜 Treatment</option>
          <option value="recare">📅 Recare (cleaning / check-up)</option>
        </select>
      </div>
      <div class="modal-field"><label>Description (optional)</label><input type="text" id="eodTx" placeholder="e.g. Crown #14" /></div>
      <div class="modal-field"><label>Reason They Didn't Book</label>
        <select id="eodReason" class="qa-select" onchange="toggleReasonNote('eodReasonNote','eodReason')">
          ${REASONS.map(r => `<option value="${r.key}">${r.label}</option>`).join('')}
        </select>
      </div>
      <div class="modal-field hidden" id="eodReasonNote"><label>Note <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input type="text" id="eodReasonNoteInput" placeholder="Any extra detail…" /></div>
    </div>
    <div class="modal-actions">
      <button class="btn-modal-skip" onclick="eodFinish()">Done — That's Everyone</button>
      <button class="btn-modal-add" onclick="eodAdd()">Add Patient →</button>
    </div>`;
  setTimeout(() => document.getElementById('eodName')?.focus(), 50);
}

export function updateEODReasonOptions() {
  const type = document.getElementById('eodType')?.value || 'treatment';
  const reasons = type === 'recare' ? RECARE_REASONS : REASONS;
  const sel = document.getElementById('eodReason');
  if (sel) sel.innerHTML = reasons.map(r => `<option value="${r.key}">${r.label}</option>`).join('');
}

export function eodAdd() {
  const childFirst = document.getElementById('eodChildFirst').value.trim();
  const childLast = document.getElementById('eodChildLast').value.trim();
  if (!childFirst) { document.getElementById('eodChildFirst').style.borderColor='var(--rose)'; document.getElementById('eodChildFirst').focus(); return; }
  const phone = document.getElementById('eodPhone').value.trim();
  const type = document.getElementById('eodType')?.value || 'treatment';
  const tx = document.getElementById('eodTx').value.trim();
  const reason = document.getElementById('eodReason')?.value || '';
  const reasonNote = document.getElementById('eodReasonNoteInput')?.value.trim() || '';
  const fullName = `${childLast}, ${childFirst}`;
  if (isDuplicate(fullName)) {
    if (!confirm(`${fullName} is already on the active list. Add them again anyway?`)) return;
  }
  const isTC = type === 'treatment' && TC_REASONS.has(reason);
  eodQueue.push({ name: fullName, phone, isTC, type });
  patients.unshift(newPatient(fullName, phone, todayStr(), tx, childFirst, reason, reasonNote, type));
  render(); scheduleSave(); renderEOD();
}
export function eodFinish() { closeEOD(); }

expose({ openEOD, closeEOD, renderEOD, updateEODReasonOptions, eodAdd, eodFinish });
