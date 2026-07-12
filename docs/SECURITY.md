# Security Guide — Acorn Patient Follow-Up

This app stores protected health information (children's names, phone
numbers, and clinical notes). This document explains how the security works,
the one-time setup steps, and the operating procedures the office should
follow.

## How the security works

**One office password, two real jobs:**

1. **Authentication.** The password signs into a single shared Supabase Auth
   account. The server verifies it — there is no password in the page source.
   Every database table has Row Level Security enabled, granting access to
   signed-in staff only; the `anon` API key published with the site grants
   **nothing** on its own.
2. **Encryption.** Patient rows are encrypted in the browser (AES-256-GCM)
   before upload, under a random master key. That master key is stored
   *wrapped* (encrypted) by a key derived from the office password
   (PBKDF2, 310k iterations). The server only ever stores ciphertext and a
   wrapped key — a database leak alone does not expose patient data.

Additional behaviors:

- The unlocked key is kept per-browser-tab (sessionStorage) so a reload
  doesn't re-prompt; closing the tab locks it. The app also auto-locks after
  2 hours of inactivity (`AUTO_LOCK_MINUTES` in `src/config.js`).
- Browser notifications contain counts only, never patient names.
- CSV export is intentionally plaintext — handle exported files per office
  policy and delete them after use.

## One-time setup checklist

1. **Create the shared staff account.** Supabase dashboard → Authentication →
   Users → *Add user*. Use the email in `src/config.js` (`OFFICE_EMAIL`) and
   choose a strong office password. Then under Authentication → Sign In /
   Up, **disable public sign-ups**.
2. **Run the SQL migration.** Dashboard → SQL Editor → paste and run
   `supabase/migrations/0001_security.sql`. This creates the encrypted
   tables, turns on Row Level Security everywhere, and immediately cuts off
   the old anonymous access to `tracker_data`.
3. **First sign-in.** Open the app, enter the office password. The app
   creates the encryption vault, then automatically migrates the legacy data
   from `tracker_data` into encrypted per-patient rows.
4. **After confirming the data migrated** (patients appear in the app), drop
   the legacy plaintext-keyed table in the SQL Editor:
   `drop table public.tracker_data;`
5. **Retire burned credentials.** The old page password and the old
   hardcoded encryption key are still visible in this repository's git
   history. They no longer gate anything after steps 1–4, but do not reuse
   them anywhere.

## Rotating the office password

1. Supabase dashboard → Authentication → Users → the office account →
   *Reset password* — set the new one.
2. Have any staff member sign into the app with the **new** password. The
   app will detect that the data vault is still sealed under the old
   password and prompt once for it, then re-seal the vault under the new
   password automatically. (Only the small wrapped key is re-encrypted; the
   patient rows are untouched.)

Rotate immediately whenever someone who knows the password leaves the
practice.

## HIPAA notes

- **Business Associate Agreement:** storing PHI with Supabase requires a
  signed BAA — available on Supabase's Team plan with the HIPAA add-on.
  Contact Supabase to enable it for this project. The static page host (e.g.
  GitHub Pages) serves only code, never PHI, so no BAA is needed there.
- **Shared login trade-off:** the office chose a single shared password over
  per-staff accounts. That means individual staff actions are not
  attributable and revoking one person requires rotating the shared
  password. Revisit per-staff accounts if the team grows.
- **Residual repository history:** earlier versions of this repository
  committed real patient names and notes inside `index.html`
  (`SED_SEED_DATA`), and the data was removed going forward only — it is
  still present in old git commits. Keep this repository **private**, limit
  collaborator access, and if it was ever public, contact GitHub Support to
  purge cached views. A full history rewrite remains the only way to truly
  delete it.

## Threat-model summary

| Attacker has… | Old app | This version |
| --- | --- | --- |
| The page source / repo | Full read-write of all data (keys hardcoded) | Nothing — anon key is gated by RLS |
| The anon API key | Full read-write | Nothing (RLS) |
| A database dump | Plaintext-equivalent (key was public) | Ciphertext + wrapped key only |
| The office password | Full access | Full access (rotate on staff departure) |
