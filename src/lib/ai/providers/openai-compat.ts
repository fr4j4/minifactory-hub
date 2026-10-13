import { AIError, type AIContent, type AIProvider } from '../types';
import { postJson } from './http';

const content = (c: AIContent) => (typeof c === 'string' ? c
  : c.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.data.toString('base64')}` } })));

/** /chat/completions: OpenAI, Ollama (http://host:11434/v1), LM Studio, vLLM, OpenRouter… */
export const openaiCompat: AIProvider = {
  id: 'openai-compat',
  capabilities: { vision: true, jsonSchema: false, embeddings: true },
  async complete(req, o) {
    if (!o.baseUrl) throw new AIError('ai.err.missingBaseUrl', 'config');
    const base = o.baseUrl.replace(/\/+$/, '');
    const system = req.jsonSchema
      ? `${req.system}\n\nResponde ÚNICAMENTE con un objeto JSON válido (sin texto adicional ni bloques de código) que cumpla este esquema JSON:\n${JSON.stringify(req.jsonSchema)}`
      : req.system;
    const body: Record<string, unknown> = {
      model: o.model, max_tokens: req.maxOutputTokens, temperature: req.temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: content(req.user) }],
    };
    if (req.jsonSchema) body.response_format = { type: 'json_object' };
    const headers: Record<string, string> = o.apiKey ? { authorization: `Bearer ${o.apiKey}` } : {};
    const j = await postJson(`${base}/chat/completions`, headers, body, req.timeoutMs ?? 60_000, o.signal);
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new AIError('ai.err.emptyResponse', 'provider');
    return { text, usage: { inTokens: j.usage?.prompt_tokens ?? 0, outTokens: j.usage?.completion_tokens ?? 0 }, model: j.model ?? o.model };
  },
};
