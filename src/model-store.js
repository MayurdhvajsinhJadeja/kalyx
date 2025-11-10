import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CONFIG_FILE = path.join(os.homedir(), '.kalyx-config.json');

export function getModelConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    const defaultConfig = { model: 'phi3:mini' };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
}

export function setModelConfig(model) {
  const config = getModelConfig();
  config.model = model;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}