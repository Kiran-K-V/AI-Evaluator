import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { llmJudge, parallelEval } from "./llm-judge";

interface DeepEvalCase {
  query: string;
  response: string;
  context: string[];
  expected_answer: string;
  system_prompt?: string;
}

const ANSWER_RELEVANCY_JUDGE = `You are an expert Answer Relevancy evaluator. Your job is to assess whether the AI model's response actually answers the user's question.

You will receive: the original query, the model's response, and the expected answer.

Evaluation criteria:
- **Directness**: Does the response directly address the specific question asked?
- **Completeness**: Does it cover all parts of a multi-part question?
- **Specificity**: Does it provide specific, concrete answers rather than vague generalities?
- **No Off-Topic Content**: Does it avoid irrelevant tangents or padding?
- **Accuracy vs Expected**: Is the response aligned with the expected answer's intent?

Scoring guide:
- 0.9-1.0: Directly and completely answers the question with precision
- 0.7-0.89: Answers the question but misses minor details or includes some irrelevant content
- 0.5-0.69: Partially answers but misses key aspects or is too vague
- 0.3-0.49: Mostly off-topic with only tangential relevance
- 0.0-0.29: Does not address the question at all

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "detailed explanation of relevancy assessment",
  "confidence": 0.0-1.0
}

"passed" = true means score >= 0.7 (the response meaningfully answers the question).`;

const FAITHFULNESS_JUDGE = `You are an expert Faithfulness evaluator (Hallucination Detector). Your job is to determine whether every claim in the AI's response is supported by the provided context.

You will receive: the query, the context documents, and the model's response.

Evaluation criteria:
- **Claim Verification**: Extract each factual claim from the response and verify it against the context.
- **No Fabrication**: Flag any facts, figures, dates, names, or details not present in the context.
- **No Extrapolation**: The model should not infer or extrapolate beyond what the context explicitly states.
- **Appropriate Uncertainty**: When context is insufficient, the response should acknowledge limits rather than fill gaps.

Scoring guide:
- 1.0: Every single claim is directly supported by the context
- 0.8-0.99: Nearly all claims supported; minor paraphrasing that preserves meaning
- 0.6-0.79: Most claims supported but 1-2 unsupported additions
- 0.3-0.59: Significant unsupported claims or fabricated details
- 0.0-0.29: Predominantly hallucinated content

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "list each claim and whether it's supported",
  "confidence": 0.0-1.0,
  "unsupported_claims": ["list of claims not found in context"]
}

"passed" = true means score >= 0.75 (the response is substantially faithful to the context).`;

const CONTEXTUAL_RELEVANCY_JUDGE = `You are an expert Contextual Relevancy evaluator. Your job is to assess whether the retrieved context documents are actually relevant to the user's query.

This metric evaluates RETRIEVAL QUALITY, not the model's answer. You are judging whether the right documents were retrieved.

You will receive: the query and the context documents.

Evaluation criteria:
- **Topic Match**: Do the context documents discuss the same topic as the query?
- **Information Sufficiency**: Do they contain the information needed to answer the query?
- **Signal-to-Noise**: What proportion of the context is actually useful vs irrelevant padding?
- **Specificity Match**: Are the documents specific enough to answer the exact question (not just the general topic)?

Scoring guide:
- 0.9-1.0: All context documents are highly relevant and sufficient to fully answer the query
- 0.7-0.89: Most context is relevant; minor noise but key information is present
- 0.5-0.69: Some relevant context but significant irrelevant content or missing key info
- 0.3-0.49: Mostly irrelevant context with only tangential connection to the query
- 0.0-0.29: Context is completely unrelated to the query

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "assessment of each context document's relevance",
  "confidence": 0.0-1.0
}

"passed" = true means score >= 0.65 (retrieved context is meaningfully relevant).`;

const CONTEXTUAL_RECALL_JUDGE = `You are an expert Contextual Recall evaluator. Your job is to assess whether the model's response uses ALL the important information available in the context.

You will receive: the query, the context documents, the model's response, and the expected answer.

Evaluation criteria:
- **Information Coverage**: Did the response incorporate all key facts from the context that are relevant to the query?
- **No Omissions**: Are there important details in the context that the response should have included but didn't?
- **Expected Alignment**: Does the response cover the same ground as the expected answer?
- **Completeness**: For multi-faceted queries, did it address all relevant aspects from the context?

Scoring guide:
- 0.9-1.0: All important context information is reflected in the response
- 0.7-0.89: Most key information included, minor omissions
- 0.5-0.69: Significant information from context is missing from the response
- 0.3-0.49: Most relevant context information was ignored
- 0.0-0.29: The response ignores the context almost entirely

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "what was included vs what was missed",
  "confidence": 0.0-1.0,
  "missed_information": ["list of important context facts not in the response"]
}

"passed" = true means score >= 0.65 (the response captures most relevant context information).`;

const CONTEXTUAL_PRECISION_JUDGE = `You are an expert Contextual Precision evaluator. Your job is to assess how much of the context that was USED in the response is actually relevant and necessary.

This is the inverse of Contextual Recall — it measures whether the model was precise in what it pulled from context, avoiding noise.

You will receive: the query, the context documents, and the model's response.

Evaluation criteria:
- **Precision of Usage**: Of the context information included in the response, how much is actually relevant to the query?
- **No Noise Amplification**: Did the model avoid including irrelevant context details that don't help answer the question?
- **Focus**: Does the response stay focused on the query rather than dumping all available context?
- **Distillation Quality**: Did the model effectively filter the signal from the noise in the context?

Scoring guide:
- 0.9-1.0: Every piece of context information in the response is directly relevant to the query
- 0.7-0.89: Mostly precise; minor irrelevant context details included
- 0.5-0.69: Mix of relevant and irrelevant context information in the response
- 0.3-0.49: Response includes mostly irrelevant context information
- 0.0-0.29: The response pulls almost entirely irrelevant information from context

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "assessment of precision in context usage",
  "confidence": 0.0-1.0,
  "irrelevant_inclusions": ["context details used in response that weren't needed"]
}

"passed" = true means score >= 0.65 (context usage is predominantly precise).`;

