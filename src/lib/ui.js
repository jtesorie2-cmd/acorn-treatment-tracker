import { expose } from './expose.js';

// ── Phone formatting ───────────────────────────────────────
export function formatPhone(input) {
  let digits = input.value.replace(/\D/g, '').slice(0, 10);
  let formatted = '';
  if (digits.length > 6)       formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  else if (digits.length > 3)  formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  else if (digits.length > 0)  formatted = `(${digits}`;
  input.value = formatted;
}

expose({ formatPhone });
