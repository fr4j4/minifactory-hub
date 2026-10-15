import type { ParamDef, ParamKind, ParamType } from './params';

/**
 * Generador del esquema ampliado de parámetros a partir del código fuente de OrcaSlicer (PrintConfig.cpp y Preset.cpp).
 * OrcaSlicer es AGPL-3.0: este texto NO se versiona; `npm run orca:install` lo genera en el directorio de datos de cada instalación.
 */
export interface RawOption { key: string; coType: string; label?: string; tooltip?: string; sidetext?: string; min?: number; max?: number; enums?: string[]; category?: string }

const STR = /L\(\s*(?:u8)?"((?:[^"\\]|\\.)*)"/;
const unescape = (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
const SIDETEXT: Record<string, string> = { '℃': '°C' };

/** Lee cada `def = this->add("clave", coTipo); def->label = L("…"); …` de PrintConfig.cpp. */
export function parsePrintConfig(cpp: string): RawOption[] {
  const out: RawOption[] = []; const parts = cpp.split(/\bdef\s*=\s*this->add(?:_nullable)?\(\s*"/).slice(1);
  for (const part of parts) {
    const head = /^([A-Za-z0-9_]+)"\s*,\s*(co[A-Za-z]+)/.exec(part); if (!head) continue;
    const block = part.split(/\n\s*\n/)[0]; // hasta la línea en blanco que separa opciones
    const grab = (name: string) => { const m = new RegExp(`def->${name}\\s*=\\s*([^;]+);`).exec(block); if (!m) return undefined; const s = STR.exec(m[1]); return s ? unescape(s[1]) : undefined; };
    const num = (name: string) => { const m = new RegExp(`def->${name}\\s*=\\s*(-?[0-9.]+)\\s*;`).exec(block); return m ? Number(m[1]) : undefined; };
    const enums = [...block.matchAll(/def->enum_values\.push_back\("([^"]+)"\)/g)].map((m) => m[1]);
    const side = grab('sidetext');
    out.push({ key: head[1], coType: head[2], label: grab('label') ?? grab('full_label'), tooltip: grab('tooltip'), sidetext: side ? (SIDETEXT[side] ?? side) : undefined, min: num('min'), max: num('max'), enums: enums.length ? enums : undefined, category: grab('category') });
  }
  return out;
}

/** Claves de proceso, filamento e impresora según Preset.cpp (listas `s_Preset_*_options`). */
export function parsePresetLists(cpp: string): Record<ParamType, Set<string>> {
  const list = (name: string) => { const m = new RegExp(`${name}\\s*\\{([\\s\\S]*?)\\};`).exec(cpp); return new Set([...(m?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/"([A-Za-z0-9_]+)"/g)].map((x) => x[1])); };
  const machine = new Set([...list('s_Preset_printer_options'), ...list('s_Preset_machine_limits_options')]);
  return { process: list('s_Preset_print_options'), filament: list('s_Preset_filament_options'), machine };
}

const KIND: Record<string, ParamKind | null> = { coFloat: 'number', coFloats: 'number', coFloatOrPercent: 'number', coFloatsOrPercents: 'number', coInt: 'int', coInts: 'int', coPercent: 'percent', coPercents: 'percent', coBool: 'bool', coBools: 'bool', coEnum: 'select', coEnums: 'select' };

/** Entradas del esquema para las claves que el esquema curado no cubre. Los textos son los de OrcaSlicer (en inglés). */
export function buildExtraParams(opts: RawOption[], lists: Record<ParamType, Set<string>>, curated: Set<string>): ParamDef[] {
  const out: ParamDef[] = []; const seen = new Set<string>();
  for (const o of opts) {
    const kind = KIND[o.coType]; if (!kind || !o.label) continue;
    for (const type of ['process', 'filament', 'machine'] as const) {
      const id = `${type}:${o.key}`; if (!lists[type].has(o.key) || curated.has(id) || seen.has(id)) continue; seen.add(id);
      const text = { label: o.label, tip: o.tooltip ?? '' };
      out.push({ key: o.key, type, page: 'extra', group: o.category ? o.category.toLowerCase() : 'other', kind, mode: 'expert', unit: o.sidetext, min: o.min, max: o.max, options: kind === 'select' ? o.enums : undefined, es: text, en: text });
    }
  }
  return out;
}
