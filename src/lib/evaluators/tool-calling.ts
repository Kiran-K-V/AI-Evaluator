import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { parallelEval } from "./llm-judge";

interface ToolCallingCase {
  task: string;
  expected_tool: string | string[];
  tools: { name: string; description: string; parameters: Record<string, unknown> }[];
}

function normalizeExpectedTools(expected: string | string[]): string[] {
  if (Array.isArray(expected)) return expected.map((t) => t.toLowerCase());
  return [expected.toLowerCase()];
}

export async function evaluate(
  cases: ToolCallingCase[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void,
  systemPrompt?: string
): Promise<EvaluationResult> {
  let completed = 0;

  const caseResults = await parallelEval(
    cases,
    async (tc) => {
      try {
        const expectedTools = normalizeExpectedTools(tc.expected_tool);
        const isMultiTool = expectedTools.length > 1;

        const response = await callModel({
          messages: [
            { role: "system", content: systemPrompt || "You are a helpful assistant. Use the provided tools when appropriate. If a task requires multiple tools, call ALL necessary tools." },
            { role: "user", content: tc.task },
          ],
          config,
          tools: tc.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        });

        const calledTools = (response.toolCalls || []).map((tc) => tc.function?.name?.toLowerCase() ?? "");
        const calledToolsSet = new Set(calledTools);

        let correct: boolean;
        let chainingCorrect: boolean;
        let extraToolsCalled: string[];

        if (isMultiTool) {
          const allExpectedCalled = expectedTools.every((t) => calledToolsSet.has(t));
          extraToolsCalled = calledTools.filter((t) => !expectedTools.includes(t));
          correct = allExpectedCalled;
          chainingCorrect = allExpectedCalled && extraToolsCalled.length === 0;
        } else {
          const firstCalled = calledTools[0] ?? "";
          correct = firstCalled === expectedTools[0];
          extraToolsCalled = calledTools.slice(1);
          chainingCorrect = correct && calledTools.length <= 1;
        }

        const recoveryHint = !correct && expectedTools.some((t) => response.content.toLowerCase().includes(t));

        const score = isMultiTool
          ? (expectedTools.filter((t) => calledToolsSet.has(t)).length / expectedTools.length) * (extraToolsCalled.length === 0 ? 1 : 0.8)
          : correct ? 1 : 0;

        completed++;
        onProgress(completed, cases.length);

        const expectedLabel = Array.isArray(tc.expected_tool) ? tc.expected_tool.join(" + ") : tc.expected_tool;
        const calledLabel = calledTools.length > 0 ? calledTools.join(" + ") : response.content;

        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: calledLabel,
            expected: expectedLabel,
            passed: correct,
            score,
            metadata: {
              toolCalls: response.toolCalls,
              calledTools,
              expectedTools,
              extraToolsCalled,
              isMultiTool,
              chainingCorrect,
              latency: response.latency,
            },
          } as CaseResult,
          correct,
          chained: calledTools.length > 1,
          chainingCorrect,
          isMultiTool,
          recovery: recoveryHint,
        };
      } catch (err) {
        completed++;
        onProgress(completed, cases.length);
        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
            expected: Array.isArray(tc.expected_tool) ? tc.expected_tool.join(" + ") : tc.expected_tool,
            passed: false,
            score: 0,
          } as CaseResult,
          correct: false,
          chained: false,
          chainingCorrect: false,
          isMultiTool: Array.isArray(tc.expected_tool) && tc.expected_tool.length > 1,
          recovery: false,
        };
      }
    },
    3
  );

  const results = caseResults.map((r) => r.result);
  const correctSelections = caseResults.filter((r) => r.correct).length;
  const multiToolCases = caseResults.filter((r) => r.isMultiTool);
  const multiToolCorrect = multiToolCases.filter((r) => r.chainingCorrect).length;
  const recoveryAttempts = caseResults.filter((r) => !r.correct).length;
  const recoverySuccesses = caseResults.filter((r) => !r.correct && r.recovery).length;

  const toolSelectionAccuracy = (correctSelections / cases.length) * 100;
  const toolChainingSuccess = multiToolCases.length > 0
    ? (multiToolCorrect / multiToolCases.length) * 100
    : 100;
  const recoverySuccess = recoveryAttempts > 0 ? (recoverySuccesses / recoveryAttempts) * 100 : 100;

  return {
    metrics: { toolSelectionAccuracy, toolChainingSuccess, recoverySuccess },
    results,
    passed: toolSelectionAccuracy >= 80,
  };
}
