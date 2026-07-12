// Denticon "Smart Assist" PDF import — the end-of-day safety net that
// cross-references the unscheduled report against the tracker.

import { OUTCOME_MAP } from '../constants.js';
import { todayStr } from '../lib/dates.js';
import { newPatient, newSedationPatient, normalizeName } from '../lib/model.js';
import { patients, sedationPatients, scheduleSave } from '../lib/store.js';
import { expose } from '../lib/expose.js';
import { render } from './patients.js';

let denticonResults = [];
let denticonHasResults = false;
let denticonSkipped = new Set();
let denticonActiveTab = 'missing';

function setDenticonTab(tab) {
  denticonActiveTab = tab;
  renderDenticonResults();
}

function resetDenticon() {
  denticonHasResults = false;
  denticonResults = [];
  denticonSkipped = new Set();
  denticonActiveTab = 'missing';
  renderDenticonBody('upload');
}

// Load PDF.js lazily when first needed
let pdfJsLoaded = false;
function loadPdfJs(callback) {
  if (pdfJsLoaded) { callback(); return; }
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  script.onload = () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfJsLoaded = true;
    callback();
  };
  document.head.appendChild(script);
}

function openDenticonUpload() {
  document.getElementById('denticonOverlay').classList.remove('hidden');
  if (denticonHasResults) {
    denticonResults = denticonResults.map(u => {
      if (u.added) return u;
      const match = patients.find(p => {
        if (p.closed || (p.outcome && OUTCOME_MAP[p.outcome]?.closes)) return false;
        return normalizeName(p.name) === u.normalized;
      });
      return { ...u, onTracker: !!match, patientId: match?.id || null };
    });
    renderDenticonBody('results');
  } else {
    renderDenticonBody('upload');
  }
  // Load PDF.js in the background so it's ready when they upload
  loadPdfJs(() => {});
}

function closeDenticonUpload() {
  document.getElementById('denticonOverlay').classList.add('hidden');
  const fileInput = document.getElementById('denticonFileInput');
  if (fileInput) fileInput.value = '';
}

function renderDenticonBody(state, data) {
  const body = document.getElementById('denticonModalBody');
  if (state === 'upload') {
    const today = new Date().toISOString().split('T')[0];
    body.innerHTML = `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:0.8rem;font-weight:600;color:#0369a1;">📅 Report date:</span>
        <input type="date" id="denticonReportDate" value="${today}"
          style="border:1.5px solid #bae6fd;border-radius:7px;padding:6px 10px;font-family:'Inter',sans-serif;font-size:0.85rem;outline:none;color:var(--ink);" />
        <span style="font-size:0.74rem;color:#0369a1;">If uploading a report from a previous day, set the date here so follow-up dates are calculated correctly.</span>
      </div>
      <div class="denticon-upload-zone" id="denticonDropZone"
        onclick="document.getElementById('denticonFileInput').click()"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');handleDenticonFile(event.dataTransfer.files[0])">
        <div class="denticon-upload-icon">📂</div>
        <div class="denticon-upload-label">Click to upload or drag & drop</div>
        <div class="denticon-upload-hint">Denticon unscheduled treatment report · PDF only</div>
      </div>
      <input type="file" id="denticonFileInput" class="denticon-upload-input" accept=".pdf" onchange="handleDenticonFile(this.files[0])" />`;
  } else if (state === 'parsing') {
    body.innerHTML = `<div class="denticon-parsing"><span class="denticon-parsing-spinner">⚙️</span>Reading report…</div>`;
  } else if (state === 'results') {
    renderDenticonResults();
  } else if (state === 'error') {
    body.innerHTML = `<div class="denticon-parsing">⚠️ ${data}<br><br><button class="btn-denticon-reset" onclick="renderDenticonBody('upload')">Try again</button></div>`;
  }
}

