// App entry point: sign-in + vault unlock, boot, global listeners.

// Feature modules register their inline-handler functions on window.
import './lib/ui.js';
import './features/stats.js';
import './features/charts.js';
import './features/tc.js';
import './features/cold.js';
import './features/winback.js';
import './features/sedation.js';
import './features/patients.js';
import './features/quickadd.js';
import './features/quickschedule.js';
import './features/eod.js';
import './features/print.js';
import './features/deact.js';
import './features/report.js';
import './features/csv.js';
import './features/notifications.js';
import './features/denticon.js';

import { REASONS } from './constants.js';
import { expose } from './lib/expose.js';
import { login, rewrapWithOldPassword, trySessionRestore, signOutAndLock, startAutoLock } from './lib/auth.js';
import { loadAll, startPolling } from './lib/store.js';
import { migrateIfNeeded } from './lib/migrate.js';
import { render } from './features/patients.js';
import { checkDeactReminder } from './features/deact.js';
import { scheduleNotifCheck } from './features/notifications.js';
import { closeQuickSchedule } from './features/quickschedule.js';
import { saveQuickAdd, closeQuickAdd } from './features/quickadd.js';
import { eodAdd, closeEOD } from './features/eod.js';
import { closePrint } from './features/print.js';
import { closeHelp } from './features/deact.js';
import { closeTCPrint } from './features/tc.js';

// ── Static init ────────────────────────────────────────────
document.getElementById('todayBadge').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
const todayDash = document.getElementById('todayDashBadge');
if (todayDash) todayDash.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

const addDateEl = document.getElementById('addDate');
if (addDateEl) addDateEl.valueAsDate = new Date();
const addReasonEl = document.getElementById('addReason');
if (addReasonEl) addReasonEl.innerHTML = REASONS.map(r => `<option value="${r.key}">${r.label}</option>`).join('');

document.getElementById('morningPrompt').querySelector('.mp-pill-dismiss').addEventListener('click', () => {
  sessionStorage.setItem('morning-prompt-dismissed', '1');
});

// Re-render when the poll pulls changes made on another computer.
document.addEventListener('acorn-data-updated', () => render());

// ── Keyboard ───────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!document.getElementById('qsOverlay').classList.contains('hidden')) {
    if (e.key === 'Escape') closeQuickSchedule();
    return;
  }
  if (!document.getElementById('qaOverlay').classList.contains('hidden')) {
    if (e.key==='Enter') { e.preventDefault(); saveQuickAdd(); }
    if (e.key==='Escape') closeQuickAdd();
    return;
  }
  if (!document.getElementById('eodOverlay').classList.contains('hidden')) {
    if (e.key==='Enter') { e.preventDefault(); eodAdd(); }
    if (e.key==='Escape') closeEOD();
    return;
  }
  if (document.getElementById('tcPrintOverlay').classList.contains('active') && e.key === 'Escape') closeTCPrint();
  if (document.getElementById('printOverlay').classList.contains('active') && e.key==='Escape') closePrint();
  if (!document.getElementById('helpOverlay').classList.contains('hidden') && e.key==='Escape') closeHelp();
});

// ── Sign-in + vault unlock ─────────────────────────────────
// One password: verified server-side by Supabase Auth, then reused to
// unwrap the data-encryption key (see lib/auth.js and lib/crypto.js).
// 'rewrap' mode handles the one-time re-seal after a password rotation.
let pwMode = 'login';
let pendingNewPassword = '';

async function checkPassword() {
  const input = document.getElementById('pwInput');
  const errEl = document.getElementById('pwError');
  const val = input.value;
  if (!val) { input.focus(); return; }
  errEl.textContent = 'Checking…';
  try {
    if (pwMode === 'rewrap') {
      await rewrapWithOldPassword(val, pendingNewPassword);
      unlockUI();
      return;
    }
    const result = await login(val);
    if (result === 'needs-rewrap') {
      pwMode = 'rewrap';
      pendingNewPassword = val;
      errEl.textContent = 'Signed in, but the data vault is sealed with a previous password. Enter the PREVIOUS office password once to re-seal it.';
      input.value = '';
      input.placeholder = 'Previous password';
      input.focus();
      return;
    }
    unlockUI();
  } catch (e) {
    errEl.textContent = e.message || 'Sign-in failed.';
    input.value = '';
    input.focus();
  }
}

function unlockUI() {
  const ps = document.getElementById('passwordScreen');
  ps.style.display = 'none';
  ps.innerHTML = ''; // remove SVG bg to prevent any overlay issues
  boot();
}

async function boot() {
  startAutoLock();
  await migrateIfNeeded();
  await loadAll();
  render();
  startPolling();
  checkDeactReminder();
  if (localStorage.getItem('notif-time') && 'Notification' in window && Notification.permission === 'granted') {
    scheduleNotifCheck();
    document.getElementById('notifBtn').classList.add('notif-bell-active');
  }
}

expose({ checkPassword, signOutAndLock });

// Skip the password screen when both the Supabase session and this tab's
// vault key survived a reload.
(async () => {
  if (await trySessionRestore()) {
    unlockUI();
  } else {
    setTimeout(() => document.getElementById('pwInput')?.focus(), 100);
  }
})();
