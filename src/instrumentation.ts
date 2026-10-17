/** Al arrancar el servidor (no en el build): sin un SESSION_SECRET válido en producción, no se inicia. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') (await import('./lib/config')).sessionSecret();
}
