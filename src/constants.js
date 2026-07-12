// Follow-up cadences, outcomes, reasons, and text-message scripts.

export const STEPS = [
  { label: '1 Day', days: 1 },
  { label: '3 Days', days: 3 },
  { label: '2 Weeks', days: 14 },
];

export const RECARE_STEPS = [
  { label: '1 Day', days: 1 },
  { label: '1 Week', days: 7 },
];

export const OUTCOMES = [
  { key: 'noanswer',          label: '🔇 No Answer',        closes: false },
  { key: 'voicemail',         label: '📞 Left Voicemail',   closes: false },
  { key: 'thinking',          label: '🤔 Still Thinking',   closes: false },
  { key: 'scheduled',         label: '🎉 Scheduled!',       closes: true  },
  { key: 'declined-cost',     label: '💰 Declined – Cost',  closes: true  },
  { key: 'declined-interest', label: '✗ Not Interested',    closes: true  },
  { key: 'elsewhere',         label: '🚶 Went Elsewhere',   closes: true  },
];
export const OUTCOME_MAP = Object.fromEntries(OUTCOMES.map(o => [o.key, o]));
export const STEP_COMPLETE_OUTCOMES = new Set(['voicemail', 'noanswer', 'thinking']);
export const TC_REASONS = new Set(['cost', 'no-tx']);

export const REASONS = [
  { key: '',           label: '— Select a reason (optional) —' },
  { key: 'cost',       label: '💰 Wants cost / insurance info first' },
  { key: 'spouse',     label: '👥 Needs to discuss with spouse' },
  { key: 'anxious',    label: '😟 Anxious child / wants to wait' },
  { key: 'scheduling', label: '📅 Scheduling conflict' },
  { key: 'no-tx',      label: '📋 No treatment plan yet — just didn\'t book' },
  { key: 'other',      label: '💬 Other' },
];

export const RECARE_REASONS = [
  { key: '',           label: '— Select a reason (optional) —' },
  { key: 'scheduling', label: '📅 Scheduling conflict' },
  { key: 'wait',       label: '⏳ Wants to wait / not ready' },
  { key: 'cost',       label: '💰 Cost / insurance concern' },
  { key: 'other',      label: '💬 Other' },
];

// Text scripts — Treatment
export const TEXT_SCRIPTS = [
  (child) => `Hi! This is Aliyah from Acorn Pediatric Dental. Dr. Jason wanted me to reach out — we'd love to get ${child} scheduled for their treatment. Feel free to reply here or give us a call at 732-852-9200 😊`,
  (child) => `Hi! Aliyah from Acorn Pediatric Dental here. We still have availability to get ${child} taken care of — just reply or call us at 732-852-9200 and we'll get something on the calendar!`,
  (child) => `Hi! This is Aliyah from Acorn Pediatric Dental. So sorry to keep reaching out — we just want to make sure ${child} gets a time that works for you! Our schedule does fill up quickly, especially popular morning and after-school slots. Whenever you're ready, just call or text us at 732-852-9200 and we'll find something that works for you 😊`,
  (child) => `Hi! Aliyah from Acorn Pediatric Dental here. We haven't heard from you in a while and just wanted to check in on ${child}. Dr. Jason's schedule has some openings if you'd like to revisit treatment — no pressure at all. You can reach us at 732-852-9200 anytime 😊`,
];

// Text scripts — Recare
export const RECARE_TEXT_SCRIPTS = [
  (child) => `Hi! This is Aliyah from Acorn Pediatric Dental. We noticed ${child} left yesterday without scheduling their 6-month cleaning — we'd love to get them in! Feel free to reply here or give us a call at 732-852-9200 😊`,
  (child) => `Hi! Aliyah from Acorn Pediatric Dental here. Just following up on ${child}'s 6-month cleaning — we still have some openings and would love to get them scheduled. Give us a call or reply here and we'll get it on the calendar! 732-852-9200 😊`,
];

// Final re-engagement texts for Gone Cold patients
export const COLD_TEXT_TREATMENT = (child) =>
  `Hi! Aliyah from Acorn Pediatric Dental here. We've been trying to reach you about ${child}'s treatment — we know life gets busy! We just wanted to check in one last time. Whenever you're ready, we're here. Feel free to call or text us at 732-852-9200 😊`;

export const COLD_TEXT_RECARE = (child) =>
  `Hi! This is Aliyah from Acorn Pediatric Dental. We just wanted to reach out one last time about ${child}'s 6-month cleaning — we want to make sure they don't miss out! Regular cleanings help us catch small things early, and most insurance plans cover them fully. We'd hate for those benefits to go unused. Whenever you're ready, call or text us at 732-852-9200 and we'll find a time that works 😊`;

// ── Sedation List ──────────────────────────────────────────
export const SED_STEPS = [
  { label: 'Form Sent',  days: 0  },
  { label: '1 Week',     days: 7  },
  { label: '2 Weeks',    days: 14 },
  { label: '1 Month',    days: 30 },
];

export const SED_TEXTS = [
  // Step 1: Form sent to Dr. Patel — notify parent
  (child) => `Hi! This is Aliyah from Acorn Pediatric Dental. We wanted to let you know that we've sent ${child}'s information over to Dr. Patel's office at Dental Sedation Services. They will be reaching out to you directly to discuss the sedation process, fees, and next steps. Please don't hesitate to call us at 732-852-9200 if you have any questions in the meantime 😊`,
  // Step 2: 1-week follow-up — Dr. Patel should have called by now
  (child) => `Hi! This is Aliyah from Acorn Pediatric Dental following up on ${child}'s sedation referral. Dr. Patel's office should have been in touch — have you had a chance to speak with them? We want to make sure everything is moving smoothly. Feel free to call or text us at 732-852-9200 and we're happy to help coordinate 😊`,
  // Step 3: 2-week follow-up — checking in again
  (child) => `Hi! Aliyah from Acorn Pediatric Dental here. We just wanted to check in again regarding ${child}'s sedation appointment with Dr. Patel's office. We know it can take a little time to get everything arranged — please let us know if there's anything we can do to help move things along. You can reach us at 732-852-9200 anytime 😊`,
  // Step 4: 1-month follow-up — final check-in before going cold
  (child) => `Hi! This is Aliyah from Acorn Pediatric Dental. It's been about a month since we referred ${child} for sedation and we just want to make sure nothing has fallen through the cracks. If you've had any concerns or questions about the process, we'd love to help. Please give us a call at 732-852-9200 — we're here to help get ${child} the care they need 😊`,
];

export const SED_STATUSES = [
  'Form Sent to Dr. Patel',
  'Parent Considering — Pending Decision',
  'Appt w Sedation Scheduled',
  'Sedation Complete',
  'Chose In-Office Treatment Instead',
  'Patient Has Not Responded',
  'No Sedation / Declined',
];
