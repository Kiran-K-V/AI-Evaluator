import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { llmJudge, parallelEval } from "./llm-judge";

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
- **Hallucination**: Did the model fabricate facts not in the context?
- **Appropriate Refusal**: If context is missing/irrelevant, did the model refuse or express uncertainty? A correct refusal ("I don't know", "the context doesn't say", etc.) is GOOD behavior — mark correctly_refused as true AND passed as true.
- **Answer Relevancy**: Does the response actually address the question?

IMPORTANT: If the context is empty or irrelevant and the model correctly refuses to answer (says "I don't know" or similar), that is the CORRECT behavior. Mark passed=true, correctly_refused=true, hallucinated=false, and give a high score (0.8-1.0).

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
  "answer_relevancy": 0.0-1.0
}

"passed" = true means the model behaved correctly overall.`;

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
          `Context: ${contextStr || "(empty — no context was provided to the model)"}`,
          `Question: ${question}`,
          expected ? `Expected Answer: ${expected}` : "",
          `Model's Response:\n${modelResponse}`,
        ].filter(Boolean).join("\n\n");

        const mainVerdict = await llmJudge(config, GROUNDING_JUDGE, judgePrompt);

        let faithfulness = mainVerdict.score;
        let answerRelevancy = mainVerdict.score;
        let hallucinated = false;
        let correctlyRefused = false;
        let grounded = mainVerdict.passed;

        try {
          const parsed = JSON.parse((mainVerdict.reasoning.match(/\{[\s\S]*\}/) || ["{}"])[0]);
          faithfulness = typeof parsed.faithfulness === "number" ? parsed.faithfulness : mainVerdict.score;
          answerRelevancy = typeof parsed.answer_relevancy === "number" ? parsed.answer_relevancy : mainVerdict.score;
          hallucinated = parsed.hallucinated === true;
          correctlyRefused = parsed.correctly_refused === true;
          if (typeof parsed.grounded === "boolean") grounded = parsed.grounded;
        } catch { /* use defaults */ }

        // For no-context cases: if the model passed (judge approved) AND it's a no-context scenario,
        // treat it as a correct refusal even if the judge didn't explicitly parse that field
        if (!hasContext && mainVerdict.passed && !hallucinated) {
          correctlyRefused = true;
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
              answerRelevancy,
              hallucinated,
              correctlyRefused,
              hasContext,
            },
          } as CaseResult,
          hallucinated,
          correctlyRefused,
          shouldRefuse: !hasContext,
          grounded: grounded && !hallucinated,
          faithfulness,
          answerRelevancy,
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
          answerRelevancy: 0,
        };
      }
    },
    2
  );

  const results = caseResults.map((r) => r.result);
  const n = cases.length || 1;

  const groundingAccuracy = (caseResults.filter((r) => r.grounded).length / n) * 100;
  const avgFaithfulness = (caseResults.reduce((s, r) => s + r.faithfulness, 0) / n) * 100;
  const answerRelevancy = (caseResults.reduce((s, r) => s + r.answerRelevancy, 0) / n) * 100;

  const shouldRefuseCount = caseResults.filter((r) => r.shouldRefuse).length;
  const correctRefusals = caseResults.filter((r) => r.correctlyRefused).length;
  const hallucinationCount = caseResults.filter((r) => r.hallucinated).length;

  const correctRefusalRate = shouldRefuseCount > 0 ? (correctRefusals / shouldRefuseCount) * 100 : 100;
  const hallucinationRate = n > 0 ? (hallucinationCount / n) * 100 : 0;

  const overallScore = (groundingAccuracy + avgFaithfulness + answerRelevancy + (100 - hallucinationRate)) / 4;

  return {
    metrics: {
      groundingAccuracy,
      avgFaithfulness,
      answerRelevancy,
      correctRefusalRate,
      hallucinationRate,
      overallScore,
    },
    results,
    passed: overallScore >= 65 && hallucinationRate <= 25,
  };
}
