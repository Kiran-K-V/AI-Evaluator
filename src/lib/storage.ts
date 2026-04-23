/**
 * Backward-compatible storage façade.
 *
 * The canonical persistence is now IndexedDB via Dexie (see db.ts).
 * These synchronous helpers exist so legacy call-sites that haven't
 * been migrated to async still compile. New code should import from db.ts.
 */
import type { EvaluationRun, ModuleSlug } from "./types";
import * as db from "./db";

const LS_KEY = "eval_runs";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readLs(): EvaluationRun[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as EvaluationRun[]).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch {
    return [];
  }
}

/** @deprecated — use db.getRuns() instead */
export function getRuns(): EvaluationRun[] {
  return readLs();
}

/** @deprecated — use db.getRunById() instead */
export function getRunById(id: string): EvaluationRun | null {
  return readLs().find((r) => r.id === id) ?? null;
}

/** @deprecated — use db.getRunsByModule() instead */
export function getRunsByModule(module: ModuleSlug): EvaluationRun[] {
  return readLs().filter((r) => r.module === module);
}

/** @deprecated — use db.saveRun() instead */
export function saveRun(run: EvaluationRun): void {
  db.saveRun(run);
  if (!isBrowser()) return;
  const runs = readLs();
  runs.unshift(run);
  while (runs.length > 200) runs.pop();
  localStorage.setItem(LS_KEY, JSON.stringify(runs));
}

/** @deprecated — use db.deleteRun() instead */
export function deleteRun(id: string): void {
  db.deleteRun(id);
  if (!isBrowser()) return;
  const runs = readLs().filter((r) => r.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(runs));
}

/** @deprecated — use db.clearAllRuns() instead */
export function clearAllRuns(): void {
  db.clearAllRuns();
  if (!isBrowser()) return;
  localStorage.removeItem(LS_KEY);
}
