// src/cli.js
import { intro, outro, text, select, confirm, spinner, isCancel } from '@clack/prompts';
import { collectEnv } from './env.js';
import { looksDangerous } from './safety.js';
import { SYSTEM_PROMPT, userPrompt } from './prompt.js';
import { haveOllama, llmSuggestRaw, parseLLMJson } from './llm.js';
import { ensureRuntime } from './setup.js';
import { spawn } from 'node:child_process';
import { containsRedirection, stripRedirections, composeSaveWithTee } from './redirects.js';
import { isSaveIntent, extractFileHint } from './intent.js';
import { getModelConfig, setModelConfig } from './model-store.js';
import { MODEL_CATALOG } from './models.js';

// --- helpers --------------------------------------------------------------

function runCommand(cmd, env) {
  return new Promise((resolve, reject) => {
    if (env.isWindows) {
      const child = spawn(
        'powershell.exe',
        ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
        { stdio: 'inherit' }
      );
      child.on('close', code => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
    } else {
      const child = spawn(cmd, { shell: true, stdio: 'inherit' });
      child.on('close', code => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
    }
  });
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  // If it's the last argument, or next argument starts with --, return empty string
  if (i >= process.argv.length - 1 || process.argv[i + 1].startsWith('--')) return '';
  return process.argv[i + 1];
}

function stripModelFlags(argv) {
  const args = [...argv];
  const i = args.indexOf('--model');
  if (i >= 0) {
    args.splice(i, 1);            // remove --model
    if (i < args.length && !args[i].startsWith('--')) args.splice(i, 1); // remove value if not a flag
  }
  return args;
}

// Ask the LLM (already ensured runtime); falls back to rule pack if needed.
async function ask(query, env, historyHints, modelInUse) {
  const usingOllama = await haveOllama();
  if (!usingOllama) {
    const fb = fallbackSuggest(query, env);
    if (fb.length === 0) {
      return {
        intent: query,
        clarification: { question: 'Be a bit more specific?', choices: ['add detail', 'cancel'] },
        candidates: []
      };
    }
    return { intent: query, clarification: null, candidates: fb };
  }

  const s = spinner();
  s.start(`Thinking with local LLM (${modelInUse})…`);
  const resText = await llmSuggestRaw(
    SYSTEM_PROMPT,
    userPrompt(query, env, historyHints),
    modelInUse
  ).catch(err => {
    s.stop('LLM error; falling back.');
    if (process.env.HT_DEBUG) console.error('[LLM ERROR]', err.message);
    return null;
  });
  s.stop('Done.');

  if (!resText) {
    const fb = fallbackSuggest(query, env);
    return { intent: query, clarification: null, candidates: fb };
  }

  const parsed = parseLLMJson(resText);
  if (!parsed) {
    return {
      intent: query,
      clarification: { question: 'Couldn’t parse. Narrow it down?', choices: ['retry', 'cancel'] },
      candidates: []
    };
  }
  parsed.candidates = (parsed.candidates || []).slice(0, 2);
  return parsed;
}

// --- main -----------------------------------------------------------------

async function main() {
  const env = collectEnv();
  
  // Handle --model without value as a selection prompt
  const modelArg = getArg('--model');
  if (modelArg === '') {
    // Show model selection menu
    intro('Model Selection');
    
    // Get installed models from Ollama
    const s = spinner();
    s.start('Checking Ollama models...');
    const usingOllama = await haveOllama();
    s.stop('Done');
    
    if (!usingOllama) {
      outro('Ollama is not running. Please start Ollama first.');
      process.exit(1);
    }

    // Get current model from config
    const config = getModelConfig();
    
    const options = MODEL_CATALOG.map(model => ({
      value: model.name,
      label: model.display,
      hint: model.hint + (model.name === config.model ? ' (current)' : ''),
    }));
    options.push({ value: 'custom', label: 'Custom Model', hint: 'Use your own Ollama model' });

    const choice = await select({
      message: 'Choose a model:',
      options,
    });

    if (!choice) {
      outro('Model selection cancelled.');
      process.exit(0);
    }

    let selectedModel = choice;
    if (choice === 'custom') {
      const customModel = await text({
        message: 'Enter the name of your Ollama model:',
        placeholder: 'e.g., your-model:latest',
        validate: (value) => {
          if (!value) return 'Model name is required';
          return true;
        }
      });
      if (!customModel) {
        outro('Model selection cancelled.');
        process.exit(0);
      }
      selectedModel = customModel;
    }

    setModelConfig(selectedModel);
    outro(`Model set to: ${selectedModel}`);
    process.exit(0);
  }

  // Get model from config, flag, or env var
  const config = getModelConfig();
  const preferModel = modelArg || process.env.HT_MODEL || config.model;
  
  // If model changed via flag with value, save it
  if (modelArg && modelArg !== '') {
    setModelConfig(modelArg);
  }

  // Ensure local runtime (Ollama + user-chosen model).
  const rt = await ensureRuntime(env, { preferModel });
  if (!rt || !rt.modelInUse) {
    outro('Setup did not complete. Exiting.');
    process.exit(1);
  }
  const modelInUse = rt.modelInUse;

  // Build initial intent (strip internal flags so they don't pollute the prompt)
  const cleanedArgv = stripModelFlags(process.argv.slice(2));
  let initial = cleanedArgv.join(' ').trim();
  if (!initial) {
    const p = await text({
      message: 'What do you need?',
      placeholder: 'e.g., find big files / zip this folder / show ports'
    });
    if (isCancel(p)) {
      outro('Goodbye.');
      return;
    }
    initial = p;
  }

  if (!initial) {
    outro('Goodbye.');
    return;
  }

  intro(`Human Terminal (local LLM: ${modelInUse})`);

  let query = initial;
  const historyHints = [];

  while (true) {
    const res = await ask(query, env, historyHints, modelInUse);

    if (res.clarification && (!res.candidates || res.candidates.length === 0)) {
      const clarificationChoices = (res.clarification.choices || []).filter(
        c => c.toLowerCase() !== 'cancel' && c.toLowerCase() !== 'exit'
      );
      const choice = await select({
        message: res.clarification.question,
        options: [
          ...clarificationChoices.map(c => ({ value: c, label: c })),
          { value: 'exit', label: 'Exit' }
        ]
      });
      if (isCancel(choice) || choice === 'exit') {
        outro('Goodbye.');
        return;
      }
      const label = choice;
      query = `${query} :: ${label}`;
      historyHints.push(label);
      continue;
    }

    if (!res.candidates?.length) {
      const again = await confirm({ message: 'No exact safe command yet. Try again?', initialValue: true });
      if (isCancel(again) || !again) {
        outro('Goodbye.');
        return;
      }
      const p = await text({ message: 'Refine intent:' });
      if (isCancel(p)) {
        outro('Goodbye.');
        return;
      }
      query = p;
      continue;
    }

    const options = res.candidates.map((c, i) => ({
      value: String(i),
      label: `${c.command}`,
      hint: `${c.why}  (conf ${Math.round((c.confidence || 0) * 100)}%)`
    }));
    options.push({
      value: 'retry',
      label: 'Try again…',
      hint: 'Add a hint (e.g., use pnpm / current folder)'
    });
    options.push({ value: 'exit', label: 'Exit' });

    const picked = await select({ message: 'Pick a command to run:', options });

    if (isCancel(picked) || picked === 'exit') {
      outro('Goodbye.');
      return;
    }

    if (picked === 'retry') {
      const hint = await text({ message: 'Add hint:' });
      if (isCancel(hint)) {
        outro('Goodbye.');
        return;
      }
      query = `${query} :: ${hint}`;
      historyHints.push(hint);
      continue;
    }

    const chosen = res.candidates[Number(picked)];
    let cmd = chosen.command;

    // Give option to edit the command
    const editChoice = await select({
      message: 'Before running:',
      options: [
        { value: 'run', label: 'Run as is', hint: cmd },
        { value: 'edit', label: 'Edit command', hint: 'Modify before running' },
        { value: 'goback', label: 'Go back', hint: 'Pick a different command' },
        { value: 'exit', label: 'Exit' }
      ]
    });

    if (isCancel(editChoice) || editChoice === 'exit') {
      outro('Goodbye.');
      return;
    }

    if (editChoice === 'goback') {
      continue;
    }

    if (editChoice === 'edit') {
      const edited = await text({
        message: 'Edit command:',
        initialValue: cmd,
        validate: (value) => {
          if (!value.trim()) {
            return 'Command cannot be empty';
          }
        },
      });
      
      if (!edited) {
        continue;
      }
      cmd = edited;
    }

    // Output normalization:
    // - live output by default (strip redirections / tee if model suggested them)
    // - if user asked to save (e.g., "save to foo.txt"), use tee/Tee-Object and create dirs
    const saveAsked = isSaveIntent(initial || query);

    if (!saveAsked) {
      if (containsRedirection(cmd, env.isWindows)) {
        cmd = stripRedirections(cmd, env.isWindows);
      }
    } else {
      let file = extractFileHint(initial || query);
      if (!file) {
        file = await text({ message: 'Save output to file name:', placeholder: 'output.txt' });
      }
      const wantAppend = await confirm({ message: 'Append if file exists?', initialValue: false });

      // Ensure directory exists if path includes folders
      if (file.includes('/') || file.includes('\\')) {
        const dir = file.replace(/[\\/][^\\/]+$/, '');
        if (dir && dir !== file) {
          if (env.isWindows) {
            cmd = `New-Item -ItemType Directory -Force -Path "${dir}" | Out-Null; (${stripRedirections(cmd, true)})`;
          } else {
            cmd = `mkdir -p "${dir}" && (${stripRedirections(cmd, false)})`;
          }
        } else {
          cmd = stripRedirections(cmd, env.isWindows);
        }
      } else {
        cmd = stripRedirections(cmd, env.isWindows);
      }

      // Compose save with tee/Tee-Object so user still sees live output
      cmd = composeSaveWithTee(cmd, file, {
        append: wantAppend,
        includeStderr: false,
        isWindows: env.isWindows
      });
    }

    // Safety gate for obviously destructive commands
    if (looksDangerous(cmd)) {
      const ok = await text({ message: "This looks destructive. Type exactly: force", placeholder: "force" });
      if ((ok || '').trim() !== 'force') {
        outro('Blocked. Not running.');
        return;
      }
    }

    // Final confirmation
    const yes = await confirm({ 
      message: `Execute: ${cmd}`,
      initialValue: true
    });
    
    if (isCancel(yes) || !yes) {
      const again = await confirm({ message: 'Pick another?', initialValue: true });
      if (isCancel(again) || !again) {
        outro('Okay, not running.');
        return;
      }
      continue;
    }

    try {
      await runCommand(cmd, env);
      outro('Done.');
    } catch (e) {
      outro(`Command failed: ${e.message}`);
    }
    break;
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
