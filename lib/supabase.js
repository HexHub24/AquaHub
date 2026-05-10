// AquaHub — Supabase client
// This file initializes the connection to your Supabase project.
// Values come from /lib/config.js, which is generated at deploy time
// from Cloudflare Pages environment variables (see _functions/config.js).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/api/config.js';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Supabase config missing. Check Cloudflare Pages env vars.');
}

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
