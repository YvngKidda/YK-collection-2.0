/* ════════════════════════════════════════════════════════════════
   supabase-config.js — creates the Supabase client (`sb`)
   Load order in index.html:  supabase-js CDN → this file → script.js → admin.js

   Paste your two values from  Supabase → Project Settings → API Keys:
     • Project URL
     • PUBLISHABLE key  (starts with sb_publishable_…; the old "anon" key also works)

   These two values are SAFE to be public — they ship to every visitor's browser by design.
   What protects your data is Row Level Security (supabase-schema.sql), not hiding these.

   ⚠️ NEVER paste the SECRET key (sb_secret_…) or the old service_role key here or anywhere in
   this repo. Those bypass all security.
   ════════════════════════════════════════════════════════════════ */
const SUPABASE_URL = 'https://pnryjefxidwvobfrsowe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nVmLADJHmFLTp5qG4J7BqQ_b84dDzVY';
const STORAGE_BUCKET = 'product-images';

const SUPABASE_CONFIGURED = !/YOUR-PROJECT-REF|YOUR-PUBLISHABLE-KEY/.test(SUPABASE_URL + SUPABASE_KEY);

// `sb` is null if the CDN failed to load or the keys above haven't been filled in yet.
const sb = (window.supabase && SUPABASE_CONFIGURED)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;
