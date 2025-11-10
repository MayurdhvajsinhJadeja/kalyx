import fetch from 'node-fetch';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

// keep for quick health check
export async function haveOllama() {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { timeout: 1000 });
    return r.ok;
  } catch { return false; }
}

/**
 * Call Ollama chat. Pass the model you want to use.
 */
export async function llmSuggestRaw(system, prompt, modelName) {
  const body = {
    model: modelName,             // <-- model per-call
    stream: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  };

  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data?.message?.content || '';
}

export function parseLLMJson(s) {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  const slice = s.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    if (!('candidates' in parsed) || !('intent' in parsed)) return null;
    parsed.candidates = Array.isArray(parsed.candidates) ? parsed.candidates.slice(0,2) : [];
    return parsed;
  } catch { return null; }
}
