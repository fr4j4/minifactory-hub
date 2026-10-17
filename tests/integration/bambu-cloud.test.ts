import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startSim, type SimHandle } from '../../scripts/bambu-sim';
import { startCloudSim, type CloudSim } from '../../scripts/bambu-cloud-sim';
import { cloudDevices, cloudTasks, cloudUsername, isAllowedCoverUrl, loginPassword, loginWithCode, loginWithTfa, tokenExpiry } from '@/lib/bambu/cloud';
import { CloudSession } from '@/lib/bambu/cloud-mqtt';

// bambu.test.ts usa 23000–24990 (su A1 escucha MQTT en 24883): esta base no se cruza con esos puertos
const B = 26000; let p1s: SimHandle; let a1: SimHandle; let cloud: CloudSim;
beforeAll(async () => {
  p1s = await startSim({ serial: '01P00A391800123', name: 'P1S Nube', model: 'C12', accessCode: '12345678', mqttPort: B + 883, ssdpTargets: [], trays: [{ type: 'PLA', color: '#E8432E', brand: 'PLA Basic', remain: 62 }, null, null, null], printing: { file: 'pieza.3mf', totalLayers: 100, minutes: 60, progress: 40 } });
  a1 = await startSim({ serial: '03900A3B2200456', name: 'A1 Nube', model: 'N2S', accessCode: '87654321', mqttPort: B + 1883, ssdpTargets: [] });
  const caFile = path.resolve('data/test-cloud-ca.pem');
  cloud = await startCloudSim({ apiPort: B + 80, mqttPort: B + 884, caFile, users: [
    { email: 'plain@x.cl', password: 'clave1', uid: '111', name: 'Plain', mode: 'plain', devices: [{ sim: p1s }] },
    { email: 'code@x.cl', password: 'clave2', uid: '222', name: 'Code', mode: 'code', code: '246810', jwt: true, devices: [{ sim: p1s }, { sim: a1, online: false }] },
    { email: 'tfa@x.cl', password: 'clave3', uid: '333', name: 'Tfa', mode: 'tfa', tfa: '135790', devices: [{ sim: a1 }] },
  ] });
  Object.assign(process.env, { BAMBU_CLOUD_API: cloud.apiBase, BAMBU_CLOUD_WEB: cloud.apiBase, BAMBU_CLOUD_MQTT: cloud.mqtt, BAMBU_CLOUD_CA_FILE: caFile });
}, 60_000);
afterAll(async () => { await cloud?.stop(); await p1s?.stop(); await a1?.stop(); });

describe('Bambu Cloud (contra la nube simulada)', () => {
  it('login directo, con código por correo y con 2FA', async () => {
    await expect(loginPassword('global', 'plain@x.cl', 'mala')).rejects.toMatchObject({ code: 'login_failed' });
    const p = await loginPassword('global', 'plain@x.cl', 'clave1'); expect(p.kind).toBe('token');
    expect(await cloudUsername('global', (p as any).token)).toMatchObject({ username: 'u_111', uid: '111' }); // token opaco → preference
    expect((await loginPassword('global', 'code@x.cl', 'clave2')).kind).toBe('code');
    await expect(loginWithCode('global', 'code@x.cl', '000000')).rejects.toMatchObject({ code: 'code_wrong' });
    const c = await loginWithCode('global', 'code@x.cl', '246810');
    expect(await cloudUsername('global', c.token)).toMatchObject({ username: 'u_222', name: 'Code' }); // JWT
    expect(tokenExpiry(c.token, c.expiresIn)!.getTime()).toBeGreaterThan(Date.now() + 80 * 86_400_000);
    const t = await loginPassword('global', 'tfa@x.cl', 'clave3'); expect(t.kind).toBe('tfa');
    await expect(loginWithTfa('global', (t as any).tfaKey, '111111')).rejects.toMatchObject({ code: 'tfa_wrong' });
    const tt = await loginWithTfa('global', (t as any).tfaKey, '135790');
    expect((await cloudUsername('global', tt.token)).username).toBe('u_333');
  });

  it('impresoras de la cuenta (con código LAN) y miniatura del trabajo', async () => {
    const { token } = await loginWithCode('global', 'code@x.cl', '246810');
    const ds = await cloudDevices('global', token);
    expect(ds).toHaveLength(2);
    expect(ds.find((d) => d.serial === '01P00A391800123')).toMatchObject({ online: true, model: 'C12', accessCode: '12345678' });
    expect(ds.find((d) => d.serial === '03900A3B2200456')?.online).toBe(false);
    const tasks = await cloudTasks('global', token, '01P00A391800123');
    expect(tasks[0].cover).toMatch(/covers\/01P00A391800123\.png$/); expect(isAllowedCoverUrl(tasks[0].cover!)).toBe(true);
    expect(isAllowedCoverUrl('http://169.254.169.254/latest')).toBe(false);
    expect(isAllowedCoverUrl('https://bbl-us-public.oss-us-west-1.aliyuncs.com/x.png')).toBe(true);
    await expect(cloudDevices('global', 'token-falso')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('estado en vivo por MQTT de la nube, solo lectura', async () => {
    const { token } = await loginWithCode('global', 'code@x.cl', '246810');
    const ses = new CloudSession({ region: 'global', username: 'u_222', token });
    const d = ses.device('01P00A391800123');
    const st = await d.waitReady(10_000);
    expect(st).toMatchObject({ state: 'RUNNING', file: 'pieza.3mf' }); expect(st.ams[0].trays[0].type).toBe('PLA');
    expect(() => d.pause()).toThrow(/no permite controlar/);
    // un comando de control publicado igual es rechazado por la nube y la impresora sigue imprimiendo
    ses.publish('01P00A391800123', { print: { command: 'stop', param: '' } });
    await new Promise((r) => setTimeout(r, 1200));
    expect(cloud.rejected.some((x) => x.m.print?.command === 'stop')).toBe(true); expect(p1s.state.gcode_state).toBe('RUNNING');
    // token expirado: la sesión avisa con código auth
    const err = new Promise<any>((res) => ses.on('session-error', res));
    cloud.expireAll();
    expect((await err).code).toBe('auth'); expect(d.online).toBe(false);
    ses.close();
  }, 30_000);

  it('verifica el certificado del broker (sin la CA correcta no conecta)', async () => {
    const { token } = await loginPassword('global', 'plain@x.cl', 'clave1') as any;
    const prev = process.env.BAMBU_CLOUD_CA_FILE; process.env.BAMBU_CLOUD_CA_FILE = '/no/existe.pem';
    const ses = new CloudSession({ region: 'global', username: 'u_111', token });
    const err = new Promise<any>((res) => ses.on('session-error', res)); ses.device('01P00A391800123');
    expect(String((await err).message)).toMatch(/certificate|self.signed|verify/i);
    ses.close(); process.env.BAMBU_CLOUD_CA_FILE = prev;
  }, 20_000);
});
