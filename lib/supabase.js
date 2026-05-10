// AquaHub — Supabase client
// This file initializes the connection to your Supabase project.
// The anon key is safe to ship to the browser by design — it's
// enforced via Row Level Security policies on the database.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://jstxpjrinvvyqlafemfl.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_iyJNqHii4mU1b6MuULCpBw_wD2d-7EM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Helper: get the current user, or null if not signed in.
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

// Helper: redirect to login if not authenticated.
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  return user;
}

// Helper: redirect to app if already authenticated (for login page).
export async function redirectIfAuthed() {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = '/app.html';
  }
}
