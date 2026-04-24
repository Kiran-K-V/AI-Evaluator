export type ModuleSlug =
  | "tool-calling"
  | "hallucination"
  | "contextual-intelligence"
  | "safety"
  | "structured-output"
  | "classification"
  | "performance"
  | "domain-knowledge"
  | "consistency"
  | "summarization";

/** Legacy slugs kept for backward-compatible storage lookups. */
export type LegacyModuleSlug = "rag-grounding" | "deepeval";

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ModelConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface AppConfig {
  models: ModelEntry[];
  activeModelId: string;
  judgeModelId: string;
}

export interface CaseResult {
  input: Record<string, unknown>;
  modelOutput: string;
  expected: string;
  passed: boolean;
  score?: number;
  metadata?: Record<string, unknown>;
}

export type RunType = "single" | "batch" | "arena";

export interface EvaluationRun {
  id: string;
  module: ModuleSlug;
  timestamp: string;
  metrics: Record<string, number>;
  cases: CaseResult[];
  passed: boolean;
  modelConfig: { model: string; baseUrl: string };
  runType?: RunType;
  /** Groups batch / arena runs so the results page can cluster them. */
  groupId?: string;
  /** Human-readable label for the group (e.g. "Arena: gpt-4o vs claude-3.5"). */
  groupLabel?: string;
  /** Freeform tags attached to the model (provider, size, etc.). */
  tags?: string[];
}

export interface EvaluationResult {
  metrics: Record<string, number>;
  results: CaseResult[];
  passed: boolean;
}

export interface ModuleInfo {
  slug: ModuleSlug;
  name: string;
  description: string;
  icon: string;
  sampleInput: unknown[];
  metricDefinitions: MetricDefinition[];
}

export interface MetricDefinition {
  key: string;
  label: string;
  unit: string;
  passThreshold?: number;
  higherIsBetter: boolean;
}

export interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

export interface ApiResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  latency: number;
  toolCalls?: ToolCall[];
  /** Finish reason from the API (e.g. "stop", "tool_calls"). */
  finishReason?: string;
}
