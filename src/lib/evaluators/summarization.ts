import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { llmJudge, parallelEval } from "./llm-judge";

interface SummarizationCase {
  source: string;
  instruction: string;
  category: string;
}

const JUDGE_SYSTEM = `You are an expert summarization quality evaluator. You assess AI-generated summaries against their source text.

You will receive:
1. The original source text
2. The summarization instruction
3. The model's summary

Evaluate on four dimensions:
- **Faithfulness** (0.0-1.0): Does the summary only contain information from the source? Any fabricated details = low score.
- **Coverage** (0.0-1.0): Does the summary capture all important points from the source? Missing key information = low score.
- **Conciseness** (0.0-1.0): Is the summary appropriately brief without unnecessary repetition or filler? Overly verbose = low score.
- **Overall Quality** (0.0-1.0): Holistic assessment — would a professional accept this summary?

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0,
  "faithfulness": 0.0-1.0,
  "coverage": 0.0-1.0,
  "conciseness": 0.0-1.0
}

A score >= 0.7 means the summary is professionally acceptable.`;

export async function evaluate(
  cases: SummarizationCase[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void,
  systemPrompt?: string
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
              content: systemPrompt || "You are a skilled summarizer. Follow the instruction precisely. Be faithful to the source material — do not add information not present in the original text.",
            },
            {
              role: "user",
              content: `${tc.instruction}\n\nSource text:\n${tc.source}`,
            },
          ],
          config,
        });

        const verdict = await llmJudge(
          config,
          JUDGE_SYSTEM,
          `Source text:\n${tc.source}\n\nInstruction: ${tc.instruction}\n\nModel's summary:\n${response.content}`
        );

        let faithfulness = verdict.score;
        let coverage = verdict.score;
        let conciseness = verdict.score;
        try {
          const match = verdict.reasoning.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            faithfulness = typeof parsed.faithfulness === "number" ? parsed.faithfulness : verdict.score;
            coverage = typeof parsed.coverage === "number" ? parsed.coverage : verdict.score;
            conciseness = typeof parsed.conciseness === "number" ? parsed.conciseness : verdict.score;
          }
        } catch { /* use defaults */ }

        completed++;
        onProgress(completed, cases.length);

        return {
          result: {
            input: { instruction: tc.instruction, category: tc.category, source: tc.source.slice(0, 150) + "..." },
            modelOutput: response.content,
            expected: `High-quality ${tc.category} summary`,
            passed: verdict.passed,
            score: verdict.score,
            metadata: {
              category: tc.category,
              judgeReasoning: verdict.reasoning,
              judgeConfidence: verdict.confidence,
              faithfulness,
              coverage,
              conciseness,
              latency: response.latency,
            },
          } as CaseResult,
          faithfulness,
          coverage,
          conciseness,
          overallQuality: verdict.score,
        };
      } catch (err) {
        completed++;
        onProgress(completed, cases.length);
        return {
          result: {
            input: { instruction: tc.instruction, category: tc.category },
            modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
            expected: `High-quality ${tc.category} summary`,
            passed: false,
            score: 0,
          } as CaseResult,
          faithfulness: 0,
          coverage: 0,
          conciseness: 0,
          overallQuality: 0,
        };
      }
    },
    3
  );

  const results = caseResults.map((r) => r.result);
  const n = cases.length || 1;

  const faithfulness = (caseResults.reduce((s, r) => s + r.faithfulness, 0) / n) * 100;
  const coverage = (caseResults.reduce((s, r) => s + r.coverage, 0) / n) * 100;
  const conciseness = (caseResults.reduce((s, r) => s + r.conciseness, 0) / n) * 100;
  const overallQuality = (caseResults.reduce((s, r) => s + r.overallQuality, 0) / n) * 100;

  return {
    metrics: { faithfulness, coverage, conciseness, overallQuality },
    results,
    passed: overallQuality >= 70,
  };
}
