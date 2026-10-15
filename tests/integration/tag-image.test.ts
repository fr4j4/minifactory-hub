import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb, s } from '@/db';
import { seedDemo } from '@/lib/seed';
import { saveSettings } from '@/lib/settings';
import { DEFAULT_AI } from '@/lib/ai/types';
import { cacheClear } from '@/lib/ai/cache';
import { mockCalls, resetMock, setMockHandler } from '@/lib/ai/providers/mock';
import { resetBreakers } from '@/lib/ai/run';
import { suggestTagsAi } from '@/lib/ai/features/file-tags';

process.env.AI_RETRY_BASE_MS = '1';
let user: any;
beforeAll(async () => { await seedDemo(); const db = await getDb(); const [a] = (await db.select().from(s.users)).filter((u) => u.role === 'admin'); user = { id: a.id, role: a.role, permOverrides: {} }; });
const cfg = (sendImages: boolean) => saveSettings({ ai: { ...DEFAULT_AI, enabled: true, features: { 'files.tag': true }, roles: { 'files.tag': ['admin'] }, privacy: { redactPII: true, sendImages } } as any });
beforeEach(() => { resetMock(); resetBreakers(); cacheClear(); process.env.AI_PROVIDER = 'mock'; setMockHandler(() => JSON.stringify({ tags: [{ name: 'Llavero', confidence: 0.9, source: 'forma' }] })); });

const input = { name: 'pieza', vocabulary: [], locale: 'es' as const, image: { data: Buffer.from('fake-webp'), mime: 'image/webp' } };

describe('etiquetado con imagen', () => {
  it('con imágenes permitidas, la miniatura viaja junto al texto', async () => {
    await cfg(true);
    const r = await suggestTagsAi(input, { user });
    expect(r.map((x) => x.name)).toEqual(['llavero']);
    const u = mockCalls()[0].user; expect(Array.isArray(u)).toBe(true); expect((u as any[]).some((p) => p.type === 'image' && p.mime === 'image/webp')).toBe(true);
  });
  it('con imágenes apagadas la IA lo rechaza (la acción reintenta sin imagen)', async () => {
    await cfg(false);
    await expect(suggestTagsAi(input, { user })).rejects.toThrow();
    cacheClear(); const r = await suggestTagsAi({ ...input, image: undefined }, { user });
    expect(r).toHaveLength(1); expect(typeof mockCalls().at(-1)!.user).toBe('string');
  });
});
