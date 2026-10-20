import { z } from 'zod';
import { runTask, type RunContext } from '../run';
import { dataBlock, replyLanguage, UNTRUSTED_NOTE } from './shared';
import type { Locale } from '@/i18n/config';
import { normalizeTag, type TagCandidate, type TagInput } from '@/lib/library/tags';

export const PROMPT_VERSION = 'file-tags@1';
export const TagsOut = z.object({
  tags: z.array(z.object({ name: z.string().min(1).max(40), confidence: z.number().min(0).max(1), source: z.enum(['nombre', 'forma', 'url', 'metadatos']).default('nombre') })).max(12),
  category: z.string().max(40).optional(),
});

/** Etiquetas sugeridas por IA para un modelo. Solo recibe nombre, carpeta, origen, etiquetas del sitio y medidas (nunca la malla). Los candidatos pasan después por mergeSuggestions. */
/** Miniatura del modelo (opcional): solo viaja si el taller permitió enviar imágenes a la IA. */
export interface TagImage { data: Buffer; mime: string }
const withImage = (text: string, img?: TagImage): string | Array<{ type: 'text'; text: string } | { type: 'image'; data: Buffer; mime: string }> => (img ? [{ type: 'text', text }, { type: 'image', data: img.data, mime: img.mime }] : text);

export async function suggestTagsAi(i: TagInput & { vocabulary: string[]; locale: Locale; image?: TagImage }, ctx: RunContext): Promise<TagCandidate[]> {
  const r = await runTask({
    feature: 'files.tag', tier: 'fast', maxOutputTokens: 300,
    system: `Eres el archivista de la biblioteca de modelos 3D de un taller. Propón hasta 8 etiquetas cortas (una o dos palabras, en ${replyLanguage(i.locale)}, singular) que ayuden a buscar el modelo: qué es, para qué sirve, estilo. Prefiere reutilizar las etiquetas del vocabulario existente cuando signifiquen lo mismo. ${UNTRUSTED_NOTE}`,
    user: withImage(dataBlock('modelo', { nombre: i.name.slice(0, 120), carpeta: i.folder ?? null, origen: i.origin ?? null, etiquetas_del_sitio: (i.sourceTags ?? []).slice(0, 20), medidas_mm: i.geom ? [i.geom.dimX, i.geom.dimY, i.geom.dimZ] : null, vocabulario: i.vocabulary.slice(0, 60) }), i.image),
    schema: TagsOut,
  }, { ...ctx, promptVersion: PROMPT_VERSION });
  return r.data.tags.map((t) => ({ name: normalizeTag(t.name), confidence: t.confidence, source: 'ia' as const, via: t.source }));
}