async function handleDenticonFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf') {
    renderDenticonBody('error', 'Please upload a PDF file.');
    return;
  }
  renderDenticonBody('parsing');
  loadPdfJs(async () => {
    try {
      const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Get items with their x positions to detect columns
      const items = content.items.map(item => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5]
      })).filter(item => item.text.length > 0);
      fullText += parseDenticonPage(items);
    }
    if (!fullText.trim()) {
      renderDenticonBody('error', "Couldn't extract text from this PDF. Make sure it's a Denticon unscheduled report.");
      return;
    }
    processDenticonText(fullText);
  } catch(e) {
    renderDenticonBody('error', 'Failed to read the PDF. Please try again.');
    console.error(e);
  }
  }); // end loadPdfJs
}

function parseDenticonPage(items) {
  // Group items by approximate row (same Y coordinate ±3px)
  const rows = [];
  items.forEach(item => {
    const existing = rows.find(r => Math.abs(r.y - item.y) < 3);
    if (existing) {
      existing.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  });
  // Sort rows top-to-bottom
  rows.sort((a, b) => b.y - a.y);
  // For each row, sort items left-to-right and join as tab-separated
  return rows.map(row => {
    row.items.sort((a, b) => a.x - b.x);
    return row.items.map(i => i.text).join('\t');
  }).join('\n');
}

function processDenticonText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const unscheduled = [];

  // Real PDF structure (from pdfplumber analysis of actual Denticon report):
  //
  // Each patient spans 3-4 rows. The MAIN row looks like:
  //   [PROVIDER] [DATE] [optional:PROVIDER2] [LastName,|LASTNA] [ü/û x14] [lastCol=û/ü]
  //
  // Last col û (251) = no next appt → flag
  // Last col ü (252) = has next appt → skip
  //
  // Name cases:
  //   1. Normal:   "Settle,"  on main row → first name "Aspen" on next row
  //   2. Wrapped:  "FRIEDMA"  on main row → "N," + "Sarah" on next row  (FRIEDMAN split)
  //   3. Inline:   "Dutra, Lyla" fully on same row as separate tokens
  //
  // Provider codes: all-caps, no comma, 4-10 chars (ASCALZ, CINDYQ, MRUGGIE, RO, MB, etc.)

  const isProviderToken = s =>
    !s.includes(',') && /^[A-Z]{2,10}$/.test(s);
  const isDate      = s => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
  const isTime      = s => /^\d{1,2}:\d{2}$/.test(s) || s === 'AM' || s === 'PM';
  const isID        = s => /^\d{5,}$/.test(s);
  const isCheckbox  = s => s.charCodeAt(0) === 252 || s.charCodeAt(0) === 251;
  const isNA        = s => s === 'N/A';
  const isSkip      = s => isDate(s) || isTime(s) || isID(s) || isCheckbox(s) || isNA(s) || isProviderToken(s);
  const isNamePart  = s => /^[A-Za-z]/.test(s) && s.length >= 2 && !isSkip(s);

  lines.forEach((line, i) => {
    const cols = line.split('\t').map(c => c.trim()).filter(Boolean);
    if (cols.length < 4) return;

    // Must end with û (251) = no next appointment
    if (cols[cols.length - 1].charCodeAt(0) !== 251) return;

    let lastName = '';
    let firstName = '';

    // Find name token — first col that ends with comma OR contains comma
    let nameIdx = -1;
    for (let j = 0; j < cols.length - 1; j++) {
      const c = cols[j];
      if (isSkip(c)) continue;
      if (c.endsWith(',') || c.includes(',')) {
        nameIdx = j;
        break;
      }
      // Could be start of a split last name (e.g. "FRIEDMA")
      // Check if next row has "N," continuation
      if (/^[A-Z]+$/.test(c) && c.length >= 4) {
        if (i + 1 < lines.length) {
          const nr = lines[i+1].split('\t').map(s => s.trim()).filter(Boolean);
          if (nr.some(s => /^[A-Z],/.test(s) || s === 'N,' || s.startsWith('N,'))) {
            nameIdx = j;
            break;
          }
        }
      }
    }

    if (nameIdx === -1) return;

    const nameToken = cols[nameIdx];

    if (nameToken.includes(',')) {
      // Case 1 & 3: "Settle," or "Dutra, Lyla"
      const parts = nameToken.split(',').map(s => s.trim());
      lastName = parts[0];
      firstName = parts[1] || '';

      // If first name empty, look for it after nameIdx on same row
      if (!firstName) {
        for (let j = nameIdx + 1; j < cols.length - 1; j++) {
          if (isNamePart(cols[j])) { firstName = cols[j]; break; }
        }
      }
      // Still empty — check next row
      if (!firstName && i + 1 < lines.length) {
        const nr = lines[i+1].split('\t').map(s => s.trim()).filter(Boolean);
        for (const s of nr) {
          if (isNamePart(s) && !s.includes(',')) { firstName = s; break; }
        }
      }
    } else {
      // Case 2: Split last name e.g. "FRIEDMA" + "N, Sarah" on next row
      const prefix = nameToken; // "FRIEDMA"
      if (i + 1 < lines.length) {
        const nr = lines[i+1].split('\t').map(s => s.trim()).filter(Boolean);
        for (let j = 0; j < nr.length; j++) {
          const s = nr[j];
          if (/^[A-Z],/.test(s) || s === 'N,') {
            // suffix like "N," — reconstruct last name
            lastName = prefix + s.replace(/,$/, ''); // "FRIEDMAN"
            // First name is next token on same row or next
            firstName = nr.slice(j+1).find(isNamePart) || '';
            break;
          }
          if (s.includes(',') && /^[A-Z]/.test(s)) {
            // Could be "N, Sarah" as one token
            const parts = s.split(',').map(x => x.trim());
            lastName = prefix + parts[0];
            firstName = parts[1] || '';
            break;
          }
        }
      }
      if (!lastName) lastName = prefix; // fallback
    }

    if (!lastName) return;

    // Capitalise properly (Denticon uses mixed/all-caps)
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const formattedLast  = lastName.split(/(?=[A-Z])/).join(''); // keep as-is, normalise handles comparison
    const trackerName = firstName ? `${formattedLast}, ${firstName}` : formattedLast;
    const displayName = firstName ? `${firstName} ${formattedLast}` : formattedLast;
    const normalized  = normalizeName(trackerName);

    if (normalized && !unscheduled.find(u => u.normalized === normalized)) {
      unscheduled.push({ raw: displayName, trackerName, normalized });
    }
  });

  if (unscheduled.length === 0) {
    renderDenticonBody('error', "No unscheduled patients found. Make sure this is the correct Denticon report.");
    return;
  }

  denticonHasResults = true;

  // Cross-reference against tracker
  denticonResults = unscheduled.map(u => {
    const match = patients.find(p => {
      if (p.closed || (p.outcome && OUTCOME_MAP[p.outcome]?.closes)) return false;
      return normalizeName(p.name) === u.normalized;
    });
    return {
      raw: u.raw,
      trackerName: u.trackerName,
      normalized: u.normalized,
      onTracker: !!match,
      patientId: match?.id || null,
      added: false,
    };
  });

  renderDenticonBody('results');
}

