import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { llmJudge, parallelEval } from "./llm-judge";

interface DomainKnowledgeCase {
  question: string;
  domain: string;
  difficulty: string;
}

const JUDGE_SYSTEM = `You are an expert evaluator assessing AI model answers for factual accuracy across professional domains (Health, Finance, Law).

You will receive:
1. The domain and difficulty level
2. The question asked
3. The model's answer

Evaluate the answer on these criteria:
- **Factual Accuracy**: Are the stated facts, figures, mechanisms, and legal/financial principles correct?
- **Completeness**: Does it address all parts of the question?
- **Precision**: Does it avoid vague or generic statements when specifics are required?
- **No Hallucination**: Does it avoid fabricating data, citations, or details?

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "Brief explanation of your assessment",
  "confidence": 0.0-1.0,
  "factual_errors": ["list any factual errors found, or empty array"],
  "completeness": "complete" | "partial" | "insufficient"
}

Be strict. Domain experts would review these answers. A score >= 0.6 means the answer is broadly correct and useful. Below 0.6 means materially wrong or dangerously incomplete.`;

export async function evaluate(
  cases: DomainKnowledgeCase[],
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
              content: `You are a knowledgeable expert. Answer the following ${tc.domain} question with precision and depth. Provide specific details, mechanisms, figures, and references where applicable. If you are unsure about something, say so rather than guessing.`,
            },
            { role: "user", content: tc.question },
          ],
          config,
        });

        const verdict = await llmJudge(
          config,
          JUDGE_SYSTEM,
          `Domain: ${tc.domain}\nDifficulty: ${tc.difficulty}\n\nQuestion: ${tc.question}\n\nModel's Answer:\n${response.content}`
        );

        completed++;
        onProgress(completed, cases.length);

        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: response.content,
            expected: `Expert-level ${tc.domain} answer (LLM-judged)`,
            passed: verdict.passed,
            score: verdict.score,
            metadata: {
              domain: tc.domain,
              difficulty: tc.difficulty,
              judgeReasoning: verdict.reasoning,
              judgeConfidence: verdict.confidence,
              latency: response.latency,
            },
          } as CaseResult,
          domain: tc.domain,
          confidence: verdict.confidence,
        };
      } catch (err) {
        completed++;
        onProgress(completed, cases.length);
        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
            expected: `Expert-level ${tc.domain} answer`,
            passed: false,
            score: 0,
          } as CaseResult,
          domain: tc.domain,
          confidence: 0,
        };
      }
    },
    3
  );

  const results = caseResults.map((r) => r.result);
  const domainScores: Record<string, { total: number; count: number }> = {};
  let totalConfidence = 0;

  for (const cr of caseResults) {
    if (!domainScores[cr.domain]) {
      domainScores[cr.domain] = { total: 0, count: 0 };
    }
    domainScores[cr.domain].total += cr.result.score ?? 0;
    domainScores[cr.domain].count++;
    totalConfidence += cr.confidence;
  }

  const domainAccuracy = (domain: string) => {
    const d = domainScores[domain];
    return d ? (d.total / d.count) * 100 : 0;
  };

  const overallAccuracy =
    cases.length > 0
      ? (results.reduce((s, r) => s + (r.score ?? 0), 0) / cases.length) * 100
      : 0;
  const avgConfidence =
    cases.length > 0 ? (totalConfidence / cases.length) * 100 : 0;

  return {
    metrics: {
      overallAccuracy,
      healthAccuracy: domainAccuracy("health"),
      financeAccuracy: domainAccuracy("finance"),
      lawAccuracy: domainAccuracy("law"),
      avgConfidence,
    },
    results,
    passed: overallAccuracy >= 60,
  };
}
