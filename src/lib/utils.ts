import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { MODULES } from "./modules"
import type { EvaluationRun, EvaluationResult } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compute average score for a run, only using percentage-unit metrics
 * to avoid latency/tokens/cost values inflating the average.
 */
export function getRunScore(run: EvaluationRun): number {
  const mod = MODULES.find((m) => m.slug === run.module);
  if (!mod) return 0;
  const pctDefs = mod.metricDefinitions.filter((d) => d.unit === "%");
  if (pctDefs.length === 0) return run.passed ? 100 : 0;
  const sum = pctDefs.reduce((acc, d) => {
    const val = run.metrics[d.key] ?? 0;
    return acc + (d.higherIsBetter ? val : 100 - val);
  }, 0);
  return sum / pctDefs.length;
}

/**
 * Compute average score from an EvaluationResult and its module slug.
 */
export function getResultScore(slug: string, result: EvaluationResult): number {
  const mod = MODULES.find((m) => m.slug === slug);
  if (!mod) return 0;
  const pctDefs = mod.metricDefinitions.filter((d) => d.unit === "%");
  if (pctDefs.length === 0) return result.passed ? 100 : 0;
  const sum = pctDefs.reduce((acc, d) => {
    const val = result.metrics[d.key] ?? 0;
    return acc + (d.higherIsBetter ? val : 100 - val);
  }, 0);
  return sum / pctDefs.length;
}
