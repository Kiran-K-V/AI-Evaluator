import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { llmJudge, parallelEval } from "./llm-judge";

/**
 * Unified evaluator combining hallucination detection, RAG grounding, and
 * deep-eval style multi-judge scoring into a single "Contextual Intelligence"
 * module. Each case can be a hallucination-style prompt (question + optional
 * context), a RAG case (context + question + ground_truth), or a full
 * deep-eval case (query + context[] + expected_answer).
 */

interface CICase {
  question?: string;
  query?: string;
  context?: string | string[];
  ground_truth?: string;
  expected_answer?: string;
  response?: string;
  system_prompt?: string;
}

const GROUNDING_JUDGE = `You are an expert evaluator assessing whether an AI model grounded its answer correctly.

You will receive: the context, the question, the expected answer (if any), and the model's response.

Evaluate:
- **Grounding**: Is the answer derived from context, not external knowledge?
- **Faithfulness**: Are all claims supported by the provided context?
- **Context Utilization**: Did the model use relevant parts of the context?
- **Hallucination**: Did the model fabricate facts not in the context?
- **Appropriate Refusal**: If context is missing/irrelevant, did the model refuse or express uncertainty?
- **Answer Relevancy**: Does the response actually address the question?

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "explanation",
  "confidence": 0.0-1.0,
  "grounded": true/false,
  "hallucinated": true/false,
  "correctly_refused": true/false,
  "faithfulness": 0.0-1.0,
  "context_utilization": 0.0-1.0,
  "answer_relevancy": 0.0-1.0
}

"passed" = true means the model behaved correctly overall.`;

const PRECISION_RECALL_JUDGE = `You are an expert evaluator. Assess contextual precision and recall.

Evaluate:
- **Contextual Recall**: Did the response use ALL important information from the context?
- **Contextual Precision**: Was the context info the response used actually relevant?

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "assessment",
  "confidence": 0.0-1.0,
  "contextual_recall": 0.0-1.0,
  "contextual_precision": 0.0-1.0
}`;

function normalizeContext(ctx: string | string[] | undefined): string {
  if (!ctx) return "";
  if (Array.isArray(ctx)) return ctx.map((c, i) => `[Document ${i + 1}]: ${c}`).join("\n\n");
  return ctx;
}

function contextIsUseful(ctx: string): boolean {
  return ctx.trim().length > 20;
}

