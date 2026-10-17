import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startSim, type SimHandle } from '../../scripts/bambu-sim';
import { BambuClient } from '@/lib/bambu/client';
import { snapshot, cameraAuthPacket } from '@/lib/bambu/camera';
import { listFiles, uploadFile } from '@/lib/bambu/ftps';
import { parseSsdp, scan } from '@/lib/bambu/discovery';
import { hmsCode, normalize } from '@/lib/bambu/state';
import { modelFromCode } from '@/lib/bambu/models';

const B = 23000;
let p1s: SimHandle; let a1: SimHandle;
beforeAll(async () => {
  process.env.BAMBU_SSDP_PORTS = String(B + 21);
  p1s = await startSim({ serial: '01P00A391800123', name: 'P1S Prueba', model: 'C12', accessCode: '12345678', mqttPort: B + 883, cameraPort: B + 600, ftpPort: B + 990, ssdpTargets: [`127.0.0.1:${B + 21}`],
    trays: [{ type: 'PLA', color: '#E8432E', brand: 'PLA Basic', remain: 62 }, null, { type: 'PETG', color: '#F2F2F2', brand: 'PETG HF', remain: 14 }, null], printing: { file: 'pieza.3mf', totalLayers: 100, minutes: 60, progress: 40 } });
  a1 = await startSim({ serial: '03000A3B2200456', name: 'A1 mini Prueba', model: 'N1', accessCode: '87654321', mqttPort: B + 1883, cameraPort: B + 1600, ftpPort: B + 1990, ssdpTargets: [`127.0.0.1:${B + 21}`],
    external: { type: 'PLA', color: '#2E7DDB', brand: 'PLA Basic', remain: -1 }, hms: [{ attr: 0x07002000, code: 0x00020001 }] });
}, 60_000);
afterAll(async () => { await p1s?.stop(); await a1?.stop(); });

