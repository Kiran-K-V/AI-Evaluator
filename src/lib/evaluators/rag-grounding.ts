import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";

interface RAGCase {
  context: string;
  question: string;
  ground_truth: string;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 1)
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function contextOverlap(answer: string, context: string): number {
  const answerTokens = tokenize(answer);
  const contextTokens = tokenize(context);
  if (answerTokens.size === 0) return 0;

  let fromContext = 0;
  for (const token of answerTokens) {
    if (contextTokens.has(token)) fromContext++;
  }
  return fromContext / answerTokens.size;
}

export async function evaluate(
  cases: RAGCase[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void
): Promise<EvaluationResult> {
  const results: CaseResult[] = [];
  let totalSemantic = 0;
  let totalGrounding = 0;
  let totalContextUtil = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];

    try {
      const response = await callModel({
        messages: [
          {
            role: "system",
            content: `Answer the question using ONLY the provided context. Be concise.\n\nContext: ${tc.context}`,
          },
          { role: "user", content: tc.question },
        ],
        config,
      });

      const semanticScore = jaccardSimilarity(response.content, tc.ground_truth);
      const ctxUtil = contextOverlap(response.content, tc.context);
      const grounded = semanticScore >= 0.3;

      totalSemantic += semanticScore;
      totalGrounding += grounded ? 1 : 0;
      totalContextUtil += ctxUtil;

      results.push({
        input: tc as unknown as Record<string, unknown>,
        modelOutput: response.content,
        expected: tc.ground_truth,
        passed: grounded,
        score: semanticScore,
        metadata: {
          semanticScore,
          contextUtilization: ctxUtil,
          latency: response.latency,
        },
      });
    } catch (err) {
      results.push({
        input: tc as unknown as Record<string, unknown>,
        modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
        expected: tc.ground_truth,
        passed: false,
        score: 0,
      });
    }

    onProgress(i + 1, cases.length);
  }

  const n = cases.length || 1;
  const groundingAccuracy = (totalGrounding / n) * 100;
  const contextUtilization = (totalContextUtil / n) * 100;
  const avgSemanticScore = (totalSemantic / n) * 100;

  return {
    metrics: {
      groundingAccuracy,
      contextUtilization,
      avgSemanticScore,
    },
    results,
    passed: groundingAccuracy >= 80,
  };
}
