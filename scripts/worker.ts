/**
 * Proceso aparte para laminados y trabajos en segundo plano. Úselo junto con `MF_EXTERNAL_WORKER=1` en la aplicación web
 * (docker-compose.yml ya lo trae). Necesita Postgres: la base embebida (PGlite) solo admite un proceso.
 */
process.env.MF_WORKER_PROCESS = '1';

async function main() {
  if (!process.env.DATABASE_URL) { console.error('El worker aparte necesita DATABASE_URL (Postgres). Con la base embebida déjelo todo en un solo proceso.'); process.exit(1); }
  const { ensureWorker } = await import('../src/lib/slicer/queue');
  const { ensureJobWorker } = await import('../src/lib/jobs');
  ensureWorker(); ensureJobWorker();
  console.log('MiniFactory worker en marcha (laminados y trabajos en segundo plano)');
  setInterval(() => {}, 1 << 30); // mantiene vivo el proceso; los temporizadores de las colas están «unref»
}
main().catch((e) => { console.error(e); process.exit(1); });
