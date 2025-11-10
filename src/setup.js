import { spawn, spawnSync } from 'node:child_process';
import fetch from 'node-fetch';
import os from 'node:os';
import { has as hasCmd } from './env.js';
import { confirm, intro, outro, select, spinner } from '@clack/prompts';
import { MODEL_CATALOG, findModelInfo, defaultModelName } from './models.js';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const isWin = os.platform() === 'win32';

async function reachable(url, timeoutMs = 1500) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const res = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureOllamaInstalledInteractively() {
  if (hasCmd('ollama')) return true;

  const ok = await confirm({
    message: 'Ollama is not installed. Install it now?',
    initialValue: true
  });
  if (!ok) return false;

  if (isWin) {
    if (!hasCmd('winget')) {
      console.error('winget not found. Install Ollama from https://ollama.com/download and re-run.');
      return false;
    }
    const r = spawnSync('winget', ['install', '-e', '--id', 'Ollama.Ollama', '-h'], { stdio: 'inherit', shell: true });
    return r.status === 0 && hasCmd('ollama');
  } else {
    const r = spawnSync('bash', ['-lc', 'curl -fsSL https://ollama.com/install.sh | sh'], { stdio: 'inherit' });
    return r.status === 0 && hasCmd('ollama');
  }
}

async function ensureOllamaAPIUp() {
  if (await reachable(`${OLLAMA_HOST}/api/tags`)) return true;

  // try to start the server
  if (isWin) {
    spawn('powershell.exe',
      ['-NoLogo','-NoProfile','-Command','Start-Process -FilePath ollama -ArgumentList serve -WindowStyle Hidden'],
      { stdio: 'ignore', detached: true }
    );
  } else {
    spawn('bash', ['-lc', 'nohup ollama serve >/dev/null 2>&1 & disown'], { stdio: 'ignore', detached: true });
  }

  // wait up to ~10s
  for (let i = 0; i < 20; i++) {
    if (await reachable(`${OLLAMA_HOST}/api/tags`)) return true;
    await sleep(500);
  }
  return false;
}

async function modelExists(name) {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    const data = await res.json();
    const list = Array.isArray(data?.models) ? data.models : (Array.isArray(data) ? data : []);
    return list.some(m => (m?.name || '').toLowerCase().startsWith(name.toLowerCase()));
  } catch { return false; }
}

async function pullModel(name) {
  const s = spinner();
  s.start(`Pulling model: ${name} (first time can be large)…`);
  const r = spawnSync('ollama', ['pull', name], { stdio: 'inherit', shell: isWin });
  s.stop(r.status === 0 ? `Model '${name}' ready.` : `Pull failed for '${name}'.`);
  return r.status === 0;
}

// NEW: interactive picker with hints + sizes (unless overridden)
async function pickModelInteractively(providedName) {
  // If caller provided a name via env/flag, honor it (no prompt).
  if (providedName) {
    const info = findModelInfo(providedName);
    return info ? info.name : providedName; // still try arbitrary names
  }

  const choices = MODEL_CATALOG.map((m, i) => ({
    value: m.name,
    label: `${m.display}  —  ${m.approxSize}`,
    hint: m.hint + (m.recommended ? '  [Recommended]' : '')
  }));

  const choice = await select({
    message: 'Choose a local model to use:',
    options: choices
  });

  // User hit Esc or cancel → fallback to default recommended
  return choice || defaultModelName();
}

/**
 * Ensure runtime (Ollama + chosen model) is ready.
 * Returns { modelInUse } or null if not possible.
 * @param env
 * @param options { preferModel?: string }  // from HT_MODEL/--model, skip prompt if provided
 */
export async function ensureRuntime(env, options = {}) {
  intro('Checking local LLM runtime');

  if (!await ensureOllamaInstalledInteractively()) {
    outro('Cannot proceed without Ollama. Exiting.');
    return null;
  }

  if (!await ensureOllamaAPIUp()) {
    console.error(`Ollama API not reachable at ${OLLAMA_HOST}. Try 'ollama serve' and re-run.`);
    return null;
  }

  // Ask user which model (unless overridden)
  const preferred = options.preferModel || process.env.HT_MODEL;
  let chosen = await pickModelInteractively(preferred);

  // If chosen exists or we can pull it, use it; otherwise try recommended fallback.
  if (!(await modelExists(chosen))) {
    const ok = await pullModel(chosen);
    if (!ok) {
      // Fallback to catalog recommended or light model (phi3:mini)
      const fallback = defaultModelName();
      if (fallback !== chosen) {
        console.warn(`Falling back to ${fallback}…`);
        if (!(await modelExists(fallback)) && !(await pullModel(fallback))) {
          console.error(`Could not pull chosen (${chosen}) or fallback (${fallback}).`);
          return null;
        }
        chosen = fallback;
      } else {
        // last resort: phi3:mini
        const last = 'phi3:mini';
        if (!(await modelExists(last)) && !(await pullModel(last))) {
          console.error(`Could not pull any model. Aborting.`);
          return null;
        }
        chosen = last;
      }
    }
  }

  return { modelInUse: chosen };
}
