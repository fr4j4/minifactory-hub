import { DEFAULT_LOCALE } from './config';
import { createT, type MessageKey, type Params, type TFn } from './translate';

/** Traductor del idioma por defecto, para código sin petición (conectores, trabajos en segundo plano, textos que se guardan en la base). */
export const tDefault: TFn = createT(DEFAULT_LOCALE);

/**
 * Error con mensaje traducible. Su `message` queda en el idioma por defecto (para registros y textos guardados);
 * quien lo muestra al usuario lo traduce con `errorText(e, t)` en el idioma de la petición.
 */
export class LocalizedError extends Error {
  constructor(public key: MessageKey, public params?: Params) {
    super(tDefault(key, params));
    this.name = 'LocalizedError';
  }
}

/** Índices únicos con un aviso propio; los demás muestran `common.duplicateValue`. */
const UNIQUE_MSG: Record<string, MessageKey> = { users_email_uq: 'common.duplicateEmail', suppliers_name_uq: 'common.duplicateName', tag_defs_name_uq: 'common.duplicateName', variants_sku_uq: 'common.duplicateSku' };

export function errorText(e: unknown, t: TFn): string {
  if (e instanceof LocalizedError) return t(e.key, e.params);
  // error de la base (DrizzleQueryError): su texto trae el SQL y sus parámetros (p. ej. el hash de una contraseña), nunca se muestra
  if (e && typeof e === 'object' && 'query' in e && 'params' in e) {
    const cause = (e as { cause?: { code?: string; constraint?: string } }).cause;
    if (cause?.code === '23505') return t(UNIQUE_MSG[cause.constraint ?? ''] ?? 'common.duplicateValue');
    console.error(e);
    return t('common.unexpectedError');
  }
  return (e as Error)?.message || t('common.unexpectedError');
}
