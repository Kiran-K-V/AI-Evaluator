import Ajv from "ajv";
import { callModel } from "@/lib/api";
import type { ModelConfig, CaseResult, EvaluationResult } from "@/lib/types";
import { parallelEval } from "./llm-judge";

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
  let completed = 0;

  const caseResults = await parallelEval(
    cases,
    async (tc) => {
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

        let regexValid = true;
        let hasRegex = false;
        if (tc.expected_regex) {
          hasRegex = true;
          const re = new RegExp(tc.expected_regex);
          regexValid = re.test(response.content);
        }

        let lengthValid = true;
        let hasLength = false;
        if (tc.max_length !== undefined || tc.min_length !== undefined) {
          hasLength = true;
          const len = response.content.length;
          if (tc.max_length !== undefined && len > tc.max_length) lengthValid = false;
          if (tc.min_length !== undefined && len < tc.min_length) lengthValid = false;
        }

        const passed = schemaValid && regexValid && lengthValid;

        completed++;
        onProgress(completed, cases.length);

        return {
          result: {
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
          } as CaseResult,
          schemaValid,
          regexValid: hasRegex ? regexValid : null,
          lengthValid: hasLength ? lengthValid : null,
        };
      } catch (err) {
        completed++;
        onProgress(completed, cases.length);
        return {
          result: {
            input: tc as unknown as Record<string, unknown>,
            modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
            expected: JSON.stringify(tc.expected_schema),
            passed: false,
            score: 0,
          } as CaseResult,
          schemaValid: false,
          regexValid: null,
          lengthValid: null,
        };
      }
    },
    3
  );

  const results = caseResults.map((r) => r.result);
  const n = cases.length || 1;
  const schemaPasses = caseResults.filter((r) => r.schemaValid).length;
  const regexResults = caseResults.filter((r) => r.regexValid !== null);
  const regexPasses = regexResults.filter((r) => r.regexValid === true).length;
  const lengthResults = caseResults.filter((r) => r.lengthValid !== null);
  const lengthPasses = lengthResults.filter((r) => r.lengthValid === true).length;

  const jsonSchemaPassRate = (schemaPasses / n) * 100;
  const regexMatchRate = regexResults.length > 0 ? (regexPasses / regexResults.length) * 100 : 100;
  const lengthComplianceRate = lengthResults.length > 0 ? (lengthPasses / lengthResults.length) * 100 : 100;

  return {
    metrics: { jsonSchemaPassRate, regexMatchRate, lengthComplianceRate },
    results,
    passed: jsonSchemaPassRate >= 80,
  };
}
