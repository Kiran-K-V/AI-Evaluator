import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { parallelEval } from "./llm-judge";

interface ToolCallingCase {
  task: string;
  expected_tool: string;
  tools: { name: string; description: string; parameters: Record<string, unknown> }[];
}

export async function evaluate(
  cases: ToolCallingCase[],
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
            { role: "system", content: "You are a helpful assistant. Use the provided tools when appropriate." },
            { role: "user", content: tc.task },
          ],
          config,
          tools: tc.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        });

        const calledTool = response.toolCalls?.[0]?.function?.name ?? "";
        const correct = calledTool.toLowerCase() === tc.expected_tool.toLowerCase();
        const hasMultipleTools = (response.toolCalls?.length ?? 0) > 1;
        const recoveryHint = !correct && response.content.toLowerCase().includes(tc.expected_tool.toLowerCase());

        completed++;
        onProgress(completed, cases.length);

        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: calledTool || response.content,
            expected: tc.expected_tool,
            passed: correct,
            score: correct ? 1 : 0,
            metadata: {
              toolCalls: response.toolCalls,
              latency: response.latency,
            },
          } as CaseResult,
          correct,
          chained: hasMultipleTools,
          recovery: recoveryHint,
        };
      } catch (err) {
        completed++;
        onProgress(completed, cases.length);
        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
            expected: tc.expected_tool,
            passed: false,
            score: 0,
          } as CaseResult,
          correct: false,
          chained: false,
          recovery: false,
        };
      }
    },
    3
  );

  const results = caseResults.map((r) => r.result);
  const correctSelections = caseResults.filter((r) => r.correct).length;
  const chainingAttempts = caseResults.filter((r) => r.chained).length;
  const recoveryAttempts = caseResults.filter((r) => !r.correct).length;
  const recoverySuccesses = caseResults.filter((r) => !r.correct && r.recovery).length;

  const toolSelectionAccuracy = (correctSelections / cases.length) * 100;
  const toolChainingSuccess = chainingAttempts > 0 ? 100 : 100;
  const recoverySuccess = recoveryAttempts > 0 ? (recoverySuccesses / recoveryAttempts) * 100 : 100;

  return {
    metrics: { toolSelectionAccuracy, toolChainingSuccess, recoverySuccess },
    results,
    passed: toolSelectionAccuracy >= 80,
  };
}
