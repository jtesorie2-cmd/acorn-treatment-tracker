// Red-banner Quick Add — log a patient in ~10 seconds before they walk out.

import { REASONS, RECARE_REASONS, TC_REASONS } from '../constants.js';
import { todayStr } from '../lib/dates.js';
import { newPatient, newSedationPatient, isDuplicate } from '../lib/model.js';
import { patients, sedationPatients, scheduleSave } from '../lib/store.js';
import { expose } from '../lib/expose.js';
import { render, switchTab } from './patients.js';

let qaOptionalVisible = false;

export function openQuickAdd() {
  qaOptionalVisible = false;
  document.getElementById('qaOverlay').classList.remove('hidden');
  document.getElementById('qaTitle').textContent = 'Logging Unscheduled Patient';
  renderQA();
  setTimeout(() => document.getElementById('qaChildFirst')?.focus(), 80);
}
export function closeQuickAdd() { document.getElementById('qaOverlay').classList.add('hidden'); }

export function renderQA() {
  const reasons = REASONS.map(r => `<option value="${r.key}">${r.label}</option>`).join('');
  document.getElementById('qaContent').innerHTML = `
    <p>Enter the child's name and phone before they walk out.</p>
    <div class="qa-fields">
      <div class="qa-field"><label>Child's First Name <span style="color:var(--rose)">*</span></label><input type="text" id="qaChildFirst" placeholder="First name" /></div>
      <div class="qa-field"><label>Child's Last Name <span style="color:var(--rose)">*</span></label><input type="text" id="qaChildLast" placeholder="Last name" /></div>
      <div class="qa-field"><label>Phone Number <span style="color:var(--rose)">*</span></label><input type="tel" id="qaPhone" placeholder="(555) 000-0000" oninput="formatPhone(this)" /></div>
      <div class="qa-field">
        <label>What didn't they schedule? <span style="color:var(--rose)">*</span></label>
        <select id="qaType" class="qa-select" onchange="updateQAReasonOptions()" style="border:2px solid var(--border)">
          <option value="treatment">💜 Treatment</option>
          <option value="recare">📅 Recare (cleaning / check-up)</option>
          <option value="sedation">💊 Sedation</option>
        </select>
      </div>
      <div class="qa-field"><label>Reason They Didn't Book</label>
        <select id="qaReason" class="qa-select" onchange="toggleReasonNote('qaReasonNote','qaReason')">
          ${reasons}
        </select>
      </div>
      <div class="qa-field hidden" id="qaReasonNote"><label>Note <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input type="text" id="qaReasonNoteInput" placeholder="Any extra detail…" /></div>
    </div>
    <div class="qa-optional-toggle" onclick="toggleQAOptional()">+ Add description (optional)</div>
    <div class="qa-optional${qaOptionalVisible?' visible':''}" id="qaOptional">
      <div class="qa-field"><label>Description</label><input type="text" id="qaTx" placeholder="e.g. Crown #14" /></div>
    </div>
    <div class="qa-actions">
      <button class="btn-qa-cancel" onclick="closeQuickAdd()">Cancel</button>
      <button class="btn-qa-save" onclick="saveQuickAdd()">Save & Start Follow-Up →</button>
    </div>`;
}

export function updateQAReasonOptions() {
  const type = document.getElementById('qaType')?.value || 'treatment';
  const reasons = type === 'recare' ? RECARE_REASONS : REASONS;
  const sel = document.getElementById('qaReason');
  if (sel) sel.innerHTML = reasons.map(r => `<option value="${r.key}">${r.label}</option>`).join('');
}

export function toggleQAOptional() {
  qaOptionalVisible = !qaOptionalVisible;
  document.getElementById('qaOptional')?.classList.toggle('visible', qaOptionalVisible);
  document.querySelector('.qa-optional-toggle').textContent = qaOptionalVisible ? '− Hide treatment description' : '+ Add treatment description (optional)';
}

