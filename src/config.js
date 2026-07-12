// Deployment configuration.
//
// The anon key is safe to publish ONLY because Row Level Security is enabled
// on every table (see supabase/migrations/). It grants no data access on its
// own — staff must sign in with the office account first.
export const SUPABASE_URL = 'https://flvoshqclfsspccovloo.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsdm9zaHFjbGZzc3BjY292bG9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMTQ5OTQsImV4cCI6MjA4ODU5MDk5NH0.6vk4brwoOBT7WFWu3Hu2VmBRK30rAazPhJzdlhR1ahg';

// The shared staff account. Create this user in the Supabase dashboard
// (Authentication → Users → Add user) and disable public sign-ups.
// See docs/SECURITY.md for the full setup checklist.
export const OFFICE_EMAIL = 'frontdesk@acornpedsdental.com';

// PBKDF2 work factor for deriving the vault key from the office password.
export const KDF_ITERATIONS = 310000;

// Minutes of inactivity before the app locks itself and asks for the
// password again.
export const AUTO_LOCK_MINUTES = 120;
