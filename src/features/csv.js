// CSV export of the full patient list.
//
// Note: the exported file is plaintext PHI by design (staff explicitly ask
// for it). It should be handled per office policy and deleted after use.

import { REASONS, OUTCOME_MAP } from '../constants.js';
import { patients } from '../lib/store.js';
import { expose } from '../lib/expose.js';

export function exportCSV() {
  const headers = ['Name', 'Child First Name', 'Phone', 'Date Logged', 'Treatment', 'Reason', 'Reason Note', 'Outcome', 'Days to Schedule', 'Notes'];
  const rows = patients.map(p => {
    const outcome = p.outcome ? (OUTCOME_MAP[p.outcome]?.label || p.outcome) : '';
    const days = p.scheduledAt ? Math.floor((new Date(p.scheduledAt) - new Date(p.date + 'T00:00:00')) / 86400000) : '';
    const reasonLabel = p.reason ? (REASONS.find(r=>r.key===p.reason)?.label.replace(/^.{2}/,'') || p.reason) : '';
    return [p.name, p.childName, p.phone, p.date, p.value, reasonLabel, p.reasonNote||'', outcome.replace(/[^\w\s\-]/g, ''), days, (p.notes || '').replace(/,/g, ';')];
  });
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acorn-treatment-tracker-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

expose({ exportCSV });
