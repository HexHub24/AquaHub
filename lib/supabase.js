// AquaHub — Supabase client
// Config is loaded from a Cloudflare Pages Function at /api/config.js
// (which reads from Cloudflare Pages environment variables).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const configResponse = await fetch('/api/config.js');
const configText = await configResponse.text();

const urlMatch = configText.match(/SUPABASE_URL = '([^']+)'/);
const keyMatch = configText.match(/SUPABASE_ANON_KEY = '([^']+)'/);

const SUPABASE_URL = urlMatch ? urlMatch[1] : '';
const SUPABASE_ANON_KEY = keyMatch ? keyMatch[1] : '';

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

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  return user;
}

export async function redirectIfAuthed() {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = '/app.html';
  }
}
