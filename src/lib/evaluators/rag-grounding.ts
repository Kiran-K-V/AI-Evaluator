import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { llmJudge, parallelEval } from "./llm-judge";

interface RAGCase {
  context: string;
  question: string;
  ground_truth: string;
}

const JUDGE_SYSTEM = `You are an expert RAG (Retrieval-Augmented Generation) evaluator. You assess whether an AI model correctly grounded its answer in the provided context.

You will receive:
1. The context provided to the model
2. The question asked
3. The ground truth answer
4. The model's answer

Evaluate on:
- **Grounding**: Is the answer derived from the context, not from external knowledge?
- **Semantic Correctness**: Does the answer convey the same meaning as the ground truth?
- **Context Utilization**: Did the model use relevant parts of the context effectively?
- **No Hallucination**: Did the model avoid adding information not in the context?
- **Appropriate Refusal**: If the context doesn't contain the answer, did the model say so?

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "explanation",
  "confidence": 0.0-1.0,
  "grounded": true/false,
  "context_utilization": 0.0-1.0,
  "semantic_match": 0.0-1.0
}`;

export async function evaluate(
  cases: RAGCase[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void
): Promise<EvaluationResult> {
  let completed = 0;

  const caseResults = await parallelEval(
    cases,
    async (tc) => {
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

        const verdict = await llmJudge(
          config,
          JUDGE_SYSTEM,
          `Context: ${tc.context}\n\nQuestion: ${tc.question}\n\nGround Truth: ${tc.ground_truth}\n\nModel's Answer:\n${response.content}`
        );

        let contextUtil = 0.5;
        let semanticMatch = 0.5;
        try {
          const parsed = JSON.parse(
            (verdict.reasoning.match(/\{[\s\S]*\}/) || ["{}"])[0]
          );
          contextUtil = typeof parsed.context_utilization === "number" ? parsed.context_utilization : verdict.score;
          semanticMatch = typeof parsed.semantic_match === "number" ? parsed.semantic_match : verdict.score;
        } catch {
          contextUtil = verdict.score;
          semanticMatch = verdict.score;
        }

        completed++;
        onProgress(completed, cases.length);

        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: response.content,
            expected: tc.ground_truth,
            passed: verdict.passed,
            score: verdict.score,
            metadata: {
              judgeReasoning: verdict.reasoning,
              semanticScore: semanticMatch,
              contextUtilization: contextUtil,
              latency: response.latency,
            },
          } as CaseResult,
          grounded: verdict.passed,
          contextUtil,
          semanticMatch,
        };
      } catch (err) {
        completed++;
        onProgress(completed, cases.length);
        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
            expected: tc.ground_truth,
            passed: false,
            score: 0,
          } as CaseResult,
          grounded: false,
          contextUtil: 0,
          semanticMatch: 0,
        };
      }
    },
    3
  );

  const results = caseResults.map((r) => r.result);
  const n = cases.length || 1;
  const groundingAccuracy = (caseResults.filter((r) => r.grounded).length / n) * 100;
  const contextUtilization = (caseResults.reduce((s, r) => s + r.contextUtil, 0) / n) * 100;
  const avgSemanticScore = (caseResults.reduce((s, r) => s + r.semanticMatch, 0) / n) * 100;

  return {
    metrics: { groundingAccuracy, contextUtilization, avgSemanticScore },
    results,
    passed: groundingAccuracy >= 80,
  };
}
