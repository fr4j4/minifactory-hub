/**
 * Etiquetas de la biblioteca (N2): normalización, sugerencias por reglas (siempre disponibles) y fusión con el vocabulario existente.
 * La IA (opcional) solo aporta candidatos; esta capa los valida igual que a los de reglas.
 */
export type TagSource = 'manual' | 'ia' | 'import' | 'regla';
export interface TagCandidate { name: string; confidence: number; source: TagSource; via?: 'nombre' | 'forma' | 'url' | 'metadatos' }

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'para', 'con', 'sin', 'en', 'por', 'the', 'a', 'an', 'and', 'or', 'of', 'for', 'with', 'v1', 'v2', 'v3', 'final', 'copia', 'copy', 'stl', 'model', 'modelo', 'print', 'part', 'pieza', 'fixed', 'new', 'nuevo', 'obj', 'mf', 'x']);
const BANNED = new Set(['porn', 'nsfw', 'xxx', 'sex', 'gun', 'weapon']);
export const MAX_TAGS = 8;

/** minúsculas, sin tildes, solo letras/números/guion, plural simple → singular, tope 30 caracteres. */
export function normalizeTag(raw: string): string {
  let t = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (t.length > 4 && !t.includes(' ')) {
    if (/(ces)$/.test(t)) t = t.slice(0, -3) + 'z';
    else if (/(es)$/.test(t) && /(or|ador|on|ion|er|l|n|r|d)es$/.test(t)) t = t.slice(0, -2);
    else if (/s$/.test(t) && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1);
  }
  return t.replace(/^-+|-+$/g, '');
}

/** Palabras útiles del nombre de archivo: «llavero_corazon-v2.stl» → [llavero, corazon]. */
export function tokensFromName(name: string): string[] {
  const base = name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return base.split(/[^A-Za-zÀ-ÿ0-9]+/).map((w) => w.trim()).filter((w) => w.length >= 3 && !/^\d/.test(w) && !STOP.has(w.toLowerCase()));
}

export interface GeomInfo { dimX?: number | null; dimY?: number | null; dimZ?: number | null; volumeCm3?: number | null; closed?: boolean | null }
/** Etiquetas por forma, sin IA: placa plana, pieza alta y delgada, muy pequeña/grande. */
export function geometryTags(g: GeomInfo): TagCandidate[] {
  const out: TagCandidate[] = []; const { dimX: x, dimY: y, dimZ: z } = g; if (!x || !y || !z) return out;
  const maxXY = Math.max(x, y);
  if (z < 4 && maxXY > 20) out.push({ name: 'plano', confidence: 0.6, source: 'regla', via: 'forma' });
  if (z > maxXY * 3) out.push({ name: 'alto', confidence: 0.5, source: 'regla', via: 'forma' });
  if (Math.max(x, y, z) < 25) out.push({ name: 'pequeno', confidence: 0.6, source: 'regla', via: 'forma' });
  if (Math.max(x, y, z) > 150) out.push({ name: 'grande', confidence: 0.6, source: 'regla', via: 'forma' });
  return out;
}

export interface TagInput { name: string; folder?: string | null; origin?: string | null; sourceTags?: string[]; geom?: GeomInfo }
/** Candidatos de reglas: nombre, carpeta, etiquetas del sitio de origen y forma. */
export function ruleCandidates(i: TagInput): TagCandidate[] {
  const out: TagCandidate[] = tokensFromName(i.name).map((w) => ({ name: w, confidence: 0.55, source: 'regla' as const, via: 'nombre' as const }));
  if (i.folder) for (const w of tokensFromName(i.folder)) out.push({ name: w, confidence: 0.5, source: 'regla', via: 'nombre' });
  for (const w of i.sourceTags ?? []) out.push({ name: w, confidence: 0.8, source: 'import', via: 'metadatos' });
  if (i.origin) { const host = (() => { try { return new URL(i.origin!).hostname.replace(/^www\./, '').split('.')[0]; } catch { return ''; } })(); if (host) out.push({ name: host, confidence: 0.4, source: 'import', via: 'url' }); }
  if (i.geom) out.push(...geometryTags(i.geom));
  return out;
}

/**
 * Validación determinista de candidatos (de reglas o de IA): normaliza, descarta prohibidas/duplicadas/ya puestas,
 * prefiere el vocabulario existente (mapea «llaveros» al «llavero» que ya se usa) y limita la cantidad.
 */
export function mergeSuggestions(cands: TagCandidate[], opts: { vocabulary?: string[]; existing?: string[]; max?: number } = {}): TagCandidate[] {
  const vocab = new Map((opts.vocabulary ?? []).map((v) => [normalizeTag(v), v]));
  const have = new Set((opts.existing ?? []).map(normalizeTag));
  const best = new Map<string, TagCandidate>();
  for (const c of cands) {
    const n = normalizeTag(c.name); if (n.length < 2 || BANNED.has(n) || have.has(n) || STOP.has(n)) continue;
    const name = vocab.get(n) ?? n; const cur = best.get(name);
    const conf = Math.min(1, Math.max(0, c.confidence + (vocab.has(n) ? 0.15 : 0)));
    if (!cur || conf > cur.confidence) best.set(name, { ...c, name, confidence: +conf.toFixed(2) });
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name)).slice(0, opts.max ?? MAX_TAGS);
}
