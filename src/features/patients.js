// Treatment + Recare lists: rendering, patient cards, card actions,
// filters, tab switching, and the morning prompt.

import {
  STEPS, RECARE_STEPS, OUTCOMES, OUTCOME_MAP, STEP_COMPLETE_OUTCOMES,
  REASONS, RECARE_REASONS,
} from '../constants.js';
import { todayStr, getStepDueDate } from '../lib/dates.js';
import {
  newPatient, isDuplicate, getStepStatus, isGoneCold, getCardStatus,
  thisMonth, getTextScript, isWinBackEligible, getSedCardStatus,
} from '../lib/model.js';
import { patients, sedationPatients, scheduleSave, removePatient } from '../lib/store.js';
import { expose } from '../lib/expose.js';
import { updateConversionStats } from './stats.js';
import { renderTC } from './tc.js';
import { renderCold } from './cold.js';
import { renderSedation } from './sedation.js';
import { renderWinBack } from './winback.js';
import { renderCharts } from './charts.js';

export let activeFilter = 'all';
export let recareFilter = 'all';
export let activeTab = 'frontdesk';

// ── Actions ────────────────────────────────────────────────
export function addPatient() {
  const childFirst = document.getElementById('addChildFirst').value.trim();
  const childLast = document.getElementById('addChildLast').value.trim();
  const phone = document.getElementById('addPhone').value.trim();
  const date = document.getElementById('addDate').value;
  const value = document.getElementById('addValue').value.trim();
  if (!childFirst || !childLast || !date) { alert('Child name and date are required.'); return; }
  const fullName = `${childLast}, ${childFirst}`;
  if (isDuplicate(fullName)) {
    if (!confirm(`${fullName} is already on the active list. Add them again anyway?`)) return;
  }
  const type = document.getElementById('addType')?.value || 'treatment';
  const reason = document.getElementById('addReason')?.value || '';
  const reasonNote = document.getElementById('addReasonNoteInput')?.value.trim() || '';
  patients.unshift(newPatient(fullName, phone, date, value, childFirst, reason, reasonNote, type));
  ['addChildFirst','addChildLast','addPhone','addValue'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const ar = document.getElementById('addReason'); if (ar) ar.value = '';
  const arn = document.getElementById('addReasonNoteInput'); if (arn) arn.value = '';
  const arnc = document.getElementById('addReasonNote'); if (arnc) arnc.classList.add('hidden');
  render(); scheduleSave();
}

export function updateAddReasonOptions() {
  const type = document.getElementById('addType')?.value || 'treatment';
  const reasons = type === 'recare' ? RECARE_REASONS : REASONS;
  const sel = document.getElementById('addReason');
  if (sel) sel.innerHTML = reasons.map(r => `<option value="${r.key}">${r.label}</option>`).join('');
}

export function toggleStep(id, i) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  p.steps[i] = !p.steps[i];
  // Stamp when treatment patient first goes cold (all steps done)
  if (p.type !== 'recare' && p.steps.every(s => s) && !p.coldSinceAt) {
    p.coldSinceAt = new Date().toISOString();
  }
  if (!p.steps.every(s => s)) p.coldSinceAt = null;
  render(); scheduleSave();
}

export function setOutcome(id, key) {
  const p = patients.find(x => x.id === id);
  if (!p) return;

  // Deselect if same outcome clicked again
  if (p.outcome === key) {
    p.outcome = null;
    p.closed = false;
    render(); scheduleSave();
    return;
  }

  p.outcome = key;
  p.closed = OUTCOME_MAP[key]?.closes || false;
  if (key === 'scheduled' && !p.scheduledAt) p.scheduledAt = new Date().toISOString();

  // Auto-complete the current open step for attempt outcomes
  if (STEP_COMPLETE_OUTCOMES.has(key)) {
    const stepCount = p.type === 'recare' ? 2 : 3;
    for (let i = 0; i < stepCount; i++) {
      if (!p.steps[i]) {
        p.steps[i] = true;
        break;
      }
    }
    // If more steps remain, clear outcome so next step starts fresh
    if (!p.steps.every(s => s)) {
      p.outcome = null;
      p.closed = false;
    }
  }

  render(); scheduleSave();
}

export function toggleNote(id) {
  const p = patients.find(x => x.id === id);
  if (p) { p.showNote = !p.showNote; render(); }
}

