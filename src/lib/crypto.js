// Envelope encryption for patient data (PHI).
//
// A random 256-bit master key encrypts every row (AES-GCM). The master key is
// never stored in plaintext anywhere: it lives in the vault_meta table
// *wrapped* (encrypted) by a key derived from the office password with
// PBKDF2. Neither the repository nor the server ever sees the password, the
// derived key, or the unwrapped master key.
//
// Trade-off, documented in docs/SECURITY.md: the unwrapped master key is kept
// in sessionStorage so a page reload doesn't demand the password again. It is
// per-tab and cleared when the tab closes or the app auto-locks.

const KEY_CHECK_PLAINTEXT = 'acorn-vault-v1';

let masterRaw = null;   // Uint8Array(32)
let masterKey = null;   // CryptoKey

// ── base64 helpers (chunked — safe for larger payloads) ────
function bytesToB64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function importAesKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function aesEncrypt(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  return bytesToB64(combined);
}

async function aesDecrypt(key, b64) {
  const combined = b64ToBytes(b64);
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new Uint8Array(plain);
}

// ── Password → key-encryption-key (KEK) ────────────────────
export async function deriveKek(password, saltB64, iterations) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Vault lifecycle ────────────────────────────────────────

// First run: mint a master key and wrap it under the office password.
// Returns the vault_meta row fields to store server-side.
export async function createVault(password, iterations) {
  const saltB64 = bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
  masterRaw = crypto.getRandomValues(new Uint8Array(32));
  masterKey = await importAesKey(masterRaw);
  const kek = await deriveKek(password, saltB64, iterations);
  const wrappedKey = await aesEncrypt(kek, masterRaw);
  const keyCheck = await aesEncrypt(masterKey, new TextEncoder().encode(KEY_CHECK_PLAINTEXT));
  return { kdf_salt: saltB64, kdf_iters: iterations, wrapped_key: wrappedKey, key_check: keyCheck };
}

// Unlock with the office password against a stored vault_meta row.
// Throws on a wrong password (unwrap or key-check fails).
export async function unlockVault(password, vault) {
  const kek = await deriveKek(password, vault.kdf_salt, vault.kdf_iters);
  const raw = await aesDecrypt(kek, vault.wrapped_key); // throws if wrong password
  const key = await importAesKey(raw);
  const check = new TextDecoder().decode(await aesDecrypt(key, vault.key_check));
  if (check !== KEY_CHECK_PLAINTEXT) throw new Error('key check failed');
  masterRaw = raw;
  masterKey = key;
}

// Password rotation: re-wrap the already-unlocked master key under a new
// password. Returns updated vault_meta fields (rows stay untouched).
export async function rewrapVault(newPassword, iterations) {
  if (!masterRaw || !masterKey) throw new Error('vault is locked');
  const saltB64 = bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
  const kek = await deriveKek(newPassword, saltB64, iterations);
  const wrappedKey = await aesEncrypt(kek, masterRaw);
  const keyCheck = await aesEncrypt(masterKey, new TextEncoder().encode(KEY_CHECK_PLAINTEXT));
  return { kdf_salt: saltB64, kdf_iters: iterations, wrapped_key: wrappedKey, key_check: keyCheck };
}

export function isUnlocked() { return masterKey !== null; }

export function lockVault() {
  masterRaw = null;
  masterKey = null;
  try { sessionStorage.removeItem('acorn-vault-key'); } catch (e) {}
}

// ── Session persistence (per-tab) ──────────────────────────
export function saveSessionKey() {
  if (masterRaw) sessionStorage.setItem('acorn-vault-key', bytesToB64(masterRaw));
}

export async function restoreSessionKey() {
  try {
    const b64 = sessionStorage.getItem('acorn-vault-key');
    if (!b64) return false;
    masterRaw = b64ToBytes(b64);
    masterKey = await importAesKey(masterRaw);
    return true;
  } catch (e) { return false; }
}

// ── Row encryption ─────────────────────────────────────────
export async function encryptText(text) {
  if (!masterKey) throw new Error('vault is locked');
  return aesEncrypt(masterKey, new TextEncoder().encode(text));
}

export async function decryptText(b64) {
  if (!masterKey) throw new Error('vault is locked');
  return new TextDecoder().decode(await aesDecrypt(masterKey, b64));
}

export async function encryptJSON(obj) { return encryptText(JSON.stringify(obj)); }
export async function decryptJSON(b64) { return JSON.parse(await decryptText(b64)); }
