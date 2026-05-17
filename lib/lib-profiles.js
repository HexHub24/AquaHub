// AquaHub — Profile helpers
//
// The canonical display name lives on `forum_user_profiles` (historical
// name — the table predates the universal-name decision and renaming
// Postgres tables breaks RLS policies). It's used as the user's display
// name everywhere in the app, not just in the forum.

import { supabase } from '/lib/supabase.js';

const RESERVED_NAMES = new Set([
  'admin', 'administrator', 'mod', 'moderator', 'aquahub', 'official',
  'staff', 'support', 'system', 'root', 'help', 'null', 'undefined',
  'anonymous', 'guest', 'user', 'me', 'you',
]);

const NAME_REGEX = /^[A-Za-z0-9 _.\-]+$/;

/**
 * Validate display name format (does NOT check uniqueness).
 * Returns { valid: true } or { valid: false, error: 'human message' }.
 */
export function validateDisplayName(name) {
  if (!name) return { valid: false, error: 'Pick a display name.' };
  const trimmed = String(name).trim();
  if (trimmed.length < 2) return { valid: false, error: 'At least 2 characters.' };
  if (trimmed.length > 30) return { valid: false, error: 'At most 30 characters.' };
  if (trimmed !== name) {
    return { valid: false, error: "No leading or trailing whitespace." };
  }
  if (/\s\s/.test(trimmed)) {
    return { valid: false, error: 'No consecutive spaces.' };
  }
  if (!NAME_REGEX.test(trimmed)) {
    return { valid: false, error: 'Letters, numbers, spaces, _ . - only.' };
  }
  if (RESERVED_NAMES.has(trimmed.toLowerCase())) {
    return { valid: false, error: 'That name is reserved. Try another.' };
  }
  return { valid: true };
}

/**
 * Check whether a name is currently taken (case-insensitive).
 * Uses the RPC so it works for both anon (signup) and authenticated.
 * Returns true if available, false if taken.
 */
export async function isDisplayNameAvailable(name) {
  const { data, error } = await supabase.rpc('is_display_name_available', { p_name: name });
  if (error) throw error;
  return data === true;
}

/**
 * Fetch the current user's profile (or null).
 */
export async function getMyProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('forum_user_profiles')
    .select('user_id, display_name, avatar_url, is_banned, post_count, created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('Failed to load profile:', error);
    return null;
  }
  return data;
}

/**
 * Insert or update the current user's profile with a display name.
 * Caller must have an authenticated session.
 *
 * Returns { ok: true } on success, or { ok: false, error, taken } on failure.
 * If `taken` is true, the name was claimed by another user (race condition).
 */
export async function setMyDisplayName(userId, name) {
  const v = validateDisplayName(name);
  if (!v.valid) return { ok: false, error: v.error };

  const { error } = await supabase
    .from('forum_user_profiles')
    .upsert(
      { user_id: userId, display_name: name },
      { onConflict: 'user_id' },
    );

  if (error) {
    // 23505 = unique_violation. Our unique index is on LOWER(display_name).
    if (error.code === '23505') {
      return { ok: false, error: 'That name is taken.', taken: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