export function updateNote(id, val) {
  const p = patients.find(x => x.id === id);
  if (p) { p.notes = val; scheduleSave(); }
}

export function dismiss(id) {
  if (!confirm('Remove this patient from the tracker?')) return;
  removePatient(id);
  render(); scheduleSave();
}

export function copyText(id, stepIdx, btnEl) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  const text = getTextScript(p, stepIdx);
  const steps = p.type === 'recare' ? RECARE_STEPS : STEPS;
  const stepLabel = steps[stepIdx]?.label || `Step ${stepIdx+1}`;
  navigator.clipboard.writeText(text).then(() => {
    btnEl.textContent = '✓ Copied!';
    btnEl.classList.add('copied');
    setTimeout(() => { btnEl.textContent = `📱 Copy ${stepLabel} Text`; btnEl.classList.remove('copied'); }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btnEl.textContent = '✓ Copied!';
    btnEl.classList.add('copied');
    setTimeout(() => { btnEl.textContent = `📱 Copy ${stepLabel} Text`; btnEl.classList.remove('copied'); }, 2000);
  });
}

// ── Filters ────────────────────────────────────────────────
export function setFilter(f, el) {
  activeFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  else {
    const m = { all:'fb-all', overdue:'fb-overdue', today:'fb-today', upcoming:'fb-upcoming', closed:'fb-closed' };
    document.getElementById(m[f])?.classList.add('active');
  }
  render();
}

export function setRecareFilter(f, el) {
  recareFilter = f;
  document.querySelectorAll('[id^="rfb-"]').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(`rfb-${f}`);
  if (target) target.classList.add('active');
  else if (el) el.classList.add('active');
  render();
}