export async function evaluate(
  cases: DeepEvalCase[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void,
  systemPrompt?: string
): Promise<EvaluationResult> {
  let completed = 0;
  const totalSteps = cases.length;

  const caseResults = await parallelEval(
    cases,
    async (tc) => {
      const contextStr = tc.context.map((c, i) => `[Document ${i + 1}]: ${c}`).join("\n\n");
      let modelResponse = tc.response;

      if (!modelResponse) {
        try {
          const sysPrompt = systemPrompt || tc.system_prompt || `Answer the question using ONLY the provided context. Be precise and concise.\n\nContext:\n${contextStr}`;
          const res = await callModel({
            messages: [
              { role: "system", content: sysPrompt },
              { role: "user", content: tc.query },
            ],
            config,
          });
          modelResponse = res.content;
        } catch (err) {
          completed++;
          onProgress(completed, totalSteps);
          return {
            result: {
              input: tc as unknown as Record<string, unknown>,
              modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
              expected: tc.expected_answer,
              passed: false,
              score: 0,
            } as CaseResult,
            answerRelevancy: 0,
            faithfulness: 0,
            contextualRelevancy: 0,
            contextualRecall: 0,
            contextualPrecision: 0,
          };
        }
      }

      const judgeInput = {
        query: tc.query,
        context: contextStr,
        response: modelResponse,
        expected: tc.expected_answer,
      };

      const [relevancy, faith, ctxRel, recall, precision] = await Promise.all([
        llmJudge(
          config,
          ANSWER_RELEVANCY_JUDGE,
          `Query: ${judgeInput.query}\n\nModel's Response:\n${judgeInput.response}\n\nExpected Answer:\n${judgeInput.expected}`
        ),
        llmJudge(
          config,
          FAITHFULNESS_JUDGE,
          `Query: ${judgeInput.query}\n\nContext:\n${judgeInput.context}\n\nModel's Response:\n${judgeInput.response}`
        ),
        llmJudge(
          config,
          CONTEXTUAL_RELEVANCY_JUDGE,
          `Query: ${judgeInput.query}\n\nContext:\n${judgeInput.context}`
        ),
        llmJudge(
          config,
          CONTEXTUAL_RECALL_JUDGE,
          `Query: ${judgeInput.query}\n\nContext:\n${judgeInput.context}\n\nModel's Response:\n${judgeInput.response}\n\nExpected Answer:\n${judgeInput.expected}`
        ),
        llmJudge(
          config,
          CONTEXTUAL_PRECISION_JUDGE,
          `Query: ${judgeInput.query}\n\nContext:\n${judgeInput.context}\n\nModel's Response:\n${judgeInput.response}`
        ),
      ]);

      const avgScore = (relevancy.score + faith.score + ctxRel.score + recall.score + precision.score) / 5;

      completed++;
      onProgress(completed, totalSteps);

      return {
        result: {
          input: tc as unknown as Record<string, unknown>,
          modelOutput: modelResponse,
          expected: tc.expected_answer,
          passed: avgScore >= 0.65,
          score: avgScore,
          metadata: {
            answerRelevancy: { score: relevancy.score, reasoning: relevancy.reasoning, confidence: relevancy.confidence },
            faithfulness: { score: faith.score, reasoning: faith.reasoning, confidence: faith.confidence },
            contextualRelevancy: { score: ctxRel.score, reasoning: ctxRel.reasoning, confidence: ctxRel.confidence },
            contextualRecall: { score: recall.score, reasoning: recall.reasoning, confidence: recall.confidence },
            contextualPrecision: { score: precision.score, reasoning: precision.reasoning, confidence: precision.confidence },
          },
        } as CaseResult,
        answerRelevancy: relevancy.score,
        faithfulness: faith.score,
        contextualRelevancy: ctxRel.score,
        contextualRecall: recall.score,
        contextualPrecision: precision.score,
      };
    },
    2
  );

  const results = caseResults.map((r) => r.result);
  const n = cases.length || 1;

  const answerRelevancy = (caseResults.reduce((s, r) => s + r.answerRelevancy, 0) / n) * 100;
  const faithfulness = (caseResults.reduce((s, r) => s + r.faithfulness, 0) / n) * 100;
  const contextualRelevancy = (caseResults.reduce((s, r) => s + r.contextualRelevancy, 0) / n) * 100;
  const contextualRecall = (caseResults.reduce((s, r) => s + r.contextualRecall, 0) / n) * 100;
  const contextualPrecision = (caseResults.reduce((s, r) => s + r.contextualPrecision, 0) / n) * 100;
  const overallScore = (answerRelevancy + faithfulness + contextualRelevancy + contextualRecall + contextualPrecision) / 5;

  return {
    metrics: {
      answerRelevancy,
      faithfulness,
      contextualRelevancy,
      contextualRecall,
      contextualPrecision,
      overallScore,
    },
    results,
    passed: overallScore >= 65,
  };
}
