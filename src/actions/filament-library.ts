'use server';
import { revalidatePath } from 'next/cache';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { safe } from './common';
import { deleteFilament, deleteVariant, resetFilament, restoreFilament, saveFilament, saveVariant, type FilamentInput, type VariantInput } from '@/lib/catalog/local';

/** Biblioteca de filamentos del taller: alta y edición de líneas y colores. Usa los permisos del inventario. */
const done = (key?: string) => { revalidatePath('/filamentos'); if (key) revalidatePath(`/filamentos/${key.split('/').map(encodeURIComponent).join('/')}`); revalidatePath('/inventario'); };

export async function saveFilamentAction(input: FilamentInput, existingKey?: string | null) {
  return safe(async () => {
    const u = await requirePerm('inventario', existingKey ? 'E' : 'C'); const r = await saveFilament(input, existingKey ?? null);
    await audit('filament_catalog', r.key, existingKey ? 'editar' : 'crear', { name: input.name }, u.id); done(r.key); return r;
  });
}
export async function deleteFilamentAction(key: string) {
  return safe(async () => { const u = await requirePerm('inventario', 'X'); const r = await deleteFilament(key); await audit('filament_catalog', key, r === 'hidden' ? 'ocultar' : 'eliminar', {}, u.id); done(key); return r; });
}
export async function restoreFilamentAction(key: string) {
  return safe(async () => { const u = await requirePerm('inventario', 'E'); await restoreFilament(key); await audit('filament_catalog', key, 'mostrar', {}, u.id); done(key); });
}
export async function resetFilamentAction(key: string) {
  return safe(async () => { const u = await requirePerm('inventario', 'E'); await resetFilament(key); await audit('filament_catalog', key, 'volver_al_original', {}, u.id); done(key); });
}
export async function saveVariantAction(filamentKey: string, variantId: string | null, input: VariantInput) {
  return safe(async () => { const u = await requirePerm('inventario', variantId ? 'E' : 'C'); const r = await saveVariant(filamentKey, variantId, input); await audit('filament_catalog', `${filamentKey}/${r.id}`, variantId ? 'editar_color' : 'crear_color', { name: input.name }, u.id); done(filamentKey); return r; });
}
export async function deleteVariantAction(filamentKey: string, variantId: string) {
  return safe(async () => { const u = await requirePerm('inventario', 'X'); await deleteVariant(filamentKey, variantId); await audit('filament_catalog', `${filamentKey}/${variantId}`, 'eliminar_color', {}, u.id); done(filamentKey); });
}
