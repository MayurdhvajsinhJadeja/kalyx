// src/env.js
import { execSync } from 'node:child_process';
import os from 'node:os';

export function has(cmd) {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

export function collectEnv() {
  const platform = os.platform();
  const shell = process.env.SHELL || (platform === 'win32' ? process.env.COMSPEC || 'powershell.exe' : '');
  const isWindows = platform === 'win32';

  const toolsList = [
    'git','curl','wget','zip','unzip','tar','rg','fd','fzf',
    'npm','pnpm','yarn','bun','lsof','ss','ncdu','htop','sed','awk','grep','ps','kill','tee','powershell','ollama'
  ];
  const installedTools = toolsList.filter(has);
  const pm = installedTools.includes('pnpm') ? 'pnpm'
            : installedTools.includes('yarn') ? 'yarn'
            : installedTools.includes('bun') ? 'bun'
            : 'npm';

  return { os: platform, shell, isWindows, cwd: process.cwd(), preferredPackageManager: pm, installedTools };
}
