import type { z } from 'zod';

/** Funciones de IA conocidas. `available` pasa a true cuando se implementa (Fase 0 solo trae la fundación). */
export const FEATURES = {
  'profile.advisor': { label: 'Asesor de perfiles de impresión', desc: 'Propone candidatos de perfil, los lamina y los compara.', tier: 'smart', vision: false, available: false },
  'profile.diagnose': { label: 'Diagnóstico de problemas de impresión', desc: 'Causas probables y cambios de parámetros desde texto o foto.', tier: 'smart', vision: true, available: false },
  'slicer.explain': { label: 'Explicar errores de laminado', desc: 'Traduce errores del laminador a acciones concretas.', tier: 'fast', vision: false, available: false },
  'intake.parse': { label: 'Captura de pedidos desde mensajes', desc: 'Convierte un mensaje en un borrador de pedido o presupuesto.', tier: 'smart', vision: true, available: false },
  'messages.draft': { label: 'Redacción de mensajes', desc: 'Borradores de mensajes de presupuesto, seguimiento y entrega.', tier: 'fast', vision: false, available: false },
  'files.tag': { label: 'Etiquetado de archivos 3D', desc: 'Etiquetas, nombre y carpeta sugeridos.', tier: 'fast', vision: true, available: false },
  'production.classify': { label: 'Clasificar causa de falla', desc: 'Normaliza la causa de falla desde notas o fotos.', tier: 'fast', vision: true, available: false },
  'reports.ask': { label: 'Preguntas sobre reportes', desc: 'Respuestas en lenguaje natural usando los reportes existentes.', tier: 'smart', vision: false, available: false },
} as const satisfies Record<string, { label: string; desc: string; tier: Tier; vision: boolean; available: boolean }>;
export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];
export type Tier = 'fast' | 'smart';
export type ProviderId = 'anthropic' | 'openai-compat' | 'mock';

export type AIContent = string | Array<{ type: 'text'; text: string } | { type: 'image'; data: Buffer; mime: string }>;
export interface AIRequest<T> {
  feature: FeatureKey | 'system.ping';
  tier: Tier;
  system: string;
  user: AIContent;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  timeoutMs?: number;
  temperature?: number;
}
export interface ProviderCallOptions { model: string; apiKey?: string; baseUrl?: string; signal?: AbortSignal }
export interface Usage { inTokens: number; outTokens: number }
export interface ProviderResult { text: string; usage: Usage; model: string }

/** Contrato de un proveedor: devuelve texto JSON; la validación con zod la hace `run.ts`. */
export interface AIProvider {
  id: ProviderId;
  capabilities: { vision: boolean; jsonSchema: boolean; embeddings: boolean };
  complete(req: { system: string; user: AIContent; jsonSchema?: unknown; maxOutputTokens: number; temperature: number; timeoutMs?: number }, o: ProviderCallOptions): Promise<ProviderResult>;
}

export interface AiSettings {
  enabled: boolean;
  provider: 'none' | 'anthropic' | 'openai-compat';
  baseUrl: string;
  apiKeySealed: string;
  models: { fast: string; smart: string; vision: string };
  localOnly: boolean;
  features: Partial<Record<FeatureKey, boolean>>;
  roles: Partial<Record<FeatureKey, string[]>>;
  privacy: { redactPII: boolean; sendImages: boolean };
  budget: { monthlyUsd: number | null; perUserDailyCalls: number; hardStop: boolean };
  retention: { logPromptsDays: number };
}

export const DEFAULT_AI: AiSettings = {
  enabled: false, provider: 'none', baseUrl: '', apiKeySealed: '',
  models: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5', vision: '' },
  localOnly: false, features: {}, roles: {},
  privacy: { redactPII: true, sendImages: false },
  budget: { monthlyUsd: 10, perUserDailyCalls: 100, hardStop: false },
  retention: { logPromptsDays: 0 },
};

export class AIError extends Error {
  constructor(message: string, readonly code: 'disabled' | 'forbidden' | 'budget' | 'config' | 'provider' | 'invalid' | 'timeout' | 'circuit', readonly status?: number) { super(message); }
}
