// Dashboard conversion gauges + average-days-to-schedule stat.

import { patients } from '../lib/store.js';

export function drawGauge(canvasId, pct, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const W = 140, H = 80;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H - 6;
  const r  = 56;
  const start = Math.PI;
  const fill  = start + (Math.min(pct, 100) / 100) * Math.PI;

  // Background track
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.lineWidth = 12;
  ctx.strokeStyle = color + '22';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Filled arc
  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, fill);
    ctx.lineWidth = 12;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function updateConversionStats() {
  // Primary: scheduled ÷ contacted (at least 1 step done OR any outcome logged)
  // Secondary: scheduled ÷ total logged
  const wasContacted = (p) => p.steps.some(s => s) || !!p.outcome;

  const allTx = patients.filter(p => (p.type || 'treatment') === 'treatment');
  const allRc = patients.filter(p => p.type === 'recare');

  const calcRate = (all) => {
    const contacted     = all.filter(wasContacted);
    const sched         = contacted.filter(p => p.outcome === 'scheduled');
    const schedTotal    = all.filter(p => p.outcome === 'scheduled');
    const contactedRate = contacted.length > 0 ? Math.round((sched.length / contacted.length) * 100) : null;
    const totalRate     = all.length > 0 ? Math.round((schedTotal.length / all.length) * 100) : null;
    return { contactedRate, totalRate, sched: sched.length, contacted: contacted.length, schedTotal: schedTotal.length, total: all.length };
  };

  const overall = calcRate(patients);
  const tx      = calcRate(allTx);
  const rc      = calcRate(allRc);

  const applyGauge = (idVal, idSub, canvasId, data, color) => {
    if (data.contactedRate !== null) {
      document.getElementById(idVal).textContent = data.contactedRate + '%';
      document.getElementById(idSub).textContent = `${data.sched} scheduled of ${data.contacted} contacted`;
      drawGauge(canvasId, data.contactedRate, color);
    } else {
      document.getElementById(idVal).textContent = '—';
      document.getElementById(idSub).textContent = 'No data yet';
      drawGauge(canvasId, 0, '#E6E6EC');
    }
  };

  applyGauge('gaugeOverallVal',    'gaugeOverallSub',    'gaugeOverall',    overall, '#f87171');
  applyGauge('gaugeTreatmentVal',  'gaugeTreatmentSub',  'gaugeTreatment',  tx,      '#a78bfa');
  applyGauge('gaugeRecareVal',     'gaugeRecareSub',     'gaugeRecare',     rc,      '#22d3ee');

  // Avg days to schedule
  const scheduled = patients.filter(p => p.outcome === 'scheduled' && p.scheduledAt);
  if (scheduled.length > 0) {
    const avg = Math.round(scheduled.reduce((acc, p) =>
      acc + Math.max(0, Math.floor((new Date(p.scheduledAt) - new Date(p.date + 'T00:00:00')) / 86400000))
    , 0) / scheduled.length);
    document.getElementById('statAvgDays').textContent = avg;
    document.getElementById('statAvgDaysSub').textContent = `Based on ${scheduled.length} patient${scheduled.length !== 1 ? 's' : ''}`;
  } else {
    document.getElementById('statAvgDays').textContent = '—';
    document.getElementById('statAvgDaysSub').textContent = 'Data builds as patients schedule';
  }
}
