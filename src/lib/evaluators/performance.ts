import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { parallelEval } from "./llm-judge";

interface PerformanceCase {
  prompt: string;
}

const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "claude-3-5-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  default: { input: 0.001, output: 0.002 },
};

function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = COST_PER_1K_TOKENS[model] ?? COST_PER_1K_TOKENS["default"];
  return (promptTokens / 1000) * pricing.input + (completionTokens / 1000) * pricing.output;
}

export async function evaluate(
  cases: PerformanceCase[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void
): Promise<EvaluationResult> {
  let completed = 0;

  const caseResults = await parallelEval(
    cases,
    async (tc) => {
      try {
        const response = await callModel({
          messages: [{ role: "user", content: tc.prompt }],
          config,
        });

        const latency = response.latency;
        const tokens = response.usage.completion_tokens || 0;
        const cost = estimateCost(
          config.model,
          response.usage.prompt_tokens || 0,
          tokens
        );

        completed++;
        onProgress(completed, cases.length);

        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: response.content.slice(0, 200) + (response.content.length > 200 ? "..." : ""),
            expected: "N/A (performance test)",
            passed: true,
            score: 1,
            metadata: {
              latency: Math.round(latency),
              tokens,
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              cost: cost.toFixed(6),
            },
          } as CaseResult,
          latency,
          tokens,
          cost,
        };
      } catch (err) {
        completed++;
        onProgress(completed, cases.length);
        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
            expected: "N/A",
            passed: false,
            score: 0,
          } as CaseResult,
          latency: 0,
          tokens: 0,
          cost: 0,
        };
      }
    },
    2
  );

  const results = caseResults.map((r) => r.result);
  const n = cases.length || 1;
  const totalLatency = caseResults.reduce((s, r) => s + r.latency, 0);
  const totalTokens = caseResults.reduce((s, r) => s + r.tokens, 0);
  const totalCost = caseResults.reduce((s, r) => s + r.cost, 0);

  return {
    metrics: {
      avgTTFT: Math.round(totalLatency / n),
      avgResponseTime: Math.round(totalLatency / n),
      avgTokens: Math.round(totalTokens / n),
      estimatedCost: totalCost,
    },
    results,
    passed: true,
  };
}
