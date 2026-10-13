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

export function errorText(e: unknown, t: TFn): string {
  if (e instanceof LocalizedError) return t(e.key, e.params);
  return (e as Error)?.message || t('common.unexpectedError');
}