function renderDenticonResults() {
  const body = document.getElementById('denticonModalBody');

  const missing   = denticonResults.filter(r => !r.onTracker && !r.added && !denticonSkipped.has(r.normalized));
  const skipped   = denticonResults.filter(r => denticonSkipped.has(r.normalized));
  const treatment = denticonResults.filter(r => r.added && r.type === 'treatment');
  const recare    = denticonResults.filter(r => r.added && r.type === 'recare');
  const sedation  = denticonResults.filter(r => r.added && r.type === 'sedation');
  const onTracker = denticonResults.filter(r => r.onTracker && !r.added);

  const missingCount = missing.length;

  const summaryHTML = `
    <div class="denticon-summary">
      <div class="denticon-summary-item">
        <div class="denticon-summary-dot" style="background:#f59e0b"></div>
        <span><strong>${missingCount}</strong> need to be logged</span>
      </div>
      <div class="denticon-summary-item">
        <div class="denticon-summary-dot" style="background:#34d399"></div>
        <span><strong>${onTracker.length + treatment.length + recare.length + sedation.length}</strong> on tracker</span>
      </div>
      ${skipped.length > 0 ? `<div class="denticon-summary-item"><div class="denticon-summary-dot" style="background:var(--border)"></div><span style="color:var(--muted)">${skipped.length} skipped</span></div>` : ''}
    </div>`;

  const tabs = `
    <div class="denticon-tabs">
      <button class="denticon-tab ${denticonActiveTab==='missing'?'active':''}" onclick="setDenticonTab('missing')">
        ⚠️ Not Logged <span class="denticon-tab-badge">${missingCount}</span>
      </button>
      <button class="denticon-tab ${denticonActiveTab==='treatment'?'active':''}" onclick="setDenticonTab('treatment')">
        💜 Treatment <span class="denticon-tab-badge">${treatment.length}</span>
      </button>
      <button class="denticon-tab ${denticonActiveTab==='recare'?'active':''}" onclick="setDenticonTab('recare')">
        📅 Recare <span class="denticon-tab-badge">${recare.length}</span>
      </button>
      <button class="denticon-tab ${denticonActiveTab==='sedation'?'active':''}" onclick="setDenticonTab('sedation')">
        💊 Sedation <span class="denticon-tab-badge">${sedation.length}</span>
      </button>
    </div>`;

  let tabContent = '';

  if (denticonActiveTab === 'missing') {
    if (missing.length === 0) {
      tabContent = `<div style="text-align:center;padding:28px;color:var(--muted);font-size:0.86rem">✅ All patients have been logged or skipped.</div>`;
    } else {
      tabContent = missing.map((r, idx) => {
        const globalIdx = denticonResults.indexOf(r);
        return `
          <div class="denticon-result-row not-on" id="drow-${globalIdx}">
            <div class="denticon-result-name">${r.raw}</div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <button class="btn-denticon-skip" onclick="skipDenticon(${globalIdx})">Skip</button>
              <button class="btn-denticon-add" onclick="promptDenticonAdd(${globalIdx})">+ Add</button>
            </div>
          </div>
          <div class="denticon-type-picker hidden" id="dtype-${globalIdx}">
            <button class="btn-type-pick" onclick="addFromDenticon(${globalIdx},'treatment')">💜 Treatment</button>
            <button class="btn-type-pick" onclick="addFromDenticon(${globalIdx},'recare')">📅 Recare</button>
            <button class="btn-type-pick" onclick="addFromDenticon(${globalIdx},'sedation')" style="background:#fff7ed;border-color:#fed7aa;color:#ea580c">💊 Sedation</button>
          </div>`;
      }).join('');
    }
  } else if (denticonActiveTab === 'treatment') {
    const txList = [...treatment, ...onTracker.filter(r => (r.trackerType||'treatment') === 'treatment')];
    if (txList.length === 0) {
      tabContent = `<div style="text-align:center;padding:28px;color:var(--muted);font-size:0.86rem">No treatment patients logged yet.</div>`;
    } else {
      tabContent = txList.map(r => `
        <div class="denticon-result-row already-on">
          <div class="denticon-result-name">${r.raw}</div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="denticon-result-status denticon-status-ok">${r.added ? 'Just added' : 'On tracker'}</span>
            ${r.added ? `<button class="btn-denticon-move" onclick="moveDenticon('${r.normalized}','recare')">→ Move to Recare</button>` : ''}
          </div>
        </div>`).join('');
    }
  } else if (denticonActiveTab === 'recare') {
    const rcList = [...recare, ...onTracker.filter(r => r.trackerType === 'recare')];
    if (rcList.length === 0) {
      tabContent = `<div style="text-align:center;padding:28px;color:var(--muted);font-size:0.86rem">No recare patients logged yet.</div>`;
    } else {
      tabContent = rcList.map(r => `
        <div class="denticon-result-row already-on" style="background:#e0f2fe;border-color:#bae6fd">
          <div class="denticon-result-name">${r.raw}</div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="denticon-result-status" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd">${r.added ? 'Just added' : 'On tracker'}</span>
            ${r.added ? `<button class="btn-denticon-move" onclick="moveDenticon('${r.normalized}','treatment')">→ Move to Treatment</button>` : ''}
          </div>
        </div>`).join('');
    }
  } else if (denticonActiveTab === 'sedation') {
    if (sedation.length === 0) {
      tabContent = `<div style="text-align:center;padding:28px;color:var(--muted);font-size:0.86rem">No sedation patients logged yet.</div>`;
    } else {
      tabContent = sedation.map(r => `
        <div class="denticon-result-row already-on" style="background:#fff7ed;border-color:#fed7aa">
          <div class="denticon-result-name">${r.raw}</div>
          <span class="denticon-result-status" style="background:#fff7ed;color:#ea580c;border:1px solid #fed7aa">Sedation added</span>
        </div>`).join('');
    }
  }

  body.innerHTML = summaryHTML + tabs + `<div class="denticon-results">${tabContent}</div>`;

  const footer = document.querySelector('.denticon-modal-footer');
  footer.innerHTML = `
    <button class="btn-denticon-reset" onclick="resetDenticon()">📄 Upload New Report</button>
    <button class="btn-denticon-reset" onclick="openDenticonUpload()" style="color:var(--teal)">🔄 Refresh</button>
    <button class="btn-denticon-close" onclick="closeDenticonUpload()">Close</button>`;
}

