import { AIError, type AIContent, type AIProvider } from '../types';
import { postJson } from './http';

const blocks = (c: AIContent) => (typeof c === 'string' ? [{ type: 'text', text: c }]
  : c.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.data.toString('base64') } })));

/** API Messages de Anthropic. La salida estructurada se obtiene forzando una herramienta con el esquema JSON. */
export const anthropic: AIProvider = {
  id: 'anthropic',
  capabilities: { vision: true, jsonSchema: true, embeddings: false },
  async complete(req, o) {
    if (!o.apiKey) throw new AIError('Falta la clave de API de Anthropic', 'config');
    const base = (o.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const body: Record<string, unknown> = {
      model: o.model, max_tokens: req.maxOutputTokens, temperature: req.temperature, system: req.system,
      messages: [{ role: 'user', content: blocks(req.user) }],
    };
    if (req.jsonSchema) { body.tools = [{ name: 'responder', description: 'Entrega la respuesta final con el formato exigido.', input_schema: req.jsonSchema }]; body.tool_choice = { type: 'tool', name: 'responder' }; }
    const j = await postJson(`${base}/v1/messages`, { 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01' }, body, req.timeoutMs ?? 60_000, o.signal);
    const parts: any[] = Array.isArray(j.content) ? j.content : [];
    const tool = parts.find((p) => p.type === 'tool_use');
    const text = tool ? JSON.stringify(tool.input) : parts.filter((p) => p.type === 'text').map((p) => p.text).join('');
    if (!text) throw new AIError('El proveedor devolvió una respuesta vacía', 'provider');
    return { text, usage: { inTokens: j.usage?.input_tokens ?? 0, outTokens: j.usage?.output_tokens ?? 0 }, model: j.model ?? o.model };
  },
};
