import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { parallelEval } from "./llm-judge";

interface ClassificationCase {
  text: string;
  expected_label: string;
  labels: string[];
}

function parseLabel(response: string, validLabels: string[]): string {
  const lower = response.toLowerCase().trim();
  for (const label of validLabels) {
    if (lower === label.toLowerCase()) return label;
  }
  for (const label of validLabels) {
    if (lower.includes(label.toLowerCase())) return label;
  }
  return response.trim().split(/\s+/)[0] || "";
}

function computeF1Macro(
  predictions: string[],
  actuals: string[],
  labels: string[]
): number {
  const uniqueLabels = [...new Set(labels)];
  let totalF1 = 0;
  let validLabels = 0;

  for (const label of uniqueLabels) {
    let tp = 0, fp = 0, fn = 0;
    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i].toLowerCase();
      const actual = actuals[i].toLowerCase();
      const l = label.toLowerCase();
      if (pred === l && actual === l) tp++;
      else if (pred === l && actual !== l) fp++;
      else if (pred !== l && actual === l) fn++;
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    if (tp + fp + fn > 0) {
      totalF1 += f1;
      validLabels++;
    }
  }

  return validLabels > 0 ? totalF1 / validLabels : 0;
}

export async function evaluate(
  cases: ClassificationCase[],
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
              content: systemPrompt || `You are a text classifier. Classify the given text into exactly one of these labels: ${tc.labels.join(", ")}.\n\nRespond with ONLY the label, nothing else.`,
            },
            { role: "user", content: tc.text },
          ],
          config,
        });

        const predicted = parseLabel(response.content, tc.labels);
        const isCorrect = predicted.toLowerCase() === tc.expected_label.toLowerCase();

        completed++;
        onProgress(completed, cases.length);

        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: predicted,
            expected: tc.expected_label,
            passed: isCorrect,
            score: isCorrect ? 1 : 0,
            metadata: {
              rawResponse: response.content,
              latency: response.latency,
            },
          } as CaseResult,
          predicted,
          actual: tc.expected_label,
          labels: tc.labels,
        };
      } catch (err) {
        completed++;
        onProgress(completed, cases.length);
        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
            expected: tc.expected_label,
            passed: false,
            score: 0,
          } as CaseResult,
          predicted: "",
          actual: tc.expected_label,
          labels: tc.labels,
        };
      }
    },
    3
  );

  const results = caseResults.map((r) => r.result);
  const predictions = caseResults.map((r) => r.predicted);
  const actuals = caseResults.map((r) => r.actual);
  const allLabels = caseResults.flatMap((r) => r.labels);
  const correct = caseResults.filter((r) => r.result.passed).length;

  const n = cases.length || 1;
  const accuracy = (correct / n) * 100;
  const f1Score = computeF1Macro(predictions, actuals, [...new Set(allLabels)]);

  return {
    metrics: { accuracy, f1Score },
    results,
    passed: accuracy >= 70,
  };
}