export async function evaluate(
  cases: CICase[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void,
  systemPrompt?: string
): Promise<EvaluationResult> {
  let completed = 0;

  const caseResults = await parallelEval(
    cases,
    async (tc) => {
      const question = tc.question || tc.query || "";
      const contextStr = normalizeContext(tc.context);
      const hasContext = contextIsUseful(contextStr);
      const expected = tc.ground_truth || tc.expected_answer || "";

      try {
        let modelResponse = tc.response || "";

        if (!modelResponse) {
          const defaultSys = hasContext
            ? `Answer the question using ONLY the provided context. If the context does not contain the answer, say "I don't know".\n\nContext: ${contextStr}`
            : `Answer the following question. If you do not have reliable information, say "I don't know".`;
          const sysPrompt = systemPrompt
            ? (hasContext ? `${systemPrompt}\n\nContext: ${contextStr}` : systemPrompt)
            : defaultSys;

          const res = await callModel({
            messages: [
              { role: "system", content: sysPrompt },
              { role: "user", content: question },
            ],
            config,
          });
          modelResponse = res.content;
        }

        const judgePrompt = [
          `Context: ${contextStr || "(none)"}`,
          `Question: ${question}`,
          expected ? `Expected Answer: ${expected}` : "",
          `Model's Response:\n${modelResponse}`,
        ].filter(Boolean).join("\n\n");

        const [mainVerdict, prVerdict] = await Promise.all([
          llmJudge(config, GROUNDING_JUDGE, judgePrompt),
          hasContext
            ? llmJudge(config, PRECISION_RECALL_JUDGE, judgePrompt)
            : Promise.resolve({ passed: true, score: 0, reasoning: "", confidence: 0 }),
        ]);

        let faithfulness = mainVerdict.score;
        let contextUtil = 0.5;
        let answerRelevancy = mainVerdict.score;
        let hallucinated = false;
        let correctlyRefused = false;
        let contextualRecall = 0.5;
        let contextualPrecision = 0.5;

        try {
          const parsed = JSON.parse((mainVerdict.reasoning.match(/\{[\s\S]*\}/) || ["{}"])[0]);
          faithfulness = typeof parsed.faithfulness === "number" ? parsed.faithfulness : mainVerdict.score;
          contextUtil = typeof parsed.context_utilization === "number" ? parsed.context_utilization : mainVerdict.score;
          answerRelevancy = typeof parsed.answer_relevancy === "number" ? parsed.answer_relevancy : mainVerdict.score;
          hallucinated = parsed.hallucinated === true;
          correctlyRefused = parsed.correctly_refused === true;
        } catch { /* use defaults */ }

        try {
          const parsed2 = JSON.parse((prVerdict.reasoning.match(/\{[\s\S]*\}/) || ["{}"])[0]);
          contextualRecall = typeof parsed2.contextual_recall === "number" ? parsed2.contextual_recall : prVerdict.score;
          contextualPrecision = typeof parsed2.contextual_precision === "number" ? parsed2.contextual_precision : prVerdict.score;
        } catch { /* use defaults */ }

        if (!hasContext) {
          contextUtil = 0;
          contextualRecall = 0;
          contextualPrecision = 0;
        }

        completed++;
        onProgress(completed, cases.length);

        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: modelResponse,
            expected: expected || (!hasContext ? "Should refuse / express uncertainty" : "Grounded answer from context"),
            passed: mainVerdict.passed,
            score: mainVerdict.score,
            metadata: {
              judgeReasoning: mainVerdict.reasoning,
              faithfulness,
              contextUtilization: contextUtil,
              answerRelevancy,
              hallucinated,
              correctlyRefused,
              contextualRecall,
              contextualPrecision,
              hasContext,
            },
          } as CaseResult,
          hallucinated,
          correctlyRefused,
          shouldRefuse: !hasContext,
          grounded: mainVerdict.passed && !hallucinated,
          faithfulness,
          contextUtil,
          answerRelevancy,
          contextualRecall,
          contextualPrecision,
        };
      } catch (err) {
        completed++;
        onProgress(completed, cases.length);
        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
            expected: expected || "N/A",
            passed: false,
            score: 0,
          } as CaseResult,
          hallucinated: false,
          correctlyRefused: false,
          shouldRefuse: !hasContext,
          grounded: false,
          faithfulness: 0,
          contextUtil: 0,
          answerRelevancy: 0,
          contextualRecall: 0,
          contextualPrecision: 0,
        };
      }
    },
    2
  );

  const results = caseResults.map((r) => r.result);
  const n = cases.length || 1;

  const groundingAccuracy = (caseResults.filter((r) => r.grounded).length / n) * 100;
  const hallucinationRate = (caseResults.filter((r) => r.hallucinated).length / n) * 100;
  const shouldRefuseCount = caseResults.filter((r) => r.shouldRefuse).length;
  const correctRefusals = caseResults.filter((r) => r.correctlyRefused).length;
  const correctRefusalRate = shouldRefuseCount > 0 ? (correctRefusals / shouldRefuseCount) * 100 : 100;
  const avgFaithfulness = (caseResults.reduce((s, r) => s + r.faithfulness, 0) / n) * 100;
  const contextUtilization = (caseResults.reduce((s, r) => s + r.contextUtil, 0) / n) * 100;
  const answerRelevancy = (caseResults.reduce((s, r) => s + r.answerRelevancy, 0) / n) * 100;
  const contextualRecall = (caseResults.reduce((s, r) => s + r.contextualRecall, 0) / n) * 100;
  const contextualPrecision = (caseResults.reduce((s, r) => s + r.contextualPrecision, 0) / n) * 100;
  const overallScore = (groundingAccuracy + avgFaithfulness + answerRelevancy + (100 - hallucinationRate)) / 4;

  return {
    metrics: {
      groundingAccuracy,
      hallucinationRate,
      correctRefusalRate,
      avgFaithfulness,
      contextUtilization,
      answerRelevancy,
      contextualRecall,
      contextualPrecision,
      overallScore,
    },
    results,
    passed: overallScore >= 65 && hallucinationRate <= 25,
  };
}
