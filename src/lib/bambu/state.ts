/**
 * Normaliza el informe MQTT (`device/<serie>/report`) a un estado tipado. La familia P1/A1 envía solo
 * los campos que cambian, así que el informe crudo se fusiona en profundidad antes de normalizar.
 */
import type { MessageKey } from '@/i18n/translate';
export type PrintState = 'IDLE' | 'PREPARE' | 'RUNNING' | 'PAUSE' | 'FINISH' | 'FAILED' | 'SLICING' | 'OFFLINE' | 'UNKNOWN';
export const STATE_LABEL: Record<PrintState, MessageKey> = { IDLE: 'machines.state.IDLE', PREPARE: 'machines.state.PREPARE', RUNNING: 'machines.state.RUNNING', PAUSE: 'machines.state.PAUSE', FINISH: 'machines.state.FINISH', FAILED: 'machines.state.FAILED', SLICING: 'machines.state.SLICING', OFFLINE: 'machines.state.OFFLINE', UNKNOWN: 'machines.state.UNKNOWN' };
export const SPEED_LABEL: Record<number, MessageKey> = { 1: 'machines.speedMode.1', 2: 'machines.speedMode.2', 3: 'machines.speedMode.3', 4: 'machines.speedMode.4' };

/** Etapas (stg_cur / mc_print_stage) más comunes. */
/** Claves de mensaje de cada etapa conocida; el resto se muestra como «Etapa N». */
const STAGE_KEYS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25]);

export interface Tray { slot: string; ams: number; index: number; type: string | null; brand: string | null; color: string | null; remain: number | null; tempMin: number | null; tempMax: number | null; uuid: string | null; active: boolean; empty: boolean }
export interface AmsUnit { id: number; humidity: number | null; temp: number | null; trays: Tray[] }
export interface HmsItem { code: string; severity: 'fatal' | 'serio' | 'común' | 'info'; url: string }
export interface PrinterStatus {
  state: PrintState; stateLabel: MessageKey; stage: string | null;
  progress: number | null; remainingMin: number | null; layer: number | null; totalLayers: number | null;
  file: string | null; task: string | null;
  nozzle: { temp: number | null; target: number | null; diameter: string | null }; bed: { temp: number | null; target: number | null }; chamber: number | null;
  fans: { part: number | null; aux: number | null; chamber: number | null };
  speed: { level: number | null; label: MessageKey | null };
  light: 'on' | 'off' | 'flashing' | null;
  ams: AmsUnit[]; external: Tray | null; trayNow: string | null;
  errorCode: string | null; hms: HmsItem[];
  wifi: string | null; firmware: string | null; updatedAt: number;
}

export function deepMerge<T extends Record<string, any>>(a: T, b: Record<string, any>): T {
  const out: Record<string, any> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? deepMerge(out[k], v) : v;
  return out as T;
}

const n = (v: unknown): number | null => { const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(x) ? x : null; };
const fan = (v: unknown) => { const x = n(v); return x == null ? null : Math.round((x / 15) * 100); };
const hex4 = (x: number) => (x & 0xffff).toString(16).toUpperCase().padStart(4, '0');

/** Código HMS de 16 dígitos (AAAA_BBBB_CCCC_DDDD) y su severidad. */
export function hmsCode(attr: number, code: number): HmsItem {
  const c = `${hex4(attr >>> 16)}_${hex4(attr)}_${hex4(code >>> 16)}_${hex4(code)}`;
  const sev = (code >>> 16) & 0xffff;
  return { code: c, severity: sev === 1 ? 'fatal' : sev === 2 ? 'serio' : sev === 3 ? 'común' : 'info', url: `https://wiki.bambulab.com/en/search?q=${c.replace(/_/g, '')}` };
}

function colorOf(c: unknown): string | null {
  if (typeof c !== 'string' || c.length < 6) return null;
  const rgb = c.slice(0, 6); const a = c.length >= 8 ? parseInt(c.slice(6, 8), 16) : 255;
  return a === 0 ? null : `#${rgb.toLowerCase()}`;
}
function tray(tt: any, ams: number, trayNow: string | null): Tray {
  const index = Number(tt?.id ?? 0); const slot = ams === 255 ? '254' : String(ams * 4 + index);
  const type = tt?.tray_type || null; const remain = n(tt?.remain);
  return { slot, ams, index, type, brand: tt?.tray_sub_brands || null, color: colorOf(tt?.tray_color), remain: remain != null && remain >= 0 ? remain : null, tempMin: n(tt?.nozzle_temp_min), tempMax: n(tt?.nozzle_temp_max), uuid: tt?.tray_uuid && !/^0+$/.test(tt.tray_uuid) ? tt.tray_uuid : null, active: trayNow === slot, empty: !type };
}

export function normalize(raw: Record<string, any> | null | undefined, online = true): PrinterStatus {
  const p = raw?.print ?? {};
  const st = String(p.gcode_state ?? '').toUpperCase();
  const state: PrintState = !online ? 'OFFLINE' : (['IDLE', 'PREPARE', 'RUNNING', 'PAUSE', 'FINISH', 'FAILED', 'SLICING'].includes(st) ? st : st ? 'UNKNOWN' : 'UNKNOWN') as PrintState;
  const trayNow = p.ams?.tray_now != null ? String(p.ams.tray_now) : null;
  const ams: AmsUnit[] = Array.isArray(p.ams?.ams) ? p.ams.ams.map((u: any) => ({ id: Number(u.id ?? 0), humidity: n(u.humidity), temp: n(u.temp), trays: (Array.isArray(u.tray) ? u.tray : []).map((tt: any) => tray(tt, Number(u.id ?? 0), trayNow)) })) : [];
  const ext = p.vt_tray ? tray({ ...p.vt_tray, id: 0 }, 255, trayNow) : null;
  const stage = n(p.stg_cur);
  const err = n(p.print_error);
  const light = Array.isArray(p.lights_report) ? (p.lights_report.find((l: any) => l.node === 'chamber_light')?.mode ?? null) : null;
  const lvl = n(p.spd_lvl);
  return {
    state, stateLabel: STATE_LABEL[state],
    stage: stage != null && stage > 0 && stage !== 255 ? (STAGE_KEYS.has(stage) ? `machines.stage.${stage}` : `stage:${stage}`) : null,
    progress: n(p.mc_percent), remainingMin: n(p.mc_remaining_time), layer: n(p.layer_num), totalLayers: n(p.total_layer_num),
    file: p.gcode_file || null, task: p.subtask_name || null,
    nozzle: { temp: n(p.nozzle_temper), target: n(p.nozzle_target_temper), diameter: p.nozzle_diameter ?? null },
    bed: { temp: n(p.bed_temper), target: n(p.bed_target_temper) }, chamber: n(p.chamber_temper),
    fans: { part: fan(p.cooling_fan_speed), aux: fan(p.big_fan1_speed), chamber: fan(p.big_fan2_speed) },
    speed: { level: lvl, label: lvl != null ? SPEED_LABEL[lvl] ?? null : null },
    light: light as PrinterStatus['light'],
    ams, external: ext, trayNow: trayNow === '255' ? null : trayNow,
    errorCode: err ? err.toString(16).toUpperCase().padStart(8, '0').replace(/(.{4})(.{4})/, '$1_$2') : null,
    hms: Array.isArray(p.hms) ? p.hms.map((h: any) => hmsCode(Number(h.attr ?? 0), Number(h.code ?? 0))) : [],
    wifi: p.wifi_signal ?? null, firmware: raw?.info?.module?.find?.((m: any) => m.name === 'ota')?.sw_ver ?? null, updatedAt: Date.now(),
  };
}
