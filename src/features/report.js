// Monthly summary report modal.

import { REASONS, OUTCOME_MAP } from '../constants.js';
import { patients } from '../lib/store.js';
import { expose } from '../lib/expose.js';

let reportYear = new Date().getFullYear();
let reportMonth = new Date().getMonth();

export function openMonthlyReport() {
  reportYear = new Date().getFullYear();
  reportMonth = new Date().getMonth();
  document.getElementById('reportOverlay').classList.remove('hidden');
  renderReport();
}
export function closeMonthlyReport() { document.getElementById('reportOverlay').classList.add('hidden'); }

export function reportNavMonth(dir) {
  reportMonth += dir;
  if (reportMonth < 0) { reportMonth = 11; reportYear--; }
  if (reportMonth > 11) { reportMonth = 0; reportYear++; }
  renderReport();
}

export function renderReport() {
  const monthLabel = new Date(reportYear, reportMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('reportMonthLabel').textContent = monthLabel;
  document.getElementById('reportHeaderSub').textContent = monthLabel;

  const mp = patients.filter(p => {
    const d = new Date(p.date + 'T00:00:00');
    return d.getFullYear() === reportYear && d.getMonth() === reportMonth;
  });

  const total      = mp.length;
  const scheduled  = mp.filter(p => p.outcome === 'scheduled').length;
  const declined   = mp.filter(p => p.outcome === 'declined-cost' || p.outcome === 'declined-interest').length;
  const elsewhere  = mp.filter(p => p.outcome === 'elsewhere').length;
  const closed     = mp.filter(p => p.closed || (p.outcome && OUTCOME_MAP[p.outcome]?.closes)).length;
  const rate       = closed > 0 ? Math.round((scheduled / closed) * 100) : null;

  const withDays   = mp.filter(p => p.outcome === 'scheduled' && p.scheduledAt);
  const avgDays    = withDays.length > 0
    ? Math.round(withDays.reduce((a,p) => a + Math.floor((new Date(p.scheduledAt) - new Date(p.date+'T00:00:00')) / 86400000), 0) / withDays.length)
    : null;

  // Which step did they schedule on?
  const stepCounts = [0, 0, 0, 0]; // 3 steps + cold re-engage
  withDays.forEach(p => {
    const stepsCompleted = p.steps.filter(Boolean).length;
    const idx = Math.min(stepsCompleted, 3);
    stepCounts[idx > 0 ? idx - 1 : 0]++;
  });
  const stepLabels = ['After 1st contact', 'After 2nd contact', 'After 3rd contact', 'After re-engagement'];
  const topStepIdx = stepCounts.indexOf(Math.max(...stepCounts));
  const topStep = withDays.length > 0 ? `${stepLabels[topStepIdx]} (${stepCounts[topStepIdx]})` : null;

  // Came back after going cold
  const cameBackCold = mp.filter(p => p.outcome === 'scheduled' && p.coldSinceAt).length;

  // Top reason breakdown
  const reasonCounts = {};
  mp.forEach(p => { if (p.reason) reasonCounts[p.reason] = (reasonCounts[p.reason] || 0) + 1; });
  const reasonEntries = Object.entries(reasonCounts).sort((a,b) => b[1]-a[1]);
  const topReason = reasonEntries.length > 0
    ? REASONS.find(r => r.key === reasonEntries[0][0])?.label.replace(/^.{2}/,'') + ` (${reasonEntries[0][1]})`
    : null;

  const reasonBreakdownHTML = reasonEntries.length === 0 ? '' : `
    <div class="report-section-title">Reason Breakdown</div>
    <div class="report-reason-bars">
      ${reasonEntries.map(([key, count]) => {
        const label = REASONS.find(r => r.key === key)?.label.replace(/^.{2}/,'') || key;
        const pct = total > 0 ? Math.round((count/total)*100) : 0;
        return `<div class="reason-bar-row">
          <div class="reason-bar-label">${label}</div>
          <div class="reason-bar-track"><div class="reason-bar-fill" style="width:${pct}%"></div></div>
          <div class="reason-bar-count">${count}</div>
        </div>`;
      }).join('')}
    </div>`;

  const patientRows = mp.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">No patients logged this month.</td></tr>`
    : mp.map(p => {
        const outcomeLabel = p.outcome ? (OUTCOME_MAP[p.outcome]?.label || p.outcome) : '—';
        const days = p.scheduledAt ? Math.floor((new Date(p.scheduledAt) - new Date(p.date+'T00:00:00')) / 86400000) : null;
        const stepsCompleted = p.steps.filter(Boolean).length;
        const stepNote = p.outcome === 'scheduled' ? stepLabels[Math.min(stepsCompleted-1,3)] : '—';
        return `<tr>
          <td><strong>${p.name}</strong></td>
          <td>${new Date(p.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
          <td>${outcomeLabel}</td>
          <td>${days !== null ? days+'d' : '—'}</td>
          <td style="font-size:0.75rem;color:var(--muted)">${stepNote}</td>
        </tr>`;
      }).join('');

  document.getElementById('reportBody').innerHTML = `
    <div class="report-kpi-row">
      <div class="report-kpi">
        <div class="report-kpi-val">${total}</div>
        <div class="report-kpi-lbl">Logged</div>
      </div>
      <div class="report-kpi">
        <div class="report-kpi-val" style="color:var(--teal)">${scheduled}</div>
        <div class="report-kpi-lbl">Scheduled</div>
        ${rate !== null ? `<div class="report-kpi-sub">${rate}% conversion</div>` : ''}
      </div>
      <div class="report-kpi">
        <div class="report-kpi-val" style="color:var(--rose)">${declined + elsewhere}</div>
        <div class="report-kpi-lbl">Lost</div>
        <div class="report-kpi-sub">${declined} declined · ${elsewhere} elsewhere</div>
      </div>
      <div class="report-kpi">
        <div class="report-kpi-val" style="color:var(--sky)">${avgDays !== null ? avgDays+'d' : '—'}</div>
        <div class="report-kpi-lbl">Avg to Schedule</div>
        ${avgDays !== null ? `<div class="report-kpi-sub">${withDays.length} patients</div>` : '<div class="report-kpi-sub">No data yet</div>'}
      </div>
    </div>
    <div class="report-kpi-row" style="grid-template-columns:repeat(3,1fr)">
      <div class="report-kpi">
        <div class="report-kpi-val" style="color:#7c3aed">${cameBackCold}</div>
        <div class="report-kpi-lbl">Back from Cold</div>
        <div class="report-kpi-sub">Scheduled after going cold</div>
      </div>
      <div class="report-kpi" style="grid-column:span 2">
        <div class="report-kpi-val" style="font-size:0.95rem;color:var(--teal)">${topStep || '—'}</div>
        <div class="report-kpi-lbl">Most Common Scheduling Point</div>
        <div class="report-kpi-sub">${topReason ? `Top objection: ${topReason}` : 'No reason data yet'}</div>
      </div>
    </div>
    ${reasonBreakdownHTML}
    <div class="report-section-title">Patient Detail</div>
    <table class="report-table">
      <thead><tr><th>Patient</th><th>Logged</th><th>Outcome</th><th>Days</th><th>Scheduled After</th></tr></thead>
      <tbody>${patientRows}</tbody>
    </table>`;
}

expose({ openMonthlyReport, closeMonthlyReport, reportNavMonth });
