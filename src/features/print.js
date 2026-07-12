// Daily call sheet (overdue + due-today follow-ups) print view.

import { STEPS, RECARE_STEPS, REASONS, RECARE_REASONS } from '../constants.js';
import { getCardStatus, getStepStatus } from '../lib/model.js';
import { patients } from '../lib/store.js';
import { expose } from '../lib/expose.js';

export function openPrint() {
  document.getElementById('printOverlay').classList.add('active');
  document.getElementById('printDate').textContent = 'Generated ' + new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  const callList = [];
  patients.forEach(p => {
    if (p.closed) return;
    const s = getCardStatus(p);
    if (s === 'complete' || s === 'closed') return;
    const steps = p.type === 'recare' ? RECARE_STEPS : STEPS;
    for (let i = 0; i < steps.length; i++) {
      if (!p.steps[i]) {
        const st = getStepStatus(p, i);
        if (st === 'overdue' || st === 'today') callList.push({ p, stepIdx:i, stepStatus:st, steps });
        break;
      }
    }
  });
  callList.sort((a,b) => {
    // overdue first, then by type (treatment before recare), then by name
    if (a.stepStatus !== b.stepStatus) return a.stepStatus === 'overdue' ? -1 : 1;
    return a.p.name.localeCompare(b.p.name);
  });
  const content = document.getElementById('printContent');
  if (!callList.length) { content.innerHTML=`<div class="print-empty">🎉 No overdue or same-day follow-ups — great work!</div>`; return; }
  const pillCls = (i, ov, isRecare) => {
    if (ov) return 'pill-overdue';
    if (isRecare) return i === 0 ? 'pill-1day' : 'pill-3day';
    return ['pill-1day','pill-3day','pill-2week'][i] || 'pill-overdue';
  };
  const reasonsList = [...REASONS, ...RECARE_REASONS];
  content.innerHTML = `<table class="print-table">
    <thead><tr><th>Patient</th><th>Phone</th><th>Type</th><th>Step</th><th>Reason</th><th>Call Outcome</th></tr></thead>
    <tbody>${callList.map(({p, stepIdx, stepStatus, steps})=>{
      const isRecare = p.type === 'recare';
      const isOverdue = stepStatus === 'overdue';
      const stepLabel = steps[stepIdx]?.label || `Step ${stepIdx+1}`;
      const typeLabel = isRecare ? '📅 Recare' : '💜 Treatment';
      const reasonLabel = p.reason ? (reasonsList.find(r=>r.key===p.reason)?.label.replace(/^.{2}/,'')||'') : '—';
      return `<tr>
        <td><strong>${p.name}</strong>${p.childName?`<br><span style="font-size:0.78rem;color:#6b7280">${p.childName}</span>`:''}</td>
        <td>${p.phone||'—'}</td>
        <td style="font-size:0.78rem">${typeLabel}</td>
        <td><span class="print-step-pill ${pillCls(stepIdx,isOverdue,isRecare)}">${isOverdue?`OVERDUE · ${stepLabel}`:stepLabel}</span></td>
        <td style="font-size:0.78rem">${reasonLabel}${p.reasonNote?' — '+p.reasonNote:''}</td>
        <td><span class="print-line"></span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>
  <p class="print-count">${callList.length} patient${callList.length!==1?'s':''} to contact today</p>`;
}
export function closePrint() { document.getElementById('printOverlay').classList.remove('active'); }

expose({ openPrint, closePrint });
