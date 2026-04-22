export type ModuleSlug =
  | "tool-calling"
  | "hallucination"
  | "rag-grounding"
  | "safety"
  | "structured-output"
  | "classification"
  | "performance";

export interface ModelConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface CaseResult {
  input: Record<string, unknown>;
  modelOutput: string;
  expected: string;
  passed: boolean;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface EvaluationRun {
  id: string;
  module: ModuleSlug;
  timestamp: string;
  metrics: Record<string, number>;
  cases: CaseResult[];
  passed: boolean;
  modelConfig: { model: string; baseUrl: string };
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

export interface ApiResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  latency: number;
  toolCalls?: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }[];
}