export function scrollToRecare() {
  document.getElementById('recareSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Render ─────────────────────────────────────────────────
export function render() {
  const search = (document.getElementById('searchBox')?.value || '').toLowerCase();

  // Outcome strip — all patients
  const mp = thisMonth();
  document.getElementById('os-scheduled').textContent = mp.filter(p => p.outcome === 'scheduled').length;
  document.getElementById('os-voicemail').textContent = mp.filter(p => p.outcome === 'voicemail').length;
  document.getElementById('os-noanswer').textContent  = mp.filter(p => p.outcome === 'noanswer').length;
  document.getElementById('os-thinking').textContent  = mp.filter(p => p.outcome === 'thinking').length;
  document.getElementById('os-declined').textContent  = mp.filter(p => p.outcome === 'declined-cost' || p.outcome === 'declined-interest').length;
  document.getElementById('os-elsewhere').textContent = mp.filter(p => p.outcome === 'elsewhere').length;

  // Active stats — treatment
  const txPatients = patients.filter(p => (p.type || 'treatment') === 'treatment');
  const rcPatients = patients.filter(p => p.type === 'recare');

  // Cache status once per patient
  const txStatusCache = new Map(txPatients.map(p => [p.id, getCardStatus(p)]));
  const rcStatusCache = new Map(rcPatients.map(p => [p.id, getCardStatus(p)]));

  const txOverdue  = txPatients.filter(p => txStatusCache.get(p.id) === 'overdue').length;
  const txToday    = txPatients.filter(p => txStatusCache.get(p.id) === 'today').length;
  const txUpcoming = txPatients.filter(p => txStatusCache.get(p.id) === 'upcoming').length;
  const txActive   = txPatients.filter(p => { const s = txStatusCache.get(p.id); return s !== 'closed' && s !== 'cold'; }).length;

  document.getElementById('statOverdue').textContent   = txOverdue;
  document.getElementById('statToday').textContent     = txToday;
  document.getElementById('statUpcoming').textContent  = txUpcoming;
  document.getElementById('statTotal').textContent     = txActive;
  document.getElementById('txPanelOverdue').textContent  = txOverdue;
  document.getElementById('txPanelToday').textContent    = txToday;
  document.getElementById('txPanelUpcoming').textContent = txUpcoming;
  document.getElementById('txPanelTotal').textContent    = txActive;

  // Treatment tab badge — exclude cold
  const txBadge = document.getElementById('treatmentTabBadge');
  if (txActive > 0) { txBadge.textContent = txActive; txBadge.classList.remove('hidden'); }
  else { txBadge.classList.add('hidden'); }
  updateConversionStats();
  renderTC();
  renderCold();
  renderSedation();
  if (activeTab === 'winback') renderWinBack();
  if (activeTab === 'frontdesk' && document.getElementById('chartVolume')) renderCharts();

  // Win Back badge
  const winbackCount = patients.filter(isWinBackEligible).length;
  const wbBadge = document.getElementById('winbackTabBadge');
  if (wbBadge) { wbBadge.textContent = winbackCount; winbackCount > 0 ? wbBadge.classList.remove('hidden') : wbBadge.classList.add('hidden'); }

  // Sedation dashboard stat cards
  const sedActive = sedationPatients.filter(p => !p.closed && p.status !== 'Complete');
  const sedStatusCache = new Map(sedActive.map(p => [p.id, getSedCardStatus(p)]));
  document.getElementById('sedStatOverdue').textContent  = sedActive.filter(p => sedStatusCache.get(p.id) === 'overdue').length;
  document.getElementById('sedStatToday').textContent    = sedActive.filter(p => sedStatusCache.get(p.id) === 'today').length;
  document.getElementById('sedStatUpcoming').textContent = sedActive.filter(p => sedStatusCache.get(p.id) === 'upcoming').length;
  document.getElementById('sedStatTotal').textContent    = sedActive.length;

  // Recare tab badge + stat cards (dashboard + panel) — exclude cold
  const rcOverdue  = rcPatients.filter(p => rcStatusCache.get(p.id) === 'overdue').length;
  const rcToday    = rcPatients.filter(p => rcStatusCache.get(p.id) === 'today').length;
  const rcUpcoming = rcPatients.filter(p => rcStatusCache.get(p.id) === 'upcoming').length;
  const rcActiveCount = rcPatients.filter(p => { const s = rcStatusCache.get(p.id); return s !== 'closed' && s !== 'cold'; }).length;
  document.getElementById('rcStatOverdue').textContent  = rcOverdue;
  document.getElementById('rcStatToday').textContent    = rcToday;
  document.getElementById('rcStatUpcoming').textContent = rcUpcoming;
  document.getElementById('rcStatTotal').textContent    = rcActiveCount;
  document.getElementById('rcPanelOverdue').textContent  = rcOverdue;
  document.getElementById('rcPanelToday').textContent    = rcToday;
  document.getElementById('rcPanelUpcoming').textContent = rcUpcoming;
  document.getElementById('rcPanelTotal').textContent    = rcActiveCount;
  const rcBadge = document.getElementById('recareTabBadge');
  if (rcActiveCount > 0) { rcBadge.textContent = rcActiveCount; rcBadge.classList.remove('hidden'); }
  else { rcBadge.classList.add('hidden'); }

  // Morning prompt
  checkMorningPrompt();

  // ── Treatment list ──────────────────────────────────────
  const statusOrder = { overdue: 0, today: 1, upcoming: 2, cold: 3, closed: 4 };

  let filtered = txPatients.filter(p => {
    if (search && !p.name.toLowerCase().includes(search)) return false;
    const s = txStatusCache.get(p.id);
    if (activeFilter === 'all')    return s !== 'closed' && s !== 'cold';
    if (activeFilter === 'cold')   return s === 'cold';
    if (activeFilter === 'closed') return s === 'closed';
    return s === activeFilter;
  });

  const list = document.getElementById('patientList');
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>${txPatients.length === 0 ? 'No treatment patients yet — Tap the red banner above to log one!' : 'No treatment patients match this filter.'}</p></div>`;
  } else {
    filtered.sort((a, b) => (statusOrder[txStatusCache.get(a.id)] ?? 5) - (statusOrder[txStatusCache.get(b.id)] ?? 5));
    list.innerHTML = filtered.map(p => buildPatientCard(p)).join('');
  }

  // ── Recare list ─────────────────────────────────────────
  const recareSearch = (document.getElementById('recareSearchBox')?.value || '').toLowerCase();
  let rcFiltered = rcPatients.filter(p => {
    if (recareSearch && !p.name.toLowerCase().includes(recareSearch)) return false;
    const s = rcStatusCache.get(p.id);
    if (recareFilter === 'all')    return s !== 'closed' && s !== 'cold';
    if (recareFilter === 'closed') return s === 'closed';
    return s === recareFilter;
  });

  const rcList = document.getElementById('recareList');
  if (rcFiltered.length === 0) {
    rcList.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>${rcPatients.length === 0 ? 'No recare patients yet — log a cleaning no-show using the red banner.' : 'No recare patients match this filter.'}</p></div>`;
  } else {
    rcFiltered.sort((a, b) => (statusOrder[rcStatusCache.get(a.id)] ?? 5) - (statusOrder[rcStatusCache.get(b.id)] ?? 5));
    rcList.innerHTML = rcFiltered.map(p => buildPatientCard(p)).join('');
  }
}

// ── Build Patient Card ─────────────────────────────────────
export function buildPatientCard(p) {
  const isRecare = p.type === 'recare';
  const steps = isRecare ? RECARE_STEPS : STEPS;
  const reasonList = isRecare ? RECARE_REASONS : REASONS;
  const status = getCardStatus(p);
  const isCold = status === 'cold';

  const chipMap   = { overdue:'chip-overdue', today:'chip-today', upcoming:'chip-upcoming', cold:'chip-cold' };
  const chipLabel = { overdue:'Overdue', today:'Due Today', upcoming:'Upcoming', cold:'🧊 Gone Cold', closed:'' };
  const chip = status !== 'closed' ? `<span class="status-chip ${chipMap[status]||''}">${chipLabel[status]||''}</span>` : '';

  const typeBadge = isRecare
    ? `<span class="recare-type-badge">📅 Recare</span>`
    : `<span class="treatment-type-badge">💜 Treatment</span>`;

  const txDate  = new Date(p.date + 'T00:00:00');
  const dateStr = txDate.toLocaleDateString('en-US', { month:'short', day:'numeric' });

  let coldCountdown = '';
  if (isCold && p.coldSinceAt) {
    const daysCold = Math.floor((new Date() - new Date(p.coldSinceAt)) / 86400000);
    const daysLeft = 30 - daysCold;
    coldCountdown = `<div class="cold-countdown">Auto-closes in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} · Re-engagement attempt below</div>`;
  }

  const stepsHTML = steps.map((step, i) => {
    const s = p.steps[i] ? 'done' : getStepStatus(p, i);
    const dc = s === 'done' ? 'done' : s === 'today' ? 'due-now' : s === 'overdue' ? 'overdue-dot' : '';
    const due = getStepDueDate(txDate, step.days);
    const dueStr = due.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    const conn = i < steps.length - 1 ? `<div class="step-conn${p.steps[i]?' done':''}"></div>` : '';
    return `<div class="step" onclick="toggleStep(${p.id},${i})" title="${p.steps[i]?'Unmark':'Mark'}: ${step.label}">
      <div class="step-dot ${dc}">${p.steps[i]?'✓':step.label[0]}</div>
      <div class="step-label">${step.label}<br><span style="opacity:.7">${dueStr}</span></div>
    </div>${conn}`;
  }).join('');

  let copyBtns = '';
  if (isCold) {
    copyBtns = `<button class="btn-copy-text btn-copy-cold" onclick="copyText(${p.id},3,this)">📱 Copy Re-Engagement Text</button>`;
  } else {
    copyBtns = steps.map((step, i) => {
      if (p.steps[i]) return '';
      const s = getStepStatus(p, i);
      const isOverdue = s === 'overdue';
      return `<button class="btn-copy-text${isOverdue?' step-overdue':''}" onclick="copyText(${p.id},${i},this)">📱 Copy ${step.label} Text</button>`;
    }).filter(Boolean).join('');
  }

  const copyRow = (copyBtns && !p.closed) ? `<div class="copy-text-btns"><span class="copy-lbl">${isCold ? 'Re-engage:' : 'Send Text:'}</span>${copyBtns}</div>` : '';

  const outcomeBtns = OUTCOMES.map(o => {
    const isSelected = p.outcome === o.key;
    const baseClass = o.key === 'scheduled' ? ' btn-scheduled' : '';
    return `<button class="outcome-btn${baseClass}${isSelected?' selected-'+o.key:''}" onclick="setOutcome(${p.id},'${o.key}')">${o.label}</button>`;
  }).join('');

  const closedBanner = p.outcome && OUTCOME_MAP[p.outcome]?.closes
    ? `<span class="outcome-banner ob-${p.outcome}">${OUTCOME_MAP[p.outcome].label}</span>` : '';

  const notesHTML = p.showNote
    ? `<textarea class="notes-area" placeholder="Call notes…" onchange="updateNote(${p.id},this.value)">${p.notes||''}</textarea>`
    : (p.notes ? `<div class="notes-display">💬 ${p.notes}</div>` : '');

  const metaLabel = isRecare ? 'Recare' : 'Treatment';
  const reasonLabel = reasonList.find(r => r.key === p.reason)?.label || p.reason;

  return `<div class="patient-card${isRecare?' recare':''} s-${status}">
    <div class="card-main">
      <div class="patient-name">${p.name}</div>
      ${typeBadge}
      ${chip}
      ${closedBanner}
      ${coldCountdown}
      ${p.phone ? `<div class="patient-phone">📞 ${p.phone}</div>` : ''}
      <div class="patient-meta">${metaLabel}: ${dateStr}${p.childName?' · <strong>'+p.childName+'</strong>':''}${p.value?' · <em>'+p.value+'</em>':''}</div>
      ${p.reason ? `<div class="patient-reason">${reasonLabel}${p.reasonNote?' — '+p.reasonNote:''}</div>` : ''}
      ${p.planSentAt ? `<div class="plan-sent-badge">📋 Treatment Plan Sent by TC</div>` : ''}
      <div class="followup-steps">${stepsHTML}</div>
    </div>
    ${copyRow}
    <div class="card-bottom">
      <div class="outcome-label">Outcome</div>
      <div class="outcome-btns">${outcomeBtns}</div>
      <div class="card-actions">
        <button class="btn-note" onclick="toggleNote(${p.id})">📝 Notes</button>
        <button class="btn-dismiss" onclick="dismiss(${p.id})" title="Remove">✕</button>
      </div>
    </div>
    ${notesHTML ? `<div style="padding:0 18px 12px">${notesHTML}</div>` : ''}
  </div>`;
}

// ── Morning prompt ─────────────────────────────────────────
export function checkMorningPrompt() {
  const prompt = document.getElementById('morningPrompt');
  if (!prompt) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split('T')[0];

  const txYesterday = patients.filter(p =>
    (p.type || 'treatment') === 'treatment' &&
    p.date === yStr &&
    getCardStatus(p) !== 'closed'
  );
  const rcYesterday = patients.filter(p =>
    p.type === 'recare' &&
    p.date === yStr &&
    getCardStatus(p) !== 'closed'
  );
  const day29Cold = patients.filter(p => {
    if (!isGoneCold(p)) return false;
    const daysCold = p.coldSinceAt ? Math.floor((new Date() - new Date(p.coldSinceAt)) / 86400000) : 0;
    return daysCold >= 29;
  });

  const total = txYesterday.length + rcYesterday.length + day29Cold.length;
  if (total === 0) { prompt.classList.add('hidden'); return; }

  // Only show once per session
  if (sessionStorage.getItem('morning-prompt-dismissed')) { prompt.classList.add('hidden'); return; }

  const parts = [];
  if (txYesterday.length > 0) parts.push(`${txYesterday.length} treatment`);
  if (rcYesterday.length > 0) parts.push(`${rcYesterday.length} recare`);
  if (day29Cold.length > 0) parts.push(`${day29Cold.length} closing tomorrow`);

  document.getElementById('morningPromptTitle').textContent = `Good morning — you have follow-ups from yesterday`;
  document.getElementById('morningPromptSub').textContent = parts.join(' · ') + ' patient' + (total !== 1 ? 's' : '') + ' need a call today';
  prompt.classList.remove('hidden');
}

// ── Tab switching ──────────────────────────────────────────
export function switchTab(tab) {
  activeTab = tab;
  ['frontdesk','treatment','recare','cold','sedation','tc','winback'].forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle('active', tab === t);
  });
  document.getElementById('dashboardPanel').classList.toggle('hidden', tab !== 'frontdesk');
  document.getElementById('treatmentPanel').classList.toggle('hidden', tab !== 'treatment');
  document.getElementById('recarePanel').classList.toggle('hidden', tab !== 'recare');
  document.getElementById('coldPanel').classList.toggle('hidden', tab !== 'cold');
  document.getElementById('sedationPanel').classList.toggle('hidden', tab !== 'sedation');
  document.getElementById('tcPanel').classList.toggle('hidden', tab !== 'tc');
  document.getElementById('winbackPanel').classList.toggle('hidden', tab !== 'winback');
  if (tab === 'frontdesk') { renderCharts(); updateConversionStats(); }
  if (tab === 'winback') renderWinBack();
}

expose({
  render, addPatient, updateAddReasonOptions, toggleStep, setOutcome,
  toggleNote, updateNote, dismiss, copyText, setFilter, setRecareFilter,
  scrollToRecare, switchTab,
});
