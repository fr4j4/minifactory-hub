/**
 * ¿Este proceso ejecuta las colas (laminados y trabajos en segundo plano)?
 * Por defecto sí (todo en un solo proceso). Con `MF_EXTERNAL_WORKER=1` la aplicación web solo encola y las ejecuta el proceso
 * `npm run worker` (que define `MF_WORKER_PROCESS=1`): el laminado de OrcaSlicer ya no compite con las páginas. Requiere Postgres.
 */
export const runsQueues = () => process.env.MF_EXTERNAL_WORKER !== '1' || process.env.MF_WORKER_PROCESS === '1';
