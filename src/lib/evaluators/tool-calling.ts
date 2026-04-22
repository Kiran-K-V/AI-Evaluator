import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";

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
  const results: CaseResult[] = [];
  let correctSelections = 0;
  let chainingAttempts = 0;
  let chainingSuccesses = 0;
  let recoveryAttempts = 0;
  let recoverySuccesses = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
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
      if (correct) correctSelections++;

      const hasMultipleTools = (response.toolCalls?.length ?? 0) > 1;
      if (hasMultipleTools) {
        chainingAttempts++;
        chainingSuccesses++;
      }

      if (!correct) {
        recoveryAttempts++;
        if (response.content.toLowerCase().includes(tc.expected_tool.toLowerCase())) {
          recoverySuccesses++;
        }
      }

      results.push({
        input: tc as unknown as Record<string, unknown>,
        modelOutput: calledTool || response.content,
        expected: tc.expected_tool,
        passed: correct,
        score: correct ? 1 : 0,
        metadata: {
          toolCalls: response.toolCalls,
          latency: response.latency,
        },
      });
    } catch (err) {
      results.push({
        input: tc as unknown as Record<string, unknown>,
        modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
        expected: tc.expected_tool,
        passed: false,
        score: 0,
      });
    }

    onProgress(i + 1, cases.length);
  }

  const toolSelectionAccuracy = (correctSelections / cases.length) * 100;
  const toolChainingSuccess = chainingAttempts > 0 ? (chainingSuccesses / chainingAttempts) * 100 : 100;
  const recoverySuccess = recoveryAttempts > 0 ? (recoverySuccesses / recoveryAttempts) * 100 : 100;

  return {
    metrics: {
      toolSelectionAccuracy,
      toolChainingSuccess,
      recoverySuccess,
    },
    results,
    passed: toolSelectionAccuracy >= 80,
  };
}
