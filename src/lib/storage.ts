import type { EvaluationRun, ModuleSlug } from "./types";

const STORAGE_KEY = "eval_runs";
const MAX_RUNS = 50;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getRuns(): EvaluationRun[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const runs: EvaluationRun[] = JSON.parse(raw);
    return runs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch {
    return [];
  }
}

export function getRunById(id: string): EvaluationRun | null {
  const runs = getRuns();
  return runs.find((r) => r.id === id) ?? null;
}

export function getRunsByModule(module: ModuleSlug): EvaluationRun[] {
  return getRuns().filter((r) => r.module === module);
}

export function saveRun(run: EvaluationRun): void {
  if (!isBrowser()) return;
  const runs = getRuns();
  runs.unshift(run);
  while (runs.length > MAX_RUNS) {
    runs.pop();
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
}

export function deleteRun(id: string): void {
  if (!isBrowser()) return;
  const runs = getRuns().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
}

export function clearAllRuns(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}
