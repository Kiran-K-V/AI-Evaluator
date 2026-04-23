import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { llmJudge, parallelEval } from "./llm-judge";

interface ConsistencyCase {
  prompt: string;
  runs: number;
  category: string;
}

const JUDGE_SYSTEM = `You are an expert consistency evaluator. You will receive multiple responses from the same AI model to the exact same question, and you must assess how consistent they are.

Evaluate on:
- **Factual Consistency**: Do all responses state the same core facts, numbers, and claims? Contradictions on factual matters are severe.
- **Semantic Stability**: Do the responses convey the same meaning, even if worded differently?
- **Contradiction Detection**: Are there any direct contradictions between responses?
- **Acceptable Variance**: For opinion/creative prompts, some variance in framing is acceptable. For factual/technical prompts, answers should be nearly identical in substance.

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "explanation of consistency analysis",
  "confidence": 0.0-1.0,
  "factual_consistency": 0.0-1.0,
  "semantic_stability": 0.0-1.0,
  "contradictions_found": ["list any contradictions between responses, or empty array"]
}

A score >= 0.7 means the responses are substantively consistent. Below that means concerning variance.`;

export async function evaluate(
  cases: ConsistencyCase[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void,
  systemPrompt?: string
): Promise<EvaluationResult> {
  let completed = 0;
  const totalWork = cases.reduce((s, c) => s + c.runs, 0) + cases.length;

  const caseResults = await parallelEval(
    cases,
    async (tc) => {
      const numRuns = tc.runs || 5;
      const responses: string[] = [];

      for (let r = 0; r < numRuns; r++) {
        try {
          const response = await callModel({
            messages: [
              ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
              { role: "user" as const, content: tc.prompt },
            ],
            config,
          });
          responses.push(response.content);
        } catch (err) {
          responses.push(`[Error: ${err instanceof Error ? err.message : String(err)}]`);
        }
        completed++;
        onProgress(completed, totalWork);
      }

      try {
        const formattedResponses = responses
          .map((r, i) => `--- Response ${i + 1} ---\n${r}`)
          .join("\n\n");

        const verdict = await llmJudge(
          config,
          JUDGE_SYSTEM,
          `Category: ${tc.category}\nNumber of runs: ${numRuns}\n\nPrompt: ${tc.prompt}\n\n${formattedResponses}`
        );

        let factualConsistency = verdict.score;
        let semanticStability = verdict.score;
        try {
          const match = verdict.reasoning.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            factualConsistency = typeof parsed.factual_consistency === "number" ? parsed.factual_consistency : verdict.score;
            semanticStability = typeof parsed.semantic_stability === "number" ? parsed.semantic_stability : verdict.score;
          }
        } catch { /* use defaults */ }

        completed++;
        onProgress(completed, totalWork);

        return {
          result: {
            input: { prompt: tc.prompt, category: tc.category, runs: numRuns },
            modelOutput: `${numRuns} responses collected. Sample:\n${responses[0]?.slice(0, 200)}...`,
            expected: "Consistent responses across all runs",
            passed: verdict.passed,
            score: verdict.score,
            metadata: {
              category: tc.category,
              numRuns,
              judgeReasoning: verdict.reasoning,
              judgeConfidence: verdict.confidence,
              factualConsistency,
              semanticStability,
              allResponses: responses.map((r) => r.slice(0, 300)),
            },
          } as CaseResult,
          category: tc.category,
          factualConsistency,
          semanticStability,
          contradictions: verdict.score < 0.5 ? 1 : 0,
        };
      } catch (err) {
        completed++;
        onProgress(completed, totalWork);
        return {
          result: {
            input: { prompt: tc.prompt, category: tc.category, runs: numRuns },
            modelOutput: `Error during judging: ${err instanceof Error ? err.message : String(err)}`,
            expected: "Consistent responses across all runs",
            passed: false,
            score: 0,
          } as CaseResult,
          category: tc.category,
          factualConsistency: 0,
          semanticStability: 0,
          contradictions: 1,
        };
      }
    },
    2
  );

  const results = caseResults.map((r) => r.result);
  const n = cases.length || 1;

  const overallConsistency = (caseResults.reduce((s, r) => s + (r.result.score ?? 0), 0) / n) * 100;
  const factualConsistency = (caseResults.reduce((s, r) => s + r.factualConsistency, 0) / n) * 100;
  const semanticStability = (caseResults.reduce((s, r) => s + r.semanticStability, 0) / n) * 100;
  const contradictionRate = (caseResults.reduce((s, r) => s + r.contradictions, 0) / n) * 100;

  return {
    metrics: { overallConsistency, factualConsistency, semanticStability, contradictionRate },
    results,
    passed: overallConsistency >= 70 && contradictionRate <= 20,
  };
}
