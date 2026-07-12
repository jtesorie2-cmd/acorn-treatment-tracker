// Patient domain logic: statuses, cadences, eligibility. No DOM here.

import {
  STEPS, RECARE_STEPS, OUTCOME_MAP, TC_REASONS,
  TEXT_SCRIPTS, RECARE_TEXT_SCRIPTS, COLD_TEXT_TREATMENT, COLD_TEXT_RECARE,
  SED_STEPS,
} from '../constants.js';
import { todayStr, getStepDueDate } from './dates.js';
import { patients, scheduleSave } from './store.js';

export function newPatient(name, phone, date, value, childName, reason, reasonNote, type) {
  const t = type || 'treatment';
  const stepCount = t === 'recare' ? 2 : 3;
  return { id: Date.now(), name, phone: phone||'', date: date||todayStr(), value: value||'', childName: childName||'', reason: reason||'', reasonNote: reasonNote||'', steps: Array(stepCount).fill(false), outcome:null, closed:false, notes:'', showNote:false, type: t };
}

export function isDuplicate(fullName) {
  return patients.some(p => p.name.toLowerCase() === fullName.toLowerCase() && !p.closed);
}

export function getStepStatus(p, i) {
  if (p.steps[i]) return 'done';
  const steps = p.type === 'recare' ? RECARE_STEPS : STEPS;
  const txDate = new Date(p.date + 'T00:00:00');
  const target = getStepDueDate(txDate, steps[i].days);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.floor((target - today) / 86400000);
  return diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'upcoming';
}

export function isGoneCold(p) {
  if (p.closed || (p.outcome && OUTCOME_MAP[p.outcome]?.closes)) return false;
  return p.steps.every(s => s) && !p.coldClosedAt;
}

export function ensureColdSince(p) {
  // If gone cold but no timestamp, stamp it now so countdown starts
  if (isGoneCold(p) && !p.coldSinceAt) {
    p.coldSinceAt = new Date().toISOString();
    scheduleSave();
  }
}

export function getCardStatus(p) {
  if (p.closed) return 'closed';
  if (p.outcome && OUTCOME_MAP[p.outcome]?.closes) return 'closed';
  if (isGoneCold(p)) {
    const coldSince = new Date(p.coldSinceAt || p.date + 'T00:00:00');
    const daysCold = Math.floor((new Date() - coldSince) / 86400000);
    if (daysCold >= 30) return 'closed';
    return 'cold';
  }
  const stepCount = p.type === 'recare' ? 2 : 3;
  for (let i = 0; i < stepCount; i++) {
    if (!p.steps[i]) {
      const s = getStepStatus(p, i);
      if (s === 'overdue') return 'overdue';
      if (s === 'today')   return 'today';
      return 'upcoming';
    }
  }
  return 'upcoming';
}

export function thisMonth() {
  const n = new Date();
  return patients.filter(p => { const d = new Date(p.date + 'T00:00:00'); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); });
}

export function getTextScript(p, stepIdx) {
  const child = p.childName?.trim() || 'your child';
  if (p.type === 'recare') return RECARE_TEXT_SCRIPTS[Math.min(stepIdx, RECARE_TEXT_SCRIPTS.length - 1)](child);
  return TEXT_SCRIPTS[stepIdx](child);
}

export function getColdText(p) {
  const child = p.childName?.trim() || 'your child';
  return p.type === 'recare' ? COLD_TEXT_RECARE(child) : COLD_TEXT_TREATMENT(child);
}

export function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z,\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Treatment Coordinator lists ────────────────────────────
export function getTCPlanPatients() {
  // Patients needing treatment plan sent
  return patients.filter(p =>
    !p.closed &&
    !(p.outcome && OUTCOME_MAP[p.outcome]?.closes) &&
    TC_REASONS.has(p.reason) &&
    !p.tcResolved
  );
}

export function getTCDeactivatePatients() {
  // Patients marked Went Elsewhere — need deactivating in Denticon
  return patients.filter(p =>
    p.outcome === 'elsewhere' &&
    !p.tcDeactivated
  );
}

export function getTCPatients() {
  // Combined for badge count
  return [...getTCPlanPatients(), ...getTCDeactivatePatients()];
}

export function getDeactPatients(year, month) {
  // Patients with 'elsewhere' outcome from the given month not yet deactivated by TC
  return patients.filter(p => {
    if (p.outcome !== 'elsewhere') return false;
    if (p.tcDeactivated) return false; // Already handled by TC
    const d = new Date(p.date + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

// ── Win Back ───────────────────────────────────────────────
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

export function isWinBackEligible(p) {
  if (p.type === 'sedation') return false;
  if (p.winbackArchived) return false;
  if (p.winbackScheduled) return false;
  if (!p.closed && !(p.outcome && OUTCOME_MAP[p.outcome]?.closes)) return false;
  // Must have been closed for 6+ months
  const closedAt = p.scheduledAt || p.coldClosedAt || p.coldSinceAt || p.date;
  if (!closedAt) return false;
  const msSinceClosed = Date.now() - new Date(closedAt).getTime();
  return msSinceClosed >= SIX_MONTHS_MS;
}

// ── Sedation ───────────────────────────────────────────────
export function newSedationPatient(name, phone, childName, date) {
  return {
    id: Date.now(),
    name, phone: phone || '', childName: childName || '',
    dateReferred: date || todayStr(),
    lastContacted: '',
    patelSent: false,
    status: 'Form Sent to Dr. Patel',
    notes: '',
    steps: [false, false, false, false],
    closed: false,
    addedAt: new Date().toISOString(),
  };
}

export function getSedCardStatus(p) {
  if (p.closed || p.status === 'Complete') return 'closed';
  const addedDate = new Date(p.addedAt || (p.dateReferred + 'T00:00:00'));
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 0; i < SED_STEPS.length; i++) {
    if (!p.steps[i]) {
      const due = new Date(addedDate.getTime() + SED_STEPS[i].days * 86400000);
      due.setHours(0,0,0,0);
      const diff = Math.floor((due - today) / 86400000);
      if (diff < 0) return 'overdue';
      if (diff === 0) return 'today';
      return 'upcoming';
    }
  }
  return 'upcoming';
}

export function getSedStepStatus(p, i) {
  if (p.steps[i]) return 'done';
  const addedDate = new Date(p.addedAt || (p.date + 'T00:00:00'));
  const dueDate   = new Date(addedDate.getTime() + SED_STEPS[i].days * 86400000);
  const today     = new Date(); today.setHours(0,0,0,0);
  if (dueDate <= today) return 'due';
  return 'upcoming';
}

export function sedStatusClass(status) {
  if (!status) return 'sed-s-noreturn';
  const s = status.toLowerCase();
  if (s.includes('complete') || s.includes('sedation complete')) return 'sed-s-complete';
  if (s.includes('scheduled')) return 'sed-s-scheduled';
  if (s.includes('form sent') || s.includes('sent to dr')) return 'sed-s-patel';
  if (s.includes('dr. patel contacted') || s.includes('in progress')) return 'sed-s-progress';
  if (s.includes('considering') || s.includes('pending') || s.includes('forms')) return 'sed-s-forms';
  if (s.includes('in-office') || s.includes('without') || s.includes('instead')) return 'sed-s-nosedation';
  if (s.includes('declined') || s.includes('no sedation')) return 'sed-s-nosedation';
  return 'sed-s-noreturn';
}
