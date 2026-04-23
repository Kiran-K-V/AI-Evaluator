import type { ModelConfig, ModelEntry, AppConfig } from "./types";

const SETTINGS_KEY = "model_config";
const APP_CONFIG_KEY = "app_config";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_APP_CONFIG: AppConfig = {
  models: [],
  activeModelId: "",
  judgeModelId: "",
};

export function getAppConfig(): AppConfig {
  if (!isBrowser()) return DEFAULT_APP_CONFIG;
  try {
    const raw = localStorage.getItem(APP_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_APP_CONFIG, ...parsed };
    }
    // Migrate from legacy single-model format
    const legacy = localStorage.getItem(SETTINGS_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      if (old.apiKey) {
        const entry: ModelEntry = {
          id: generateId(),
          name: old.model || "Default",
          provider: detectProvider(old.baseUrl || ""),
          apiKey: old.apiKey,
          baseUrl: old.baseUrl || "https://api.openai.com/v1",
          model: old.model || "gpt-4o-mini",
        };
        const config: AppConfig = {
          models: [entry],
          activeModelId: entry.id,
          judgeModelId: entry.id,
        };
        saveAppConfig(config);
        return config;
      }
    }
    return DEFAULT_APP_CONFIG;
  } catch {
    return DEFAULT_APP_CONFIG;
  }
}

export function saveAppConfig(config: AppConfig): void {
  if (!isBrowser()) return;
  localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(config));
  // Keep legacy format in sync for backward compat
  const active = config.models.find((m) => m.id === config.activeModelId);
  if (active) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      apiKey: active.apiKey,
      model: active.model,
      baseUrl: active.baseUrl,
    }));
  }
}

function detectProvider(url: string): string {
  if (url.includes("openai.com")) return "OpenAI";
  if (url.includes("groq.com")) return "Groq";
  if (url.includes("together.xyz")) return "Together AI";
  if (url.includes("openrouter.ai")) return "OpenRouter";
  if (url.includes("fireworks.ai")) return "Fireworks";
  if (url.includes("localhost") || url.includes("127.0.0.1")) return "Local";
  return "Custom";
}

export function getModelConfig(): ModelConfig {
  const config = getAppConfig();
  const active = config.models.find((m) => m.id === config.activeModelId);
  if (active) {
    return { apiKey: active.apiKey, model: active.model, baseUrl: active.baseUrl };
  }
  // Fallback to legacy
  if (!isBrowser()) return { apiKey: "", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { apiKey: "", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" };
    return { apiKey: "", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1", ...JSON.parse(raw) };
  } catch {
    return { apiKey: "", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" };
  }
}

export function getJudgeConfig(): ModelConfig {
  const config = getAppConfig();
  const judge = config.models.find((m) => m.id === config.judgeModelId);
  if (judge) {
    return { apiKey: judge.apiKey, model: judge.model, baseUrl: judge.baseUrl };
  }
  return getModelConfig();
}

export function saveModelConfig(config: ModelConfig): void {
  if (!isBrowser()) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(config));
  // Also update the active model in app config if it exists
  const appConfig = getAppConfig();
  const active = appConfig.models.find((m) => m.id === appConfig.activeModelId);
  if (active) {
    active.apiKey = config.apiKey;
    active.model = config.model;
    active.baseUrl = config.baseUrl;
    saveAppConfig(appConfig);
  }
}

export function isConfigured(): boolean {
  const config = getModelConfig();
  const isLocal = config.baseUrl.includes("localhost") || config.baseUrl.includes("127.0.0.1") || config.baseUrl.includes("0.0.0.0");
  const hasAuth = isLocal || config.apiKey.length > 0;
  return hasAuth && config.model.length > 0 && config.baseUrl.length > 0;
}

export function getActiveModelName(): string {
  const config = getAppConfig();
  const active = config.models.find((m) => m.id === config.activeModelId);
  return active?.name || active?.model || "Not configured";
}

export function getJudgeModelName(): string {
  const config = getAppConfig();
  const judge = config.models.find((m) => m.id === config.judgeModelId);
  return judge?.name || judge?.model || "Same as active";
}
