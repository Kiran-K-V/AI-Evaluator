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

/**
 * Compare two results for arena mode, returning positive if A wins,
 * negative if B wins, and 0 for a tie.
 * Handles all metric types: percentage (higher/lower is better) and
 * non-percentage metrics like latency/cost (lower is better).
 */
export function compareArenaResults(slug: string, resultA: EvaluationResult, resultB: EvaluationResult): number {
  const mod = MODULES.find((m) => m.slug === slug);
  if (!mod) return 0;

  let aWins = 0;
  let bWins = 0;

  for (const def of mod.metricDefinitions) {
    const valA = resultA.metrics[def.key] ?? 0;
    const valB = resultB.metrics[def.key] ?? 0;

    if (def.unit === "%") {
      const tolerance = 0.5;
      if (Math.abs(valA - valB) <= tolerance) continue;
      if (def.higherIsBetter) {
        if (valA > valB) aWins++;
        else bWins++;
      } else {
        if (valA < valB) aWins++;
        else bWins++;
      }
    } else {
      const maxVal = Math.max(Math.abs(valA), Math.abs(valB), 1);
      const relDiff = Math.abs(valA - valB) / maxVal;
      if (relDiff < 0.01) continue;

      if (def.higherIsBetter) {
        if (valA > valB) aWins++;
        else bWins++;
      } else {
        if (valA < valB) aWins++;
        else bWins++;
      }
    }
  }

  return aWins - bWins;
}
