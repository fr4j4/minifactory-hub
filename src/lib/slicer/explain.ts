import type { MessageKey, Params } from '@/i18n/translate';
import type { SliceErrorCode } from './run';

export interface Hint { key: MessageKey; params?: Params }
type V3 = [number, number, number];

const PERMS: Array<[number, number, number]> = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const fmt = (d: V3) => d.map((n) => Math.round(n * 10) / 10).join(' × ');

/** Mejor orientación (permutación de ejes) y escala máxima con que la pieza cabe en el volumen. */
export function bestFit(dim: V3, vol: V3) {
  let best = { perm: PERMS[0], scale: 0 };
  for (const p of PERMS) {
    const d = p.map((i) => dim[i]) as V3;
    const scale = Math.min(...d.map((x, i) => (x > 0 ? vol[i] / x : Infinity)));
    if (scale > best.scale) best = { perm: p, scale };
  }
  const rotated = best.perm.map((i) => dim[i]) as V3;
  return { fits: best.scale >= 1 - 1e-6, scale: best.scale, rotated, identity: best.perm.join('') === '012' };
}

/** Acciones concretas para un error de laminado, sin IA (reglas sobre el código del error y las medidas). */
export function explainSliceError(o: { code: SliceErrorCode | string | null; dims?: V3 | null; volume?: V3 | null; copies?: number }): Hint[] {
  const hints: Hint[] = [];
  switch (o.code) {
    case 'no_fit': {
      if (o.dims && o.volume) {
        hints.push({ key: 'advisor.explain.sizes', params: { part: fmt(o.dims), bed: fmt(o.volume) } });
        const one = bestFit(o.dims, o.volume);
        if ((o.copies ?? 1) > 1 && one.fits) hints.push({ key: 'advisor.explain.fewerCopies', params: { n: o.copies ?? 1 } });
        else if (one.fits && !one.identity) hints.push({ key: 'advisor.explain.rotate', params: { rotated: fmt(one.rotated) } });
        else if (!one.fits) {
          const pct = Math.floor(one.scale * 100);
          hints.push({ key: 'advisor.explain.scale', params: { pct } });
          if (one.scale < 0.6) hints.push({ key: 'advisor.explain.split' });
          hints.push({ key: 'advisor.explain.biggerMachine' });
        } else hints.push({ key: 'advisor.explain.checkEmpty' });
      } else { hints.push({ key: 'advisor.explain.noFitGeneric' }); }
      break;
    }
    case 'incompatible': hints.push({ key: 'advisor.explain.incompatible' }, { key: 'advisor.explain.pickProcessForMachine' }); break;
    case 'timeout': hints.push({ key: 'advisor.explain.timeout' }, { key: 'advisor.explain.timeoutCopies' }); break;
    case 'not_installed': hints.push({ key: 'advisor.explain.notInstalled' }); break;
    default: break;
  }
  return hints;
}
