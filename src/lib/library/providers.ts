/**
 * Sitios desde los que se puede importar un modelo por enlace. Es un registro: para soportar otro sitio basta con
 * marcarlo `supported: true` aquí y agregar su conector (inspección y descarga). Sin dependencias de servidor, así que
 * el navegador lo usa para avisar mientras se escribe el enlace y el servidor para rechazar lo no compatible.
 */
export interface ImportProvider { id: string; label: string; /** dominios (con sus subdominios) */ hosts: string[]; supported: boolean }

export const IMPORT_PROVIDERS: ImportProvider[] = [
  { id: 'makerworld', label: 'MakerWorld', hosts: ['makerworld.com'], supported: true },
  { id: 'printables', label: 'Printables', hosts: ['printables.com'], supported: false },
  { id: 'thingiverse', label: 'Thingiverse', hosts: ['thingiverse.com'], supported: false },
  { id: 'thangs', label: 'Thangs', hosts: ['thangs.com'], supported: false },
  { id: 'cults3d', label: 'Cults', hosts: ['cults3d.com'], supported: false },
  { id: 'myminifactory', label: 'MyMiniFactory', hosts: ['myminifactory.com'], supported: false },
  { id: 'cgtrader', label: 'CGTrader', hosts: ['cgtrader.com'], supported: false },
  { id: 'grabcad', label: 'GrabCAD', hosts: ['grabcad.com'], supported: false },
];

export interface DetectedProvider { id: string; label: string; supported: boolean; /** false: el sitio no está en el registro */ known: boolean; host: string }

/** Detecta el sitio de un enlace. Devuelve null si no es una URL http(s). */
export function detectImportProvider(input: string): DetectedProvider | null {
  let u: URL; try { u = new URL(input.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const p = IMPORT_PROVIDERS.find((x) => x.hosts.some((h) => host === h || host.endsWith('.' + h)));
  return p ? { id: p.id, label: p.label, supported: p.supported, known: true, host } : { id: 'unknown', label: host, supported: false, known: false, host };
}

export const supportedProviders = () => IMPORT_PROVIDERS.filter((p) => p.supported);

/** Texto para el usuario cuando el sitio no se puede importar. */
export function unsupportedMessage(d: DetectedProvider): string {
  const names = supportedProviders().map((p) => p.label).join(', ');
  return d.known
    ? `${d.label} todavía no es compatible con la importación. Por ahora solo se puede importar desde: ${names}.`
    : `No reconocemos el sitio ${d.host}. Por ahora solo se puede importar desde: ${names}.`;
}

/** Lanza un error legible si el enlace no es de un sitio compatible. */
export function assertSupportedProvider(url: string): DetectedProvider {
  const d = detectImportProvider(url);
  if (!d) throw new Error('El enlace no es válido.');
  if (!d.supported) throw new Error(unsupportedMessage(d));
  return d;
}
