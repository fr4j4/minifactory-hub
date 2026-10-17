/** Al arrancar el servidor (no en el build): sin un SESSION_SECRET válido en producción, el proceso termina con el motivo. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try { (await import('./lib/config')).sessionSecret(); } catch (e) { console.error((e as Error).message); process.exit(1); }
}
