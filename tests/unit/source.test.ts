import { describe, expect, it } from 'vitest';
import { fetchSourceMeta, isPrivateIp, normalizeLicense, parseMakerworldDesign, parseOpenGraph, parseSourceUrl, safeGet } from '@/lib/library/source';

describe('origen del modelo (N3)', () => {
  it('reconoce el sitio y el id', () => {
    expect(parseSourceUrl('https://makerworld.com/es/models/123456-soporte-celular?from=x')).toEqual({ provider: 'makerworld', externalId: '123456', url: 'https://makerworld.com/models/123456' });
    expect(parseSourceUrl('https://makerworld.com/es/models/3317662-pumpkin-patch-pal?from=recommend#profileId-3766961')).toEqual({ provider: 'makerworld', externalId: '3317662', url: 'https://makerworld.com/models/3317662#profileId-3766961' });
    expect(parseSourceUrl('https://www.printables.com/model/987-llavero')).toMatchObject({ provider: 'printables', externalId: '987' });
    expect(parseSourceUrl('https://www.thingiverse.com/thing:555')).toMatchObject({ provider: 'thingiverse', externalId: '555' });
    expect(parseSourceUrl('https://ejemplo.cl/pieza')).toMatchObject({ provider: 'otro', externalId: null });
    expect(parseSourceUrl('javascript:alert(1)')).toBeNull(); expect(parseSourceUrl('ftp://x/y')).toBeNull(); expect(parseSourceUrl('hola')).toBeNull();
  });
  it('normaliza licencias y uso comercial', () => {
    expect(normalizeLicense('CC BY-NC-SA 4.0')).toEqual({ code: 'cc-by-nc-sa', commercial: 'no' });
    expect(normalizeLicense('Creative Commons - Attribution')).toEqual({ code: 'cc-by', commercial: 'si' });
    expect(normalizeLicense('CC0')).toEqual({ code: 'cc0', commercial: 'si' });
    expect(normalizeLicense('CC BY-ND')).toEqual({ code: 'cc-by-nd', commercial: 'si' });
    expect(normalizeLicense('Commercial License Membership')).toEqual({ code: 'makerworld-comercial', commercial: 'requiere_membresia' });
    expect(normalizeLicense(undefined)).toEqual({ code: 'desconocida', commercial: 'desconocido' });
  });
  it('anti-SSRF: bloquea direcciones privadas, también tras una redirección', async () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:172.16.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '224.0.0.1']) expect(isPrivateIp(ip)).toBe(true);
    expect(isPrivateIp('::ffff:808:808')).toBe(false); // 8.8.8.8 mapeada
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    await expect(safeGet('http://localhost/x', { resolve: async () => ['127.0.0.1'] })).rejects.toThrow('no permitida');
    await expect(safeGet('file:///etc/passwd')).rejects.toThrow();
    const calls: string[] = [];
    const fetcher = async (u: string) => { calls.push(u); return u.includes('publico') ? { status: 302, headers: { get: () => 'http://interno.local/secreto' }, text: async () => '' } : { status: 200, headers: { get: () => 'text/html' }, text: async () => 'ok' }; };
    const resolve = async (h: string) => (h === 'publico.test' ? ['93.184.216.34'] : ['10.0.0.8']);
    await expect(safeGet('http://publico.test/a', { fetcher, resolve })).rejects.toThrow('no permitida'); expect(calls).toEqual(['http://publico.test/a']);
  });
  it('lee OpenGraph y JSON-LD', () => {
    const html = `<html><head><title>x</title><meta property="og:title" content="Soporte &amp; base"><meta content="Un soporte" property="og:description"><meta property="og:image" content="https://cdn.x/i.jpg"><meta name="keywords" content="soporte, celular"><script type="application/ld+json">{"license":"https://creativecommons.org/licenses/by-nc/4.0/","author":{"name":"Ana"}}</script></head></html>`;
    const m = parseOpenGraph(html);
    expect(m).toMatchObject({ title: 'Soporte & base', description: 'Un soporte', authorName: 'Ana', status: 'ok', tags: ['soporte', 'celular'] }); expect(m.imageUrls).toEqual(['https://cdn.x/i.jpg']);
    expect(normalizeLicense(m.licenseText).code).toBe('cc-by-nc');
    expect(parseOpenGraph('<html></html>').status).toBe('error');
  });
  it('lee la respuesta (supuesta) de MakerWorld con campos faltantes sin romper', () => {
    const m = parseMakerworldDesign({ id: 1, title: 'Barco', designCreator: { name: 'Pepe', uid: 77 }, tags: ['boat', { name: 'toy' }], likeCount: 10, downloadCount: 200, instances: [{ id: 5, plates: [{ name: 'Placa 1', prediction: 3600, weight: 12.5, filaments: [{ type: 'PLA' }] }] }], cover: 'https://cdn/c.jpg', extra: { desconocido: true } });
    expect(m).toMatchObject({ title: 'Barco', authorName: 'Pepe', authorUid: '77', tags: ['boat', 'toy'], stats: { likes: 10, downloads: 200 }, status: 'ok' });
    expect(m.plates[0]).toEqual({ name: 'Placa 1', printTimeS: 3600, weightG: 12.5, filaments: ['PLA'] });
    expect(parseMakerworldDesign(null).status).toBe('error'); expect(parseMakerworldDesign({}).status).toBe('error');
  });
  it('MakerWorld: si la API falla (403/Cloudflare) cae a la página; si todo falla devuelve error sin lanzar', async () => {
    const p = parseSourceUrl('https://makerworld.com/models/42')!;
    const getter = (async (u: string) => u.includes('/api') || u.includes('bambulab') ? { status: 403, body: '', finalUrl: u, contentType: 'text/html' } : { status: 200, body: '<meta property="og:title" content="Modelo 42"><meta property="og:image" content="https://i/x.jpg">', finalUrl: u, contentType: 'text/html' }) as typeof safeGet;
    expect(await fetchSourceMeta(p, getter)).toMatchObject({ title: 'Modelo 42', status: 'parcial' });
    const dead = (async () => { throw new Error('red'); }) as unknown as typeof safeGet;
    expect((await fetchSourceMeta(p, dead)).status).toBe('error');
  });
});
