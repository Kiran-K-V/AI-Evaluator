import { callModel } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult, ToolCall } from "@/lib/types";
import { parallelEval } from "./llm-judge";

const NO_TOOL_SENTINEL = "no_tool_needed";
const MAX_TOOL_TURNS = 3;

interface ExpectedArguments {
  [key: string]: string | number | boolean | null;
}

interface ToolCallingCase {
  task: string;
  expected_tool: string | string[];
  tools: { name: string; description: string; parameters: Record<string, unknown> }[];
  expected_arguments?: Record<string, ExpectedArguments>;
  /** Simulated tool results keyed by tool name. Used for multi-turn evaluation. */
  tool_results?: Record<string, string>;
}

function normalizeExpectedTools(expected: string | string[]): string[] {
  if (Array.isArray(expected)) return expected.map((t) => t.toLowerCase());
  return [expected.toLowerCase()];
}

/**
 * Validate that the called arguments contain the expected key-value pairs.
 * Returns a score between 0 and 1 based on the fraction of matching fields.
 */
function validateArguments(
  calledArgs: string,
  expected: ExpectedArguments
): { score: number; matchedKeys: string[]; missingKeys: string[]; wrongKeys: string[] } {
  const expectedKeys = Object.keys(expected);
  if (expectedKeys.length === 0) return { score: 1, matchedKeys: [], missingKeys: [], wrongKeys: [] };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(calledArgs);
  } catch {
    return { score: 0, matchedKeys: [], missingKeys: expectedKeys, wrongKeys: [] };
  }

  const matchedKeys: string[] = [];
  const missingKeys: string[] = [];
  const wrongKeys: string[] = [];

  for (const key of expectedKeys) {
    if (!(key in parsed)) {
      missingKeys.push(key);
    } else {
      const expectedVal = expected[key];
      const actualVal = parsed[key];

      if (typeof expectedVal === "string" && typeof actualVal === "string") {
        if (actualVal.toLowerCase().includes(expectedVal.toLowerCase())) {
          matchedKeys.push(key);
        } else {
          wrongKeys.push(key);
        }
      } else if (expectedVal === actualVal) {
        matchedKeys.push(key);
      } else {
        wrongKeys.push(key);
      }
    }
  }

  const score = expectedKeys.length > 0 ? matchedKeys.length / expectedKeys.length : 1;
  return { score, matchedKeys, missingKeys, wrongKeys };
}

/**
 * Build a simulated tool result for a given tool call.
 * If the case provides explicit tool_results, use those.
 * Otherwise return a generic acknowledgment so the model can continue its turn.
 */
function simulateToolResult(toolName: string, toolResults?: Record<string, string>): string {
  if (toolResults && toolResults[toolName]) {
    return toolResults[toolName];
  }
  return JSON.stringify({ status: "success", result: `Executed ${toolName} successfully.` });
}

/**
 * Run a multi-turn tool-calling loop. The model is called, and if it returns
 * tool_calls, we append the assistant message + simulated tool results and
 * call again, up to MAX_TOOL_TURNS rounds.
 *
 * Returns all tool calls accumulated across turns and the total latency.
 */
