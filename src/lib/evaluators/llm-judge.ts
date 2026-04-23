import { callModel } from "@/lib/api";
import type { ModelConfig } from "@/lib/types";

export interface JudgeVerdict {
  passed: boolean;
  score: number;
  reasoning: string;
  confidence: number;
}

export async function llmJudge(
  config: ModelConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<JudgeVerdict> {
  const response = await callModel({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    config,
  });

  try {
    const jsonStr = extractJSON(response.content);
    const parsed = JSON.parse(jsonStr || "{}");
    return {
      passed: Boolean(parsed.passed),
      score: typeof parsed.score === "number" ? parsed.score : (parsed.passed ? 1 : 0),
      reasoning: parsed.reasoning || "",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch {
    const lower = response.content.toLowerCase();
    const passed = lower.includes('"passed": true') || lower.includes('"passed":true') || lower.includes("pass");
    return {
      passed,
      score: passed ? 0.7 : 0.3,
      reasoning: response.content,
      confidence: 0.3,
    };
  }
}

function extractJSON(text: string): string | null {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) return jsonMatch[1].trim();
  const braceMatch = text.match(/(\{[\s\S]*\})/);
  if (braceMatch) return braceMatch[1];
  return text.trim();
}

/**
 * Run tasks in parallel with a concurrency limit.
 * Acts like asyncio.gather but respects a max-concurrency window.
 */
export async function parallelEval<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 3
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
