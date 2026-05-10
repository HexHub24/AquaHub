export async function onRequest() {
     return new Response('pong', { headers: { 'Content-Type': 'text/plain' } });
   }