async function multiTurnToolLoop(
  messages: ChatMessage[],
  config: ModelConfig,
  tools: Record<string, unknown>[],
  toolResults?: Record<string, string>,
): Promise<{ allToolCalls: ToolCall[]; content: string; totalLatency: number; turns: number }> {
  const allToolCalls: ToolCall[] = [];
  let currentMessages = [...messages];
  let totalLatency = 0;
  let finalContent = "";
  let turns = 0;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await callModel({
      messages: currentMessages,
      config,
      tools,
    });

    totalLatency += response.latency;
    turns++;

    const turnToolCalls = response.toolCalls || [];
    if (turnToolCalls.length === 0) {
      finalContent = response.content;
      break;
    }

    allToolCalls.push(...turnToolCalls);

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: response.content || null,
      tool_calls: turnToolCalls,
    };
    currentMessages = [...currentMessages, assistantMsg];

    for (const tc of turnToolCalls) {
      const toolResultMsg: ChatMessage = {
        role: "tool",
        tool_call_id: tc.id,
        content: simulateToolResult(tc.function.name, toolResults),
      };
      currentMessages = [...currentMessages, toolResultMsg];
    }

    finalContent = response.content;
  }

  return { allToolCalls, content: finalContent, totalLatency, turns };
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
        const expectsNoTool = expectedTools.length === 1 && expectedTools[0] === NO_TOOL_SENTINEL;
        const hasToolResults = tc.tool_results && Object.keys(tc.tool_results).length > 0;

        const initialMessages: ChatMessage[] = [
          {
            role: "system",
            content: systemPrompt || "You are a helpful assistant. Use the provided tools when appropriate. If a task requires multiple tools, call ALL necessary tools. If no tool is needed, respond directly without calling any tool.",
          },
          { role: "user", content: tc.task },
        ];

        const toolDefs = tc.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }));

        let calledTools: string[];
        let allToolCalls: ToolCall[];
        let responseContent: string;
        let totalLatency: number;
        let turns: number;

        if (hasToolResults || isMultiTool) {
          const loopResult = await multiTurnToolLoop(
            initialMessages, config, toolDefs, tc.tool_results,
          );
          allToolCalls = loopResult.allToolCalls;
          calledTools = allToolCalls.map((t) => t.function?.name?.toLowerCase() ?? "");
          responseContent = loopResult.content;
          totalLatency = loopResult.totalLatency;
          turns = loopResult.turns;
        } else {
          const response = await callModel({
            messages: initialMessages,
            config,
            tools: toolDefs,
          });
          allToolCalls = response.toolCalls || [];
          calledTools = allToolCalls.map((t) => t.function?.name?.toLowerCase() ?? "");
          responseContent = response.content;
          totalLatency = response.latency;
          turns = 1;
        }

        const calledToolsSet = new Set(calledTools);

        let correct: boolean;
        let chainingCorrect: boolean;
        let extraToolsCalled: string[];

        if (expectsNoTool) {
          // Model correctly avoided tools: empty tool_calls OR called the no_tool_needed sentinel
          const noToolsCalled = calledTools.length === 0;
          const calledSentinel = calledToolsSet.has(NO_TOOL_SENTINEL);
          correct = noToolsCalled || calledSentinel;
          extraToolsCalled = calledTools.filter((t) => t !== NO_TOOL_SENTINEL);
          chainingCorrect = correct && extraToolsCalled.length === 0;
        } else if (isMultiTool) {
          const allExpectedCalled = expectedTools.every((t) => calledToolsSet.has(t));
          extraToolsCalled = calledTools.filter((t) => !expectedTools.includes(t));
          correct = allExpectedCalled;
          chainingCorrect = allExpectedCalled && extraToolsCalled.length === 0;
        } else {
          const matchedAny = calledTools.some((t) => t === expectedTools[0]);
          const firstCalled = calledTools[0] ?? "";
          correct = firstCalled === expectedTools[0] || matchedAny;
          extraToolsCalled = calledTools.filter((t) => t !== expectedTools[0]);
          chainingCorrect = correct && extraToolsCalled.length === 0;
        }

        // --- Argument validation ---
        let argumentScore = 1;
        let argumentDetails: Record<string, unknown> = {};
        if (tc.expected_arguments && allToolCalls.length > 0) {
          const perToolScores: { tool: string; score: number; details: Record<string, unknown> }[] = [];
          for (const toolCall of allToolCalls) {
            const toolName = toolCall.function?.name?.toLowerCase() ?? "";
            const expectedArgs = tc.expected_arguments[toolName];
            if (expectedArgs) {
              const validation = validateArguments(toolCall.function.arguments, expectedArgs);
              perToolScores.push({ tool: toolName, score: validation.score, details: validation });
            }
          }
          if (perToolScores.length > 0) {
            argumentScore = perToolScores.reduce((sum, s) => sum + s.score, 0) / perToolScores.length;
            argumentDetails = { perTool: perToolScores };
          }
        }

        // --- Scoring ---
        let selectionScore: number;
        if (expectsNoTool) {
          selectionScore = correct ? 1 : 0;
        } else if (isMultiTool) {
          const proportionFound = expectedTools.filter((t) => calledToolsSet.has(t)).length / expectedTools.length;
          selectionScore = proportionFound * (extraToolsCalled.length === 0 ? 1 : 0.8);
        } else {
          selectionScore = correct ? 1 : 0;
        }

        const combinedScore = tc.expected_arguments
          ? selectionScore * 0.6 + argumentScore * 0.4
          : selectionScore;

        completed++;
        onProgress(completed, cases.length);

        const expectedLabel = expectsNoTool
          ? "no_tool_needed (or direct response)"
          : Array.isArray(tc.expected_tool) ? tc.expected_tool.join(" + ") : tc.expected_tool;

        const calledLabel = calledTools.length > 0
          ? calledTools.join(" + ")
          : (expectsNoTool ? "[direct response — correct]" : responseContent);

        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: calledLabel,
            expected: expectedLabel,
            passed: correct,
            score: combinedScore,
            metadata: {
              toolCalls: allToolCalls,
              calledTools,
              expectedTools,
              extraToolsCalled,
              isMultiTool,
              expectsNoTool,
              chainingCorrect,
              argumentScore,
              argumentDetails,
              latency: totalLatency,
              turns,
            },
          } as CaseResult,
          correct,
          chained: calledTools.length > 1,
          chainingCorrect,
          isMultiTool,
          expectsNoTool,
          argumentScore,
          hasExpectedArgs: !!tc.expected_arguments,
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
          expectsNoTool: false,
          argumentScore: 0,
          hasExpectedArgs: !!tc.expected_arguments,
        };
      }
    },
    3
  );

  const results = caseResults.map((r) => r.result);
  const correctSelections = caseResults.filter((r) => r.correct).length;
  const multiToolCases = caseResults.filter((r) => r.isMultiTool);
  const multiToolCorrect = multiToolCases.filter((r) => r.chainingCorrect).length;

  const casesWithArgs = caseResults.filter((r) => r.hasExpectedArgs);
  const avgArgumentAccuracy = casesWithArgs.length > 0
    ? (casesWithArgs.reduce((sum, r) => sum + r.argumentScore, 0) / casesWithArgs.length) * 100
    : 100;

  const noToolCases = caseResults.filter((r) => r.expectsNoTool);
  const noToolCorrect = noToolCases.filter((r) => r.correct).length;
  const noToolAccuracy = noToolCases.length > 0
    ? (noToolCorrect / noToolCases.length) * 100
    : 100;

  const toolSelectionAccuracy = (correctSelections / cases.length) * 100;
  const toolChainingSuccess = multiToolCases.length > 0
    ? (multiToolCorrect / multiToolCases.length) * 100
    : 100;

  return {
    metrics: {
      toolSelectionAccuracy,
      toolChainingSuccess,
      argumentAccuracy: avgArgumentAccuracy,
      noToolAccuracy,
    },
    results,
    passed: toolSelectionAccuracy >= 80,
  };
}