describe('conector Bambu Lab (contra el simulador)', () => {
  it('modelos y códigos', () => {
    expect(modelFromCode('C12')?.name).toBe('P1S');
    expect(modelFromCode(null, '00M09C470300789')?.name).toBe('X1 Carbon');
    expect(modelFromCode('N1')?.camera).toBe('jpeg-tls');
    expect(hmsCode(0x07002000, 0x00020001)).toMatchObject({ code: '0700_2000_0002_0001', severity: 'serio' });
    const b = cameraAuthPacket('12345678'); expect(b.length).toBe(80); expect(b.readUInt32LE(0)).toBe(0x40); expect(b.subarray(48, 56).toString()).toBe('12345678');
  });

  it('interpreta un anuncio SSDP', () => {
    const f = parseSsdp('NOTIFY * HTTP/1.1\r\nLocation: 192.168.1.50\r\nNT: urn:bambulab-com:device:3dprinter:1\r\nUSN: 01P00A391800123\r\nDevModel.bambu.com: C12\r\nDevName.bambu.com: Taller\r\nDevConnect.bambu.com: lan\r\n\r\n', '10.0.0.1');
    expect(f).toMatchObject({ serial: '01P00A391800123', ip: '192.168.1.50', modelName: 'P1S', name: 'Taller', connect: 'lan' });
    expect(parseSsdp('NOTIFY * HTTP/1.1\r\nNT: upnp:rootdevice\r\nUSN: x\r\n\r\n', '1.1.1.1')).toBeNull();
  });

  it('detecta las impresoras de la red', async () => {
    const r = await scan(3500);
    expect(r.found.map((f) => f.serial).sort()).toEqual(['01P00A391800123', '03000A3B2200456']);
    expect(r.found.find((f) => f.serial === '03000A3B2200456')?.modelName).toBe('A1 mini');
  });

  it('rechaza un código de acceso incorrecto', async () => {
    const c = new BambuClient({ host: '127.0.0.1', serial: p1s.opts.serial, accessCode: '00000000', mqttPort: B + 883 }); c.connect();
    await expect(c.waitReady(8000)).rejects.toMatchObject({ code: 'auth' }); c.close();
  });

  it('estado completo, AMS, temperaturas y comandos', async () => {
    const c = new BambuClient({ host: '127.0.0.1', serial: p1s.opts.serial, accessCode: '12345678', mqttPort: B + 883 }); c.connect();
    let fp: string | null = null; c.on('fingerprint', (f) => { fp = f; });
    const s = await c.waitReady(8000);
    expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    expect(s).toMatchObject({ state: 'RUNNING', stateLabel: 'machines.state.RUNNING', totalLayers: 100, file: 'pieza.3mf' });
    expect(s.progress).toBeGreaterThanOrEqual(40);
    expect(s.ams[0].trays).toHaveLength(4);
    expect(s.ams[0].trays[0]).toMatchObject({ type: 'PLA', color: '#e8432e', active: true, slot: '0' }); expect(s.ams[0].trays[0].remain).toBeGreaterThan(55); expect(s.ams[0].trays[0].remain).toBeLessThanOrEqual(62);
    expect(s.ams[0].trays[1].empty).toBe(true);
    // el informe delta (P1) se fusiona sin perder el AMS
    await new Promise((r) => setTimeout(r, 1500)); expect(c.status.ams[0].trays[2].type).toBe('PETG'); expect(c.status.nozzle.temp).toBeGreaterThan(200);
    const wait = (pred: () => boolean) => new Promise<void>((res, rej) => { const t = setTimeout(() => rej(new Error('tiempo')), 6000); const h = () => { if (pred()) { clearTimeout(t); c.off('status', h); res(); } }; c.on('status', h); h(); });
    c.pause(); await wait(() => c.status.state === 'PAUSE'); expect(c.status.stage).toBe('machines.stage.16');
    c.resume(); await wait(() => c.status.state === 'RUNNING');
    c.speed(3); await wait(() => c.status.speed.label === 'machines.speedMode.3');
    c.light(false); await wait(() => c.status.light === 'off');
    expect(p1s.commands.some((m) => m.pushing?.command === 'pushall')).toBe(true);
    expect(c.status.firmware).toBe('01.08.02.00');
    c.close();
    // la huella queda fijada: con otra distinta se rechaza (certificado cambiado)
    // y el código de acceso no sale: la huella se revisa antes de CONNECT (MQTT), de PASS (FTPS) y del paquete de la cámara
    const before = p1s.auths.n;
    const evil = new BambuClient({ host: '127.0.0.1', serial: p1s.opts.serial, accessCode: '12345678', mqttPort: B + 883, fingerprint: 'AA:BB' }); evil.connect();
    await expect(evil.waitReady(8000)).rejects.toMatchObject({ code: 'cert_changed' }); evil.close();
    await expect(listFiles({ host: '127.0.0.1', accessCode: '12345678', port: B + 990, fingerprint: 'AA:BB' })).rejects.toMatchObject({ code: 'cert_changed' });
    await expect(snapshot({ host: '127.0.0.1', accessCode: '12345678', kind: 'jpeg-tls', port: B + 600, fingerprint: 'AA:BB' }, 4000)).rejects.toMatchObject({ code: 'cert_changed' });
    // RTSPS (X1/H2): la prueba TLS corta antes de lanzar ffmpeg con el código (el puerto TLS del simulador basta)
    await expect(snapshot({ host: '127.0.0.1', accessCode: '12345678', kind: 'rtsps', port: B + 600, fingerprint: 'AA:BB' }, 4000)).rejects.toMatchObject({ code: 'cert_changed' });
    expect(p1s.auths.n).toBe(before);
    expect((await listFiles({ host: '127.0.0.1', accessCode: '12345678', port: B + 990, fingerprint: fp })).length).toBeGreaterThanOrEqual(0); // con la huella correcta sí entra
  }, 30_000);

  it('bobina externa y avisos HMS (A1 mini)', async () => {
    const c = new BambuClient({ host: '127.0.0.1', serial: a1.opts.serial, accessCode: '87654321', mqttPort: B + 1883 }); c.connect();
    const s = await c.waitReady(8000);
    expect(s.state).toBe('IDLE'); expect(s.ams).toEqual([]);
    expect(s.external).toMatchObject({ type: 'PLA', color: '#2e7ddb', remain: null });
    expect(s.hms[0].code).toBe('0700_2000_0002_0001');
    c.close();
  });

  it('foto de la cámara (JPEG por TLS)', async () => {
    const jpg = await snapshot({ host: '127.0.0.1', accessCode: '12345678', kind: 'jpeg-tls', port: B + 600 });
    expect(jpg[0]).toBe(0xff); expect(jpg[1]).toBe(0xd8); expect(jpg.length).toBeGreaterThan(3000);
    await expect(snapshot({ host: '127.0.0.1', accessCode: 'malo', kind: 'jpeg-tls', port: B + 600 }, 4000)).rejects.toBeTruthy();
  }, 20_000);

  it('sube un 3MF por FTPS e inicia la impresión', async () => {
    await uploadFile({ host: '127.0.0.1', accessCode: '87654321', port: B + 1990 }, 'llavero.3mf', Buffer.from('PK\u0003\u0004 contenido de prueba'));
    expect((await listFiles({ host: '127.0.0.1', accessCode: '87654321', port: B + 1990 })).map((f) => f.name)).toContain('llavero.3mf');
    const c = new BambuClient({ host: '127.0.0.1', serial: a1.opts.serial, accessCode: '87654321', mqttPort: B + 1883 }); c.connect(); await c.waitReady(8000);
    c.startProject({ fileName: 'llavero.3mf', useAms: false });
    await new Promise<void>((res, rej) => { const t = setTimeout(() => rej(new Error('no partió')), 8000); c.on('status', (s) => { if (s.state === 'RUNNING' && s.file === 'llavero.3mf') { clearTimeout(t); res(); } }); });
    const cmd = a1.commands.find((m) => m.print?.command === 'project_file');
    expect(cmd.print).toMatchObject({ url: 'file:///sdcard/llavero.3mf', param: 'Metadata/plate_1.gcode', use_ams: false, subtask_name: 'llavero' });
    c.stop(); c.close();
  }, 30_000);

  it('normaliza un informe vacío sin romperse', () => { expect(normalize({}, false).state).toBe('OFFLINE'); expect(normalize(null).state).toBe('UNKNOWN'); });
});

