import { describe, expect, it } from 'vitest';
import { DICTIONARIES, createT } from '@/i18n/translate';
import { DEFAULT_CALC_PROFILES, DEFAULT_COMPLEXITY_TAGS, profileDesc, profileName, tagName } from '@/lib/calc-presets';

/** Claves de `calc.*` que la interfaz arma dinámicamente (el compilador no las revisa). */
const FAMILIES: Record<string, string[]> = {
  'cfg.basis_': ['promedio', 'reposicion', 'max'], 'cfg.case_': ['small', 'medium', 'series'], 'cfg.mode_': ['estandar', 'avanzado', 'margen', 'recargo'],
  'cfg.tab_': ['base', 'fixed', 'time', 'risk', 'profiles', 'refs', 'history'],
  'coh.': ['marginBelowMin', 'volumeBelowMin', 'laborZero', 'kwhZero', 'fixedZeroWithIncome', 'rateBelowBreakEven'],
  'param.': ['marginPct', 'minMarginPct', 'marginMode', 'laborHour', 'prepMinutes', 'supervisionMinPerHour', 'postMinutes', 'wastePct', 'failRatePct', 'volumeMinMarginPct', 'minPrice', 'floors_perGram', 'floors_perOrder', 'payFeePct', 'channelFeePct', 'packPerUnit', 'setupHoursPerPlate', 'powerFactor', 'costBasis', 'useTimeFactor'],
  'preset.': ['hobby', 'taller', 'produccion'], 'wiz.': ['purchaseValue', 'residualValue', 'lifeHours', 'watts', 's_shop', 's_costs', 's_time', 's_assets', 's_margin', 's_done', 'h_shop', 'h_costs', 'h_time', 'h_assets', 'h_margin', 'h_done'],
  'guide.': [1, 2, 3, 4, 5].flatMap((n) => [`s${n}t`, `s${n}d`]), 'exp.sens_': ['materialUp10', 'materialDown10', 'timeUp20', 'timeDown20', 'failUp5', 'failDown5'], 'exp.verdict_': ['ok', 'bajoMinimo', 'bajoCosto', 'bajoPisoHora'],
  'cost.': ['material', 'machine', 'energy', 'overhead', 'prep', 'supervision', 'post', 'design', 'packaging', 'failure'], 'ovr.': ['margin', 'waste', 'fail', 'labor', 'supervision', 'payFee'],
  'est.': ['hueca', 'normal', 'maciza', 'length', 'width', 'height'], 'check.': ['machine', 'material', 'labor', 'fixed', 'income', 'times', 'profile'], 'status.': ['lista', 'casi', 'incompleta'],
  'weight.': ['auto', 'autoDesc', 'semi', 'semiDesc', 'manual', 'manualDesc', 'estimate', 'estimateDesc'], 'rule.': ['margin', 'floorHour', 'floorGram', 'floorLine', 'volumeLimited'],
  'warn.': ['noMachine', 'machineNoPurchase', 'machineNoPower', 'materialNoCost', 'noLabor', 'noFixedCosts', 'timeUncalibrated', 'belowBenchmark'],
  'level.': ['basico', 'detallado', 'experto', 'basicoDesc', 'detalladoDesc', 'expertoDesc'], 'conf.': ['alta', 'media', 'baja'], 'band.': ['floor', 'recommended', 'high'], 'cal.': ['grams', 'hours', 'price'],
  'tag.': DEFAULT_COMPLEXITY_TAGS.map((x) => x.key),
};
describe('textos de la calculadora', () => {
  for (const loc of ['es', 'en'] as const) {
    it(`${loc}: existen las claves dinámicas y los perfiles de fábrica`, () => {
      const t = createT(loc); const missing: string[] = [];
      const has = (k: string) => { const r = t(k as never); return r !== k; };
      for (const [prefix, keys] of Object.entries(FAMILIES)) for (const k of keys) if (!has(`calc.${prefix}${k}`)) missing.push(`calc.${prefix}${k}`);
      for (const p of DEFAULT_CALC_PROFILES) for (const s of ['name', 'desc']) if (!has(`calc.profile.${p.id}.${s}`)) missing.push(`calc.profile.${p.id}.${s}`);
      expect(missing).toEqual([]);
    });
  }
  it('los perfiles y etiquetas de fábrica se traducen, y los renombrados conservan su nombre', () => {
    const en = createT('en');
    expect(profileName(en, DEFAULT_CALC_PROFILES[0])).toBe('Standard');
    expect(profileName(en, { id: 'std', name: 'Mi estándar' })).toBe('Mi estándar');
    expect(profileDesc(en, DEFAULT_CALC_PROFILES[0])).toBe('Normal custom work.');
    expect(tagName(en, DEFAULT_COMPLEXITY_TAGS[0])).toBe('Heavy supports');
    expect(tagName(en, { key: 'supports', label: 'Otro' })).toBe('Otro');
    expect(DICTIONARIES.es).toBeTruthy();
  });
});
