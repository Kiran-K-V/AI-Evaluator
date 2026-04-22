import Ajv from "ajv";
import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";

interface StructuredOutputCase {
  prompt: string;
  expected_schema: Record<string, unknown>;
  expected_regex?: string;
  max_length?: number;
  min_length?: number;
}

const ajv = new Ajv({ allErrors: true, strict: false });

function extractJSON(text: string): string | null {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) return jsonMatch[1].trim();

  const braceMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (braceMatch) return braceMatch[1];

  return text.trim();
}

export async function evaluate(
  cases: StructuredOutputCase[],
  config: ModelConfig,
  onProgress: (completed: number, total: number) => void
): Promise<EvaluationResult> {
  const results: CaseResult[] = [];
  let schemaPasses = 0;
  let regexPasses = 0;
  let lengthPasses = 0;
  let regexTotal = 0;
  let lengthTotal = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];

    try {
      const response = await callModel({
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that responds ONLY with valid JSON. Do not include any explanation or markdown. Output raw JSON only.",
          },
          { role: "user", content: tc.prompt },
        ],
        config,
      });

      const jsonStr = extractJSON(response.content);
      let parsed: unknown = null;
      let validJson = false;

      try {
        parsed = JSON.parse(jsonStr || "");
        validJson = true;
      } catch {
        validJson = false;
      }

      let schemaValid = false;
      if (validJson && tc.expected_schema) {
        const validate = ajv.compile(tc.expected_schema);
        schemaValid = validate(parsed) as boolean;
      }
      if (schemaValid) schemaPasses++;

      let regexValid = true;
      if (tc.expected_regex) {
        regexTotal++;
        const re = new RegExp(tc.expected_regex);
        regexValid = re.test(response.content);
        if (regexValid) regexPasses++;
      }

      let lengthValid = true;
      if (tc.max_length !== undefined || tc.min_length !== undefined) {
        lengthTotal++;
        const len = response.content.length;
        if (tc.max_length !== undefined && len > tc.max_length) lengthValid = false;
        if (tc.min_length !== undefined && len < tc.min_length) lengthValid = false;
        if (lengthValid) lengthPasses++;
      }

      const passed = schemaValid && regexValid && lengthValid;

      results.push({
        input: tc as unknown as Record<string, unknown>,
        modelOutput: response.content,
        expected: JSON.stringify(tc.expected_schema),
        passed,
        score: passed ? 1 : 0,
        metadata: {
          validJson,
          schemaValid,
          regexValid,
          lengthValid,
          latency: response.latency,
        },
      });
    } catch (err) {
      results.push({
        input: tc as unknown as Record<string, unknown>,
        modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
        expected: JSON.stringify(tc.expected_schema),
        passed: false,
        score: 0,
      });
    }

    onProgress(i + 1, cases.length);
  }

  const n = cases.length || 1;
  const jsonSchemaPassRate = (schemaPasses / n) * 100;
  const regexMatchRate = regexTotal > 0 ? (regexPasses / regexTotal) * 100 : 100;
  const lengthComplianceRate = lengthTotal > 0 ? (lengthPasses / lengthTotal) * 100 : 100;

  return {
    metrics: {
      jsonSchemaPassRate,
      regexMatchRate,
      lengthComplianceRate,
    },
    results,
    passed: jsonSchemaPassRate >= 80,
  };
}
