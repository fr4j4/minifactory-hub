import type { z } from 'zod';
import { LocalizedError } from '@/i18n/errors';
import type { MessageKey, Params } from '@/i18n/translate';

/** Funciones de IA conocidas. `available` pasa a true cuando se implementa (Fase 0 solo trae la fundación). */
export const FEATURES = {
  'profile.advisor': { tier: 'smart', vision: false, available: false },
  'profile.diagnose': { tier: 'smart', vision: true, available: false },
  'slicer.explain': { tier: 'fast', vision: false, available: false },
  'intake.parse': { tier: 'smart', vision: true, available: false },
  'messages.draft': { tier: 'fast', vision: false, available: false },
  'files.tag': { tier: 'fast', vision: true, available: false },
  'production.classify': { tier: 'fast', vision: true, available: false },
  'reports.ask': { tier: 'smart', vision: false, available: false },
} as const satisfies Record<string, { tier: Tier; vision: boolean; available: boolean }>;
export type FeatureKey = keyof typeof FEATURES;
/** 'profile.advisor' → 'profileAdvisor' (clave de traducción: ai.features.<clave>.label / .desc). */
export const featureI18n = (k: string) => k.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase());
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

export class AIError extends LocalizedError {
  readonly status?: number;
  constructor(key: MessageKey, readonly code: 'disabled' | 'forbidden' | 'budget' | 'config' | 'provider' | 'invalid' | 'timeout' | 'circuit', o: { params?: Params; status?: number } = {}) {
    super(key, o.params); this.name = 'AIError'; this.status = o.status;
  }
}
