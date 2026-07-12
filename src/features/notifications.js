// Daily browser reminder — counts only, never patient names.

import { getCardStatus, isGoneCold } from '../lib/model.js';
import { patients } from '../lib/store.js';
import { expose } from '../lib/expose.js';

let notifCheckInterval = null;

export function openNotifSettings() {
  const saved = localStorage.getItem('notif-time');
  if (saved) document.getElementById('notifTime').value = saved;
  updateNotifStatus();
  document.getElementById('notifOverlay').classList.remove('hidden');
}
export function closeNotifSettings() { document.getElementById('notifOverlay').classList.add('hidden'); }

export function updateNotifStatus() {
  const el = document.getElementById('notifStatus');
  const saved = localStorage.getItem('notif-time');
  if (!('Notification' in window)) {
    el.textContent = '⚠ Your browser does not support notifications.';
    return;
  }
  if (Notification.permission === 'denied') {
    el.textContent = '🚫 Notifications are blocked for this site. Please update your browser settings to allow them.';
    return;
  }
  if (saved && Notification.permission === 'granted') {
    el.textContent = `✅ Reminders are on — you'll be notified at ${saved} each weekday with overdue and due-today counts.`;
  } else if (saved) {
    el.textContent = `⏳ Reminder set for ${saved} — click Enable to grant permission.`;
  } else {
    el.textContent = 'No reminder set. Choose a time above and click Enable.';
  }
}

export async function saveNotifSettings() {
  const time = document.getElementById('notifTime').value;
  if (!time) { alert('Please choose a time.'); return; }
  if (!('Notification' in window)) { alert('Your browser does not support notifications.'); return; }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { updateNotifStatus(); return; }
  localStorage.setItem('notif-time', time);
  scheduleNotifCheck();
  updateNotifStatus();
  document.getElementById('notifBtn').classList.add('notif-bell-active');
  document.getElementById('notifBtn').textContent = '🔔';
  closeNotifSettings();
}

export function scheduleNotifCheck() {
  if (notifCheckInterval) clearInterval(notifCheckInterval);
  notifCheckInterval = setInterval(checkNotifTime, 60000);
  checkNotifTime();
}

export function checkNotifTime() {
  const saved = localStorage.getItem('notif-time');
  if (!saved || Notification.permission !== 'granted') return;
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return; // Skip weekends
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  if (currentTime !== saved) return;
  const shownKey = `notif-shown-${now.toISOString().split('T')[0]}`;
  if (localStorage.getItem(shownKey)) return;
  localStorage.setItem(shownKey, '1');

  const overdue = patients.filter(p => getCardStatus(p) === 'overdue').length;
  const today   = patients.filter(p => getCardStatus(p) === 'today').length;
  const closing = patients.filter(p => {
    if (!isGoneCold(p)) return false;
    const d = p.coldSinceAt ? Math.floor((new Date() - new Date(p.coldSinceAt)) / 86400000) : 0;
    return d >= 29;
  }).length;
  const total = overdue + today + closing;
  if (total === 0) return;

  const body = [
    overdue  > 0 ? `⚠ ${overdue} overdue` : '',
    today    > 0 ? `📅 ${today} due today` : '',
    closing  > 0 ? `🧊 ${closing} closing tomorrow` : '',
  ].filter(Boolean).join(' · ');

  new Notification('Acorn Patient Follow-Up', {
    body,
    icon: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@7.0.2/img/apple/64/1f4cb.png'
  });
}

expose({ openNotifSettings, closeNotifSettings, updateNotifStatus, saveNotifSettings });
