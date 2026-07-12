// Sedation referrals — Dr. Patel form tracking + parent follow-ups.

import { SED_STEPS, SED_TEXTS, SED_STATUSES } from '../constants.js';
import { todayStr } from '../lib/dates.js';
import { newSedationPatient, getSedCardStatus } from '../lib/model.js';
import { sedationPatients, scheduleSave } from '../lib/store.js';
import { expose } from '../lib/expose.js';

export function submitSedationAdd() {
  const first = document.getElementById('sedFirst')?.value.trim();
  const last  = document.getElementById('sedLast')?.value.trim();
  const phone = document.getElementById('sedPhone')?.value.trim();
  const date  = document.getElementById('sedDate')?.value || todayStr();
  if (!first) { document.getElementById('sedFirst').focus(); return; }
  if (!last)  { document.getElementById('sedLast').focus(); return; }
  const fullName = `${last}, ${first}`;
  const p = newSedationPatient(fullName, phone, first);
  p.dateReferred = date;
  p.addedAt = date + 'T00:00:00.000Z';
  sedationPatients.unshift(p);
  document.getElementById('sedFirst').value = '';
  document.getElementById('sedLast').value = '';
  document.getElementById('sedPhone').value = '';
  document.getElementById('sedDate').value = '';
  renderSedation(); scheduleSave();
}

export function addSedationPatient(name, phone, childName) {
  sedationPatients.unshift(newSedationPatient(name, phone, childName));
  renderSedation(); scheduleSave();
}

export function toggleSedNote(id) {
  const p = sedationPatients.find(x => x.id === id);
  if (p) { p.showNote = !p.showNote; renderSedation(); }
}

export function toggleSedStep(id, stepIdx) {
  const p = sedationPatients.find(x => x.id === id);
  if (!p) return;
  p.steps[stepIdx] = !p.steps[stepIdx];
  renderSedation(); scheduleSave();
}

export function togglePatelSent(id) {
  const p = sedationPatients.find(x => x.id === id);
  if (!p) return;
  p.patelSent = !p.patelSent;
  renderSedation(); scheduleSave();
}

export function closeSedPatient(id) {
  const p = sedationPatients.find(x => x.id === id);
  if (!p) return;
  p.closed = !p.closed;
  renderSedation(); scheduleSave();
}

export function copySedText(id, stepIdx, btnEl) {
  const p = sedationPatients.find(x => x.id === id);
  if (!p) return;
  const child = p.childName?.trim() || 'your child';
  const text = SED_TEXTS[stepIdx](child);
  const origText = btnEl.textContent;
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  });
  btnEl.textContent = '✓ Copied!'; btnEl.classList.add('copied');
  // Mark last contacted date
  if (!p.lastContacted) { p.lastContacted = new Date().toISOString().split('T')[0]; scheduleSave(); }
  setTimeout(() => { btnEl.textContent = origText; btnEl.classList.remove('copied'); }, 2000);
}

export function updateSedDateReferred(id, value) {
  const p = sedationPatients.find(x => x.id === id);
  if (!p) return;
  p.dateReferred = value;
  p.addedAt = value + 'T00:00:00.000Z';
  renderSedation(); scheduleSave();
}

export function updateSedField(id, field, value) {
  const p = sedationPatients.find(x => x.id === id);
  if (!p) return;
  p[field] = value;
  scheduleSave();
}

