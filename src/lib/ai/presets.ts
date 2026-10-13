import type { AiSettings } from './types';

/**
 * Proveedores preconfigurados. Todos hablan uno de los dos protocolos que soporta el Hub:
 * `anthropic` (API Messages) u `openai-compat` (/chat/completions: Ollama, LM Studio, vLLM, OpenRouter, OpenAI…).
 * Siempre existen los dos «genéricos» para cualquier servicio que no esté en la lista.
 * El texto de cada uno vive en i18n: ai.presets.<id>.label / .note
 */
export type PresetId =
  | 'ollama' | 'lmstudio' | 'llamacpp' | 'vllm' | 'jan'
  | 'anthropic' | 'ollamaCloud' | 'openai' | 'openrouter' | 'groq' | 'gemini' | 'mistral' | 'together' | 'deepseek'
  | 'genericOpenai' | 'genericAnthropic';

export interface Preset {
  id: PresetId;
  kind: 'anthropic' | 'openai-compat';
  group: 'local' | 'cloud' | 'generic';
  baseUrl: string;
  /** El servicio exige clave de API. */
  needsKey: boolean;
  /** Modelos sugeridos (vacío = se cargan desde el servicio con «Cargar modelos»). */
  models: { fast: string; smart: string; vision: string };
  /** Puerto donde suele escuchar (para el descubridor de IA local). */
  port?: number;
}
const none = { fast: '', smart: '', vision: '' };

export const PRESETS: Preset[] = [
  // Locales (en tu equipo o en tu red)
  { id: 'ollama', kind: 'openai-compat', group: 'local', baseUrl: 'http://localhost:11434/v1', needsKey: false, models: none, port: 11434 },
  { id: 'lmstudio', kind: 'openai-compat', group: 'local', baseUrl: 'http://localhost:1234/v1', needsKey: false, models: none, port: 1234 },
  { id: 'llamacpp', kind: 'openai-compat', group: 'local', baseUrl: 'http://localhost:8080/v1', needsKey: false, models: none, port: 8080 },
  { id: 'vllm', kind: 'openai-compat', group: 'local', baseUrl: 'http://localhost:8000/v1', needsKey: false, models: none, port: 8000 },
  { id: 'jan', kind: 'openai-compat', group: 'local', baseUrl: 'http://localhost:1337/v1', needsKey: false, models: none, port: 1337 },
  // Nube
  { id: 'anthropic', kind: 'anthropic', group: 'cloud', baseUrl: 'https://api.anthropic.com', needsKey: true, models: { fast: 'claude-haiku-5-5', smart: 'claude-sonnet-5-5', vision: '' } },
  { id: 'ollamaCloud', kind: 'openai-compat', group: 'cloud', baseUrl: 'https://ollama.com/v1', needsKey: true, models: { fast: 'gpt-oss:20b', smart: 'gpt-oss:120b', vision: '' } },
  { id: 'openai', kind: 'openai-compat', group: 'cloud', baseUrl: 'https://api.openai.com/v1', needsKey: true, models: none },
  { id: 'openrouter', kind: 'openai-compat', group: 'cloud', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, models: none },
  { id: 'groq', kind: 'openai-compat', group: 'cloud', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, models: none },
  { id: 'gemini', kind: 'openai-compat', group: 'cloud', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, models: none },
  { id: 'mistral', kind: 'openai-compat', group: 'cloud', baseUrl: 'https://api.mistral.ai/v1', needsKey: true, models: none },
  { id: 'together', kind: 'openai-compat', group: 'cloud', baseUrl: 'https://api.together.xyz/v1', needsKey: true, models: none },
  { id: 'deepseek', kind: 'openai-compat', group: 'cloud', baseUrl: 'https://api.deepseek.com', needsKey: true, models: none },
  // Genéricos: cualquier servicio que hable uno de los dos protocolos
  { id: 'genericOpenai', kind: 'openai-compat', group: 'generic', baseUrl: '', needsKey: false, models: none },
  { id: 'genericAnthropic', kind: 'anthropic', group: 'generic', baseUrl: '', needsKey: true, models: none },
];
export const PRESET_BY_ID = new Map<string, Preset>(PRESETS.map((p) => [p.id, p]));
export const isPresetId = (v: unknown): v is PresetId => typeof v === 'string' && PRESET_BY_ID.has(v);

/** Preajuste efectivo de unos ajustes: el guardado, o el deducido del proveedor (instalaciones anteriores a los preajustes). */
export function presetOf(st: Pick<AiSettings, 'preset' | 'provider'>): PresetId | '' {
  if (isPresetId(st.preset)) return st.preset;
  return st.provider === 'anthropic' ? 'anthropic' : st.provider === 'openai-compat' ? 'genericOpenai' : '';
}
