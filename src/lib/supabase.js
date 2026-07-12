import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

// supabase-js is vendored (vendor/supabase-js-2.js) and loaded as a classic
// <script> in index.html, so the app has no runtime dependency on a CDN for
// its security-critical path. The UMD build exposes `supabase` globally.
const { createClient } = globalThis.supabase;

// Single shared client. Handles sign-in, session persistence, automatic
// token refresh, and attaches the user's JWT to every PostgREST request —
// which is what Row Level Security authorizes against.
export const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
