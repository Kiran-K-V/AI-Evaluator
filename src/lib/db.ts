import Dexie, { type Table } from "dexie";
import type { EvaluationRun, ModuleSlug } from "./types";
import { resolveSlug } from "./modules";

class EvalDatabase extends Dexie {
  runs!: Table<EvaluationRun, string>;

  constructor() {
    super("ai-eval-platform");
    this.version(1).stores({
      runs: "id, module, timestamp, [runType+groupId], *tags",
    });
  }
}

let _db: EvalDatabase | null = null;

function getDb(): EvalDatabase {
  if (!_db) _db = new EvalDatabase();
  return _db;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

const LS_KEY = "eval_runs";

/**
 * One-time migration: move any existing localStorage runs into IndexedDB.
 * Call once at app boot (idempotent — clears LS after migration).
 */
export async function migrateFromLocalStorage(): Promise<void> {
  if (!isBrowser()) return;
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return;
  try {
    const runs: EvaluationRun[] = JSON.parse(raw);
    if (!Array.isArray(runs) || runs.length === 0) return;

    const db = getDb();
    const existing = await db.runs.count();
    if (existing > 0) {
      localStorage.removeItem(LS_KEY);
      return;
    }

    const migrated = runs.map((r) => ({
      ...r,
      module: resolveSlug(r.module) as ModuleSlug,
      runType: r.runType ?? ("single" as const),
      tags: r.tags ?? [r.modelConfig.model],
    }));
    await db.runs.bulkPut(migrated);
    localStorage.removeItem(LS_KEY);
  } catch {
    /* migration is best-effort */
  }
}

export async function getRuns(): Promise<EvaluationRun[]> {
  if (!isBrowser()) return [];
  const db = getDb();
  return db.runs.orderBy("timestamp").reverse().toArray();
}

export async function getRunById(id: string): Promise<EvaluationRun | null> {
  if (!isBrowser()) return null;
  const db = getDb();
  return (await db.runs.get(id)) ?? null;
}

export async function getRunsByModule(module: ModuleSlug): Promise<EvaluationRun[]> {
  if (!isBrowser()) return [];
  const db = getDb();
  return db.runs.where("module").equals(module).reverse().sortBy("timestamp");
}

export async function getRunsByGroup(groupId: string): Promise<EvaluationRun[]> {
  if (!isBrowser()) return [];
  const db = getDb();
  return db.runs.where("groupId").equals(groupId).reverse().sortBy("timestamp");
}

export async function saveRun(run: EvaluationRun): Promise<void> {
  if (!isBrowser()) return;
  const db = getDb();
  const enriched: EvaluationRun = {
    ...run,
    module: resolveSlug(run.module) as ModuleSlug,
    runType: run.runType ?? "single",
    tags: run.tags ?? [run.modelConfig.model],
  };
  await db.runs.put(enriched);
}

export async function deleteRun(id: string): Promise<void> {
  if (!isBrowser()) return;
  const db = getDb();
  await db.runs.delete(id);
}

export async function deleteRunsByGroup(groupId: string): Promise<void> {
  if (!isBrowser()) return;
  const db = getDb();
  await db.runs.where("groupId").equals(groupId).delete();
}

export async function clearAllRuns(): Promise<void> {
  if (!isBrowser()) return;
  const db = getDb();
  await db.runs.clear();
}

export async function getAllTags(): Promise<string[]> {
  if (!isBrowser()) return [];
  const runs = await getRuns();
  const tagSet = new Set<string>();
  for (const r of runs) {
    if (r.tags) r.tags.forEach((t) => tagSet.add(t));
    if (r.modelConfig?.model) tagSet.add(r.modelConfig.model);
  }
  return [...tagSet].sort();
}

export async function getAllModels(): Promise<string[]> {
  if (!isBrowser()) return [];
  const runs = await getRuns();
  const models = new Set<string>();
  for (const r of runs) {
    if (r.modelConfig?.model) models.add(r.modelConfig.model);
  }
  return [...models].sort();
}