function promptDenticonAdd(idx) {
  const picker = document.getElementById(`dtype-${idx}`);
  if (!picker) return;
  const isVisible = !picker.classList.contains('hidden');
  document.querySelectorAll('[id^="dtype-"]').forEach(el => el.classList.add('hidden'));
  if (!isVisible) picker.classList.remove('hidden');
}

function skipDenticon(idx) {
  const r = denticonResults[idx];
  if (!r) return;
  denticonSkipped.add(r.normalized);
  renderDenticonResults();
}

function addFromDenticon(idx, type) {
  const result = denticonResults[idx];
  if (!result) return;

  const trackerName = result.trackerName || result.raw;
  const parts = trackerName.split(',').map(s => s.trim());
  const childFirst = parts[1] || parts[0];

  // Use the report date if set, otherwise today
  const reportDate = document.getElementById('denticonReportDate')?.value || todayStr();

  if (type === 'sedation') {
    const sp = newSedationPatient(trackerName, '', childFirst);
    sp.dateReferred = reportDate;
    sp.addedAt = reportDate + 'T00:00:00.000Z';
    sedationPatients.unshift(sp);
  } else {
    patients.unshift(newPatient(trackerName, '', reportDate, '', childFirst, '', '', type));
  }
  result.added = true;
  result.type = type;
  denticonActiveTab = 'missing';
  render(); scheduleSave();
  renderDenticonResults();
}

function moveDenticon(normalized, newType) {
  // Find the patient in the tracker and update their type
  const result = denticonResults.find(r => r.normalized === normalized);
  if (result) result.type = newType;

  const p = patients.find(p => normalizeName(p.name) === normalized);
  if (p) {
    p.type = newType;
    // Reset steps for new type
    p.steps = Array(newType === 'recare' ? 2 : 3).fill(false);
    render(); scheduleSave();
  }
  renderDenticonResults();
}

expose({
  openDenticonUpload, closeDenticonUpload, renderDenticonBody,
  handleDenticonFile, promptDenticonAdd, skipDenticon, addFromDenticon,
  moveDenticon, setDenticonTab, resetDenticon,
});
