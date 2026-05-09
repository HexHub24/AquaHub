// Cloudflare Pages Function
// Serves /lib/config.js dynamically with Supabase URL + anon key
// from environment variables. The anon key is safe to ship to the
// browser by design (it's enforced via Row Level Security).

export async function onRequest(context) {
  const { env } = context;
  const url = env.SUPABASE_URL || '';
  const key = env.SUPABASE_ANON_KEY || '';

  // Escape for safe embedding in JS string literals.
  const safe = (s) => String(s).replace(/[\\'"]/g, '\\$&');

  const body =
    `export const SUPABASE_URL = '${safe(url)}';\n` +
    `export const SUPABASE_ANON_KEY = '${safe(key)}';\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
