'use server';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { removePreset, savePreset, type PresetInput } from '@/lib/slicer/presets';
import { safe } from './common';

/** Crea o edita una calidad por intención (Configuración → Calidades). */
export async function savePresetAction(i: PresetInput) {
  return safe(async () => { const u = await requirePerm('config', 'E'); const id = await savePreset(i, u.id); await audit('quality_preset', id, i.id ? 'editar' : 'crear', { label: i.label }, u.id); return id; }, ['/configuracion', '/laminador', '/archivos']);
}
export async function removePresetAction(id: string) {
  return safe(async () => { const u = await requirePerm('config', 'E'); await removePreset(id); await audit('quality_preset', id, 'eliminar', {}, u.id); }, ['/configuracion', '/laminador', '/archivos']);
}
