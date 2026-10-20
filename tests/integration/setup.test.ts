import { describe, expect, it, vi } from 'vitest';
import { getDb, s } from '@/db';
import { bootstrap } from '@/lib/seed';
import { checkSetupToken, completeSetup, hasUsers, issueSetupToken, markStep, needsSetup } from '@/lib/setup';
import { getSettings, getSettingsRaw, saveSettings } from '@/lib/settings';

describe('asistente inicial (N10)', () => {
  it('sin ADMIN_PASSWORD no se crea ninguna cuenta y se emite un token de un solo uso', async () => {
    delete process.env.ADMIN_PASSWORD;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await bootstrap();
    expect(await hasUsers()).toBe(false);
    expect(await needsSetup()).toBe(true);
    const printed = log.mock.calls.flat().join('\n'); log.mockRestore();
    const token = printed.match(/código: (\w{12})/)?.[1];
    expect(token).toBeTruthy();
    expect(await checkSetupToken(token!)).toBe(true);
    expect(await checkSetupToken(token!.toLowerCase())).toBe(true); // se normaliza
    expect(await checkSetupToken('AAAAAAAAAAAA')).toBe(false);
    expect((await getSettings()).setup.tokenHash).toBe(''); // el hash nunca sale a la interfaz
    expect((await getSettingsRaw()).setup.tokenHash).not.toBe('');
  });
  it('un nuevo arranque invalida el token anterior', async () => {
    const a = await issueSetupToken(false); const b = await issueSetupToken(false);
    expect(await checkSetupToken(a)).toBe(false); expect(await checkSetupToken(b)).toBe(true);
  });
  it('con cuenta creada el asistente sigue pendiente hasta terminarlo; luego ya no se pide', async () => {
    const db = await getDb();
    await db.insert(s.users).values({ workspaceId: (await db.select().from(s.workspaces))[0].id, email: 'a@b.cl', name: 'A', role: 'admin', passwordHash: 'x' });
    expect(await needsSetup()).toBe(false); // instalación existente o desatendida: sin asistente
    await saveSettings({ setup: { ...(await getSettingsRaw()).setup, pending: true } });
    expect(await needsSetup()).toBe(true);
    await markStep('fiscal', 'omitido');
    await completeSetup();
    expect(await needsSetup()).toBe(false);
    const st = await getSettings();
    expect(st.setup.steps.fiscal).toBe('omitido'); expect(st.setup.completedAt).toBeTruthy();
  });
  it('con ADMIN_PASSWORD (instalación desatendida) se crea la cuenta y no hay asistente', async () => {
    // La base de esta prueba ya tiene taller; se comprueba la rama de creación con una contraseña explícita
    const db = await getDb(); await db.delete(s.users);
    await bootstrap({ adminPassword: 'una-clave-larga-123' });
    expect(await hasUsers()).toBe(true);
  });
});
