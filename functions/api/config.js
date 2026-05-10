export async function onRequest(context) {
  const { env } = context;
  const url = env.SUPABASE_URL || '';
  const key = env.SUPABASE_ANON_KEY || '';

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
