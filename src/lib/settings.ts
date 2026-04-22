import type { ModelConfig } from "./types";

const SETTINGS_KEY = "model_config";

const DEFAULT_CONFIG: ModelConfig = {
  apiKey: "",
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getModelConfig(): ModelConfig {
  if (!isBrowser()) return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveModelConfig(config: ModelConfig): void {
  if (!isBrowser()) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
}

export function isConfigured(): boolean {
  const config = getModelConfig();
  return config.apiKey.length > 0 && config.model.length > 0 && config.baseUrl.length > 0;
}
