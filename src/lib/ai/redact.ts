/**
 * Alias de datos personales: reemplaza correos, teléfonos, RUT y nombres conocidos por marcadores estables
 * (`[correo-1]`, `Cliente A`) antes de enviar texto a un proveedor, y los restituye al mostrar la respuesta.
 */
export interface Redactor {
  redact(text: string): string;
  restore(text: string): string;
  /** Registra nombres conocidos (clientes) que el patrón por sí solo no detecta. */
  addNames(names: string[]): void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PATTERNS: Array<[string, RegExp]> = [
  ['correo', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ['rut', /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g],
  ['telefono', /(?<![\w])\+?\d[\d\s().-]{7,}\d(?![\w])/g],
];

export function createRedactor(enabled = true): Redactor {
  const toAlias = new Map<string, string>(); const toOrig = new Map<string, string>(); const names = new Set<string>();
  const counters: Record<string, number> = {};
  const alias = (kind: string, orig: string) => {
    const key = `${kind}:${orig.toLowerCase()}`; const hit = toAlias.get(key); if (hit) return hit;
    const n = (counters[kind] = (counters[kind] ?? 0) + 1);
    const a = kind === 'nombre' ? `Cliente ${LETTERS[(n - 1) % 26]}${n > 26 ? Math.ceil(n / 26) : ''}` : `[${kind}-${n}]`;
    toAlias.set(key, a); toOrig.set(a, orig); return a;
  };
  return {
    addNames(list) { for (const n of list) if (n && n.trim().length >= 3) names.add(n.trim()); },
    redact(text) {
      if (!enabled) return text;
      let out = text;
      for (const n of [...names].sort((a, b) => b.length - a.length)) out = out.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), () => alias('nombre', n));
      for (const [kind, re] of PATTERNS) out = out.replace(re, (m) => alias(kind, m));
      return out;
    },
    restore(text) {
      if (!enabled || !toOrig.size) return text;
      let out = text;
      for (const [a, o] of [...toOrig].sort((x, y) => y[0].length - x[0].length)) out = out.split(a).join(o);
      return out;
    },
  };
}
