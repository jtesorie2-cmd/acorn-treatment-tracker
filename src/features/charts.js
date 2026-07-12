// Dashboard Chart.js charts. Chart.js is loaded as a classic <script defer>
// from the CDN, so it's reached via the global `Chart`.

import { REASONS, RECARE_REASONS } from '../constants.js';
import { patients } from '../lib/store.js';

let chartVolume = null, chartSplit = null, chartConversion = null, chartReasons = null;

// Toggle a chart's empty state without destroying its <canvas>. (The old
// code replaced the canvas with the empty-state note, so once a chart had
// been empty it could never render again — and worse, the next render()
// threw before the debounced save could run.)
function chartCanvas(canvasId, emptyMessage) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const wrap = canvas.parentElement;
  let note = wrap.querySelector('.chart-empty');
  if (emptyMessage) {
    canvas.style.display = 'none';
    if (!note) {
      note = document.createElement('div');
      note.className = 'chart-empty';
      wrap.appendChild(note);
    }
    note.textContent = emptyMessage;
    return null;
  }
  canvas.style.display = '';
  if (note) note.remove();
  return canvas;
}

export function renderCharts() {
  if (typeof Chart === 'undefined') { setTimeout(renderCharts, 200); return; }

  const border = '#E6E6EC', muted = '#9E9EAD';

  // ── 1. Volume — patients logged per month (last 6 months) ──
  const now = new Date();
  const volumeLabels = [], txCounts = [], rcCounts = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    volumeLabels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
    const mo = patients.filter(p => {
      const pd = new Date(p.date + 'T00:00:00');
      return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
    });
    txCounts.push(mo.filter(p => (p.type || 'treatment') === 'treatment').length);
    rcCounts.push(mo.filter(p => p.type === 'recare').length);
  }
  const txColor = '#f87171'; // pastel red (treatment)
  const rcColor = '#22d3ee'; // pastel cyan (recare)

  if (chartVolume) chartVolume.destroy();
  chartVolume = new Chart(document.getElementById('chartVolume'), {
    type: 'bar',
    data: {
      labels: volumeLabels,
      datasets: [
        { label: 'Treatment', data: txCounts, backgroundColor: txColor + 'cc', borderRadius: 10, borderSkipped: false, barThickness: 14 },
        { label: 'Recare',    data: rcCounts, backgroundColor: rcColor + 'cc', borderRadius: 10, borderSkipped: false, barThickness: 14 },
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, color: muted, boxWidth: 10, padding: 16 } }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: muted } },
        y: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: muted, stepSize: 1 } }
      }
    }
  });

  // ── 2. Treatment vs Recare split (all time) ──
  const txAll = patients.filter(p => (p.type || 'treatment') === 'treatment').length;
  const rcAll = patients.filter(p => p.type === 'recare').length;
  if (chartSplit) { chartSplit.destroy(); chartSplit = null; }
  const splitCanvas = chartCanvas('chartSplit', txAll + rcAll === 0 ? 'No data yet' : null);
  if (splitCanvas) {
    chartSplit = new Chart(splitCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Treatment', 'Recare'],
        datasets: [{ data: [txAll, rcAll], backgroundColor: [txColor + 'dd', rcColor + 'dd'], borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, color: muted, boxWidth: 10 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${Math.round(ctx.raw/(txAll+rcAll)*100)}%)` } }
        }
      }
    });
  }

  // ── 3. Scheduled vs Not Scheduled this month ──
  const mp = patients.filter(p => {
    const d = new Date(p.date + 'T00:00:00');
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const scheduled = mp.filter(p => p.outcome === 'scheduled').length;
  const notSched   = mp.length - scheduled;
  if (chartConversion) { chartConversion.destroy(); chartConversion = null; }
  const convCanvas = chartCanvas('chartConversion', mp.length === 0 ? 'No patients logged this month yet' : null);
  if (convCanvas) {
    chartConversion = new Chart(convCanvas, {
      type: 'bar',
      data: {
        labels: ['This Month'],
        datasets: [
          { label: 'Scheduled',     data: [scheduled], backgroundColor: '#6ee7b7', borderRadius: 8, borderSkipped: false },
          { label: 'Not Scheduled', data: [notSched],  backgroundColor: '#e2e8f0', borderRadius: 8, borderSkipped: false },
        ]
      },
      options: {
        indexAxis: 'y', responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, color: muted, boxWidth: 10 } } },
        scales: {
          x: { stacked: true, beginAtZero: true, grid: { color: border }, ticks: { font: { family: 'Inter', size: 11 }, color: muted, stepSize: 1 } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: muted } }
        }
      }
    });
  }

  // ── 4. Reason breakdown — single muted color, clean ──
  const reasonCounts = {};
  patients.forEach(p => { if (p.reason) reasonCounts[p.reason] = (reasonCounts[p.reason] || 0) + 1; });
  const reasonEntries = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const allReasons = [...REASONS, ...RECARE_REASONS];
  if (chartReasons) { chartReasons.destroy(); chartReasons = null; }
  const reasonsCanvas = chartCanvas('chartReasons', reasonEntries.length === 0 ? 'No reason data yet' : null);
  if (reasonsCanvas) {
    chartReasons = new Chart(reasonsCanvas, {
      type: 'bar',
      data: {
        labels: reasonEntries.map(([k]) => allReasons.find(r => r.key === k)?.label.replace(/^.{2}/, '') || k),
        datasets: [{ data: reasonEntries.map(([, v]) => v), backgroundColor: '#94a3b8', borderRadius: 8, borderSkipped: false }]
      },
      options: {
        indexAxis: 'y', responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: border }, ticks: { font: { family: 'Inter', size: 11 }, color: muted, stepSize: 1 } },
          y: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: muted } }
        }
      }
    });
  }
}