describe('verificación del 3MF antes de enviarlo', async () => {
  const fs = await import('node:fs');
  const { zipSync, strToU8 } = await import('fflate');
  const { inspectSliced3mf } = await import('@/lib/services/printers');
  it('lee modelo, boquilla y material del 3MF de ejemplo', () => {
    expect(inspectSliced3mf(fs.readFileSync('samples/llavero-a1.3mf'))).toMatchObject({ printerModel: 'Bambu Lab A1', nozzle: '0.4', filamentType: 'PLA' });
  });
  it('encuentra la configuración al principio de un G-code grande (estilo Bambu) sin project_settings', () => {
    const g = '; HEADER_BLOCK_START\n; CONFIG_BLOCK_START\n; printer_model = Bambu Lab P1S\n; nozzle_diameter = 0.4\n; filament_type = PETG;PLA\n; CONFIG_BLOCK_END\n' + 'G1 X1 Y1 E0.1\n'.repeat(400_000);
    const z = Buffer.from(zipSync({ 'Metadata/plate_1.gcode': strToU8(g) }));
    expect(inspectSliced3mf(z)).toMatchObject({ printerModel: 'Bambu Lab P1S', nozzle: '0.4', filamentType: 'PETG' });
  });
  it('si no hay modelo, lo informa como desconocido (el envío se rechaza)', () => {
    const z = Buffer.from(zipSync({ 'Metadata/plate_1.gcode': strToU8('G28\nG1 X10\n') }));
    expect(inspectSliced3mf(z).printerModel).toBeNull();
  });
});
