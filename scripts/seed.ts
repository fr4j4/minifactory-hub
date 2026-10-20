import fs from 'node:fs';
import path from 'node:path';

/** Carga datos de demostración. Con --reset borra la base embebida (./data/pgdata) antes. */
async function main() {
  if (process.argv.includes('--reset') && !process.env.DATABASE_URL) {
    fs.rmSync(path.join(process.cwd(), 'data'), { recursive: true, force: true });
    console.log('Base y archivos locales borrados');
  }
  const { seedDemo, bootstrap } = await import('../src/lib/seed');
  if (process.argv.includes('--bootstrap-only')) {
    await bootstrap({ quietToken: true });
    const { hasUsers, issueSetupToken } = await import('../src/lib/setup');
    if (await hasUsers()) console.log('Taller listo');
    else { await issueSetupToken(); console.log('Sin cuentas: completa la configuración inicial en /bienvenida'); }
    process.exit(0);
  }
  const r = await seedDemo();
  console.log(r.skipped ? 'La base ya tiene datos de demostración' : `Listo. Usuarios: ${r.users?.join(', ')} (contraseñas de demostración: admin1234 / taller1234)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