export function renderSedation() {
  const list   = document.getElementById('sedList');
  const empty  = document.getElementById('sedEmpty');
  const badge  = document.getElementById('sedTabBadge');
  const count  = document.getElementById('sedCount');
  if (!list) return;

  const showClosed = document.getElementById('sedShowClosed')?.checked;
  const active  = sedationPatients.filter(p => !p.closed && p.status !== 'Sedation Complete');
  const visible = sedationPatients.filter(p => showClosed || (!p.closed && p.status !== 'Sedation Complete'));

  badge.textContent = active.length;
  active.length > 0 ? badge.classList.remove('hidden') : badge.classList.add('hidden');
  if (count) {
    const doneCount = sedationPatients.filter(p => p.closed || p.status === 'Sedation Complete').length;
    count.textContent = `${active.length} active${showClosed && doneCount > 0 ? ` · ${doneCount} complete/closed` : ''}`;
  }

  if (visible.length === 0) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  const sedSortOrder = { overdue: 0, today: 1, upcoming: 2, closed: 3 };
  const sorted = [...visible].sort((a, b) =>
    (sedSortOrder[getSedCardStatus(a)] ?? 4) - (sedSortOrder[getSedCardStatus(b)] ?? 4)
  );

  list.innerHTML = sorted.map(p => {
    const cardStatus = getSedCardStatus(p);
    const isComplete = p.status === 'Sedation Complete' || p.closed;
    const borderColor = cardStatus === 'overdue' ? '#fda4af' : cardStatus === 'today' ? '#fcd34d' : '#fed7aa';
    const addedDate = new Date(p.addedAt || (p.dateReferred ? p.dateReferred + 'T00:00:00' : new Date()));
    const dateVal = p.dateReferred || p.addedAt?.split('T')[0] || '';

    const stepsHTML = SED_STEPS.map((s, i) => {
      const done = p.steps[i];
      const dueDate = new Date(addedDate.getTime() + s.days * 86400000);
      const dueStr  = i === 0 ? 'Today' : dueDate.toLocaleDateString('en-US', { month:'short', day:'numeric' });
      const today   = new Date(); today.setHours(0,0,0,0);
      const diff    = Math.floor((dueDate - today) / 86400000);
      const dotClass = done ? 'done' : (i === 0 || diff <= 0) ? 'due-now' : '';
      const dotLabel = done ? '✓' : i === 0 ? '📋' : i === 1 ? '1W' : i === 2 ? '2W' : '1M';
      const conn = i < SED_STEPS.length - 1 ? `<div class="step-conn${done?' done':''}"></div>` : '';
      return `<div class="step" onclick="toggleSedStep(${p.id},${i})" title="${done?'Unmark':'Mark'}: ${s.label}">
        <div class="step-dot ${dotClass}">${dotLabel}</div>
        <div class="step-label">${s.label}<br><span style="opacity:.7">${dueStr}</span></div>
      </div>${conn}`;
    }).join('');

    const copyBtns = SED_STEPS.map((s, i) => {
      if (p.steps[i]) return '';
      const dueDate = new Date(addedDate.getTime() + s.days * 86400000);
      const today   = new Date(); today.setHours(0,0,0,0);
      const isOverdue = dueDate < today && i > 0;
      return `<button class="btn-copy-text${isOverdue?' step-overdue':''}" onclick="copySedText(${p.id},${i},this)">📱 Copy ${s.label} Text</button>`;
    }).filter(Boolean).join('');

    const copyRow = copyBtns && !isComplete
      ? `<div class="copy-text-btns"><span class="copy-lbl">Send Text:</span>${copyBtns}</div>` : '';

    return `<div class="patient-card s-${cardStatus}" style="border-left-color:${borderColor}">
      <div class="card-main" style="flex-wrap:wrap;gap:12px;">
        <div style="flex:1;min-width:160px;">
          <div class="patient-name">${p.name}</div>
          ${p.phone ? `<div class="patient-phone">📞 ${p.phone}</div>` : ''}
          <div style="display:flex;align-items:center;gap:6px;margin-top:5px;">
            <span style="font-size:0.68rem;color:var(--muted);font-weight:600;white-space:nowrap;">Referred:</span>
            <input type="date" value="${dateVal}" onchange="updateSedDateReferred(${p.id},this.value)"
              style="border:1px solid #e5e7eb;border-radius:5px;padding:2px 6px;font-family:'Inter',sans-serif;font-size:0.72rem;outline:none;color:var(--ink);" />
          </div>
        </div>
        <div style="flex:0 0 auto;">
          <select class="qa-select" style="font-size:0.78rem;padding:6px 10px;border-color:#fed7aa;min-width:200px;" onchange="updateSedField(${p.id},'status',this.value);renderSedation()">
            ${SED_STATUSES.map(s=>`<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="followup-steps">${stepsHTML}</div>
      </div>
      ${copyRow}
      <div class="card-bottom" style="align-items:flex-start;gap:10px;">
        <textarea class="notes-area" placeholder="Notes…" rows="2"
          style="margin-top:0;flex:1;min-height:38px;resize:vertical;font-size:0.8rem;"
          onblur="updateSedField(${p.id},'notes',this.value)">${p.notes||''}</textarea>
        <button class="btn-dismiss" onclick="closeSedPatient(${p.id})"
          style="align-self:flex-start;font-size:0.78rem;padding:5px 12px;border-radius:7px;border:1.5px solid ${isComplete?'#86efac':'var(--border)'};color:${isComplete?'#16a34a':'var(--muted)'};background:${isComplete?'#f0fdf4':'none'};">
          ${isComplete ? '↩ Re-open' : '✓ Done'}
        </button>
      </div>
    </div>`;
  }).join('');
}

expose({
  submitSedationAdd, toggleSedNote, toggleSedStep, togglePatelSent,
  closeSedPatient, copySedText, updateSedDateReferred, updateSedField,
  renderSedation,
});
