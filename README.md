# Acorn Patient Follow-Up

Internal follow-up tracker for Acorn Pediatric Dental: log patients who
leave without scheduling (treatment, recare, or sedation referrals), work a
call/text cadence until they book or close, and track conversion.

## Architecture

Static web app — no build step, no server of its own. Plain ES modules served
as-is; Supabase provides authentication, Row Level Security, and storage of
client-side-encrypted patient rows.

```
index.html                  markup shell
styles/                     stylesheets (split from the old single file)
src/main.js                 entry point: sign-in, vault unlock, boot
src/config.js               Supabase URL/key, office email, tunables
src/constants.js            cadences, outcomes, reasons, text scripts
src/lib/                    auth, crypto (envelope encryption), store
                            (per-row sync), model (domain logic), dates,
                            legacy migration
src/features/               one module per screen/feature: patients (tx +
                            recare lists), quickadd, quickschedule, eod,
                            sedation, cold, winback, tc, denticon (PDF
                            import), print, report, charts, stats, csv,
                            notifications, deact
supabase/migrations/        SQL to run in the Supabase dashboard
docs/SECURITY.md            security model + setup + rotation procedures
```

## First-time setup

Follow the checklist in [docs/SECURITY.md](docs/SECURITY.md): create the
shared staff login in Supabase, run `supabase/migrations/0001_security.sql`,
sign in once to migrate legacy data, then drop the legacy table.

## Running locally

ES modules require HTTP (opening `index.html` from the filesystem won't
work):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Deploy by serving the repository as static files (GitHub Pages works).

## Security

Real staff sign-in (Supabase Auth + RLS) and client-side AES-256-GCM
encryption of all patient rows — see [docs/SECURITY.md](docs/SECURITY.md)
for the full model, HIPAA/BAA notes, and password-rotation steps.
