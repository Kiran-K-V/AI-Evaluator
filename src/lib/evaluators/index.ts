import type { ModuleSlug, ModelConfig, EvaluationResult } from "@/lib/types";

export async function runEvaluation(
  module: ModuleSlug,
  cases: unknown[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void,
  systemPrompt?: string
): Promise<EvaluationResult> {
  switch (module) {
    case "tool-calling": {
      const { evaluate } = await import("./tool-calling");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    case "hallucination": {
      const { evaluate } = await import("./hallucination");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    case "contextual-intelligence": {
      const { evaluate } = await import("./contextual-intelligence");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    case "safety": {
      const { evaluate } = await import("./safety");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    case "structured-output": {
      const { evaluate } = await import("./structured-output");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    case "classification": {
      const { evaluate } = await import("./classification");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    case "performance": {
      const { evaluate } = await import("./performance");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    case "domain-knowledge": {
      const { evaluate } = await import("./domain-knowledge");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    case "consistency": {
      const { evaluate } = await import("./consistency");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    case "summarization": {
      const { evaluate } = await import("./summarization");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evaluate(cases as any, config, onProgress, systemPrompt);
    }
    default:
      throw new Error(`Unknown evaluation module: ${module}`);
  }
}