export function toggleReasonNote(noteContainerId, selectId) {
  const val = document.getElementById(selectId)?.value;
  const container = document.getElementById(noteContainerId);
  // Show note for all non-empty reasons so staff can add context
  if (container) container.classList.toggle('hidden', !val);
}

export function saveQuickAdd() {
  const childFirst = document.getElementById('qaChildFirst').value.trim();
  const childLast = document.getElementById('qaChildLast').value.trim();
  const phone = document.getElementById('qaPhone').value.trim();
  if (!childFirst) { document.getElementById('qaChildFirst').classList.add('required-error'); document.getElementById('qaChildFirst').focus(); return; }
  if (!childLast) { document.getElementById('qaChildLast').classList.add('required-error'); document.getElementById('qaChildLast').focus(); return; }
  if (!phone) { document.getElementById('qaPhone').classList.add('required-error'); document.getElementById('qaPhone').focus(); return; }
  const type = document.getElementById('qaType')?.value || 'treatment';
  const tx = document.getElementById('qaTx')?.value.trim() || '';
  const reason = document.getElementById('qaReason')?.value || '';
  const reasonNote = document.getElementById('qaReasonNoteInput')?.value.trim() || '';
  const fullName = `${childLast}, ${childFirst}`;

  if (type === 'sedation') {
    sedationPatients.unshift(newSedationPatient(fullName, phone, childFirst));
    render(); scheduleSave();
    document.getElementById('qaTitle').textContent = 'Patient Logged!';
    document.getElementById('qaContent').innerHTML = `
      <div class="qa-success">
        <div class="qa-success-icon">💊</div>
        <div class="qa-success-name">${fullName}</div>
        <div class="qa-success-note">Added to the Sedation List. Follow-up schedule: 1 week, 2 weeks, 1 month, 2 months.</div>
        <div class="qa-success-note" style="color:#ea580c;margin-top:6px">Don't forget to mark their info as sent to Dr. Patel once you've done that!</div>
      </div>
      <div class="qa-actions"><button class="btn-qa-save" onclick="closeQuickAdd();switchTab('sedation')">View Sedation List →</button></div>`;
    return;
  }

  if (isDuplicate(fullName)) {
    if (!confirm(`${fullName} is already on the active list. Add them again anyway?`)) return;
  }
  patients.unshift(newPatient(fullName, phone, todayStr(), tx, childFirst, reason, reasonNote, type));
  render(); scheduleSave();

  const isRecare = type === 'recare';
  const isTCCase = !isRecare && TC_REASONS.has(reason);
  const tcNote = isTCCase
    ? `<div class="qa-success-tc-note">💜 Sent to Treatment Coordinator<br><span>The TC will send them a treatment plan — front desk follow-up calls proceed as normal.</span></div>`
    : '';

  const stepsNote = isRecare
    ? 'Their day-after and 1-week follow-up calls are scheduled automatically.'
    : 'Their 1-day, 3-day, and 2-week follow-up calls are scheduled automatically.';

  const icon = isTCCase ? '💜' : isRecare ? '📅' : '✅';

  document.getElementById('qaTitle').textContent = 'Patient Logged!';
  document.getElementById('qaContent').innerHTML = `
    <div class="qa-success">
      <div class="qa-success-icon">${icon}</div>
      <h3>${fullName} is in the system</h3>
      <p>${stepsNote} You'll see them on tomorrow's call sheet.</p>
      ${tcNote}
      <button class="btn-qa-another" onclick="document.getElementById('qaTitle').textContent='Logging Unscheduled Patient';renderQA();setTimeout(()=>document.getElementById('qaChildFirst')?.focus(),60)">+ Log Another Patient</button>
      <button class="btn-qa-close-success" onclick="closeQuickAdd()">Done</button>
    </div>`;
}

expose({
  openQuickAdd, closeQuickAdd, renderQA, updateQAReasonOptions,
  toggleQAOptional, toggleReasonNote, saveQuickAdd,
});
