"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Swords, Loader2, Trophy, Crown, Check,
  Wrench, Brain, BookOpen, Shield, Braces, Tags, Gauge, GraduationCap, FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { EvalProgressBar } from "@/components/evaluation/progress-bar";
import { MODULES } from "@/lib/modules";
import { getModelConfig } from "@/lib/settings";
import { runEvaluation } from "@/lib/evaluators";
import type { ModuleSlug, EvaluationResult } from "@/lib/types";
import { cn, getResultScore } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = { Wrench, Brain, BookOpen, Shield, Braces, Tags, Gauge, GraduationCap };

interface ArenaResult {
  slug: ModuleSlug;
  modelA: EvaluationResult | null;
  modelB: EvaluationResult | null;
  statusA: "pending" | "running" | "done" | "error" | "skipped";
  statusB: "pending" | "running" | "done" | "error" | "skipped";
}

export default function ArenaPage() {
  const [modelA, setModelA] = useState({ name: "gpt-4o-mini", apiKey: "", baseUrl: "https://api.openai.com/v1" });
  const [modelB, setModelB] = useState({ name: "gpt-4o", apiKey: "", baseUrl: "https://api.openai.com/v1" });
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentInfo, setCurrentInfo] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULES.map((m) => [m.slug, true]))
  );
  const [results, setResults] = useState<ArenaResult[]>(
    MODULES.map((m) => ({ slug: m.slug, modelA: null, modelB: null, statusA: "pending", statusB: "pending" }))
  );

  useEffect(() => {
    const config = getModelConfig();
    requestAnimationFrame(() => {
      setModelA((prev) => ({ ...prev, apiKey: config.apiKey, baseUrl: config.baseUrl, name: config.model }));
      setModelB((prev) => ({ ...prev, apiKey: config.apiKey, baseUrl: config.baseUrl }));
      setMounted(true);
    });
  }, []);

  const toggleModule = (slug: string) => {
    setEnabledModules((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  const toggleAll = () => {
    const allEnabled = MODULES.every((m) => enabledModules[m.slug]);
    setEnabledModules(Object.fromEntries(MODULES.map((m) => [m.slug, !allEnabled])));
  };

  const selectedModules = MODULES.filter((m) => enabledModules[m.slug]);

  const handleRunArena = async () => {
    if (!modelA.apiKey || !modelB.apiKey) { toast.error("Both models need API keys"); return; }
    if (selectedModules.length === 0) { toast.error("Select at least one module"); return; }

    setRunning(true);
    const updated: ArenaResult[] = MODULES.map((m) => ({
      slug: m.slug,
      modelA: null,
      modelB: null,
      statusA: enabledModules[m.slug] ? "pending" as const : "skipped" as const,
      statusB: enabledModules[m.slug] ? "pending" as const : "skipped" as const,
    }));
    setResults(updated);

    for (let i = 0; i < MODULES.length; i++) {
      const mod = MODULES[i];
      if (!enabledModules[mod.slug]) continue;
      const cases = mod.sampleInput as unknown[];

      setCurrentInfo(`${mod.name} — ${modelA.name}`);
      updated[i] = { ...updated[i], statusA: "running" };
      setResults([...updated]);
      try {
        const resultA = await runEvaluation(mod.slug, cases, { apiKey: modelA.apiKey, model: modelA.name, baseUrl: modelA.baseUrl }, (c, t) => setProgress({ current: c, total: t }));
        updated[i] = { ...updated[i], modelA: resultA, statusA: "done" };
      } catch { updated[i] = { ...updated[i], statusA: "error" }; }
      setResults([...updated]);

      setCurrentInfo(`${mod.name} — ${modelB.name}`);
      updated[i] = { ...updated[i], statusB: "running" };
      setResults([...updated]);
      try {
        const resultB = await runEvaluation(mod.slug, cases, { apiKey: modelB.apiKey, model: modelB.name, baseUrl: modelB.baseUrl }, (c, t) => setProgress({ current: c, total: t }));
        updated[i] = { ...updated[i], modelB: resultB, statusB: "done" };
      } catch { updated[i] = { ...updated[i], statusB: "error" }; }
      setResults([...updated]);
    }

    setCurrentInfo("");
    setRunning(false);
    toast.success("Arena battle complete!");
  };

  if (!mounted) return null;

  const doneResults = results.filter((r) => r.statusA === "done" && r.statusB === "done");
  let winsA = 0, winsB = 0, draws = 0;
  for (const r of doneResults) {
    if (!r.modelA || !r.modelB) continue;
    const scoreA = getResultScore(r.slug, r.modelA);
    const scoreB = getResultScore(r.slug, r.modelB);
    if (Math.abs(scoreA - scoreB) < 2) draws++;
    else if (scoreA > scoreB) winsA++;
    else winsB++;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Config */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="glass rounded-2xl p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/25">
              <Swords className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Model Arena</h2>
              <p className="text-sm text-muted-foreground">Compare two models head-to-head across all modules</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Model A */}
            <div className="glass-subtle rounded-xl p-4 ring-1 ring-sky-500/20">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-sky-500" />
                <span className="text-sm font-bold text-sky-600">Model A (Challenger)</span>
              </div>
              <div className="space-y-3">
                <div><Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Model Name</Label><Input value={modelA.name} onChange={(e) => setModelA({ ...modelA, name: e.target.value })} className="mt-1 glass-subtle rounded-xl" /></div>
                <div><Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">API Key</Label><Input type="password" value={modelA.apiKey} onChange={(e) => setModelA({ ...modelA, apiKey: e.target.value })} className="mt-1 glass-subtle rounded-xl" /></div>
                <div><Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Base URL</Label><Input value={modelA.baseUrl} onChange={(e) => setModelA({ ...modelA, baseUrl: e.target.value })} className="mt-1 glass-subtle rounded-xl" /></div>
              </div>
            </div>

            {/* Model B */}
            <div className="glass-subtle rounded-xl p-4 ring-1 ring-orange-500/20">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-orange-500" />
                <span className="text-sm font-bold text-orange-400">Model B (Defender)</span>
              </div>
              <div className="space-y-3">
                <div><Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Model Name</Label><Input value={modelB.name} onChange={(e) => setModelB({ ...modelB, name: e.target.value })} className="mt-1 glass-subtle rounded-xl" /></div>
                <div><Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">API Key</Label><Input type="password" value={modelB.apiKey} onChange={(e) => setModelB({ ...modelB, apiKey: e.target.value })} className="mt-1 glass-subtle rounded-xl" /></div>
                <div><Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Base URL</Label><Input value={modelB.baseUrl} onChange={(e) => setModelB({ ...modelB, baseUrl: e.target.value })} className="mt-1 glass-subtle rounded-xl" /></div>
              </div>
            </div>
          </div>

          {/* Module selection */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Modules to Compare</Label>
              <button onClick={toggleAll} className="text-[10px] font-semibold text-orange-400 hover:text-orange-300 transition-colors">
                {MODULES.every((m) => enabledModules[m.slug]) ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {MODULES.map((mod) => {
                const Icon = iconMap[mod.icon] || FlaskConical;
                const enabled = enabledModules[mod.slug];
                return (
                  <button
                    key={mod.slug}
                    onClick={() => toggleModule(mod.slug)}
                    disabled={running}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all",
                      enabled
                        ? "glass ring-1 ring-orange-500/30 text-foreground"
                        : "glass-subtle text-muted-foreground opacity-50"
                    )}
                  >
                    <div className={cn(
                      "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                      enabled ? "border-orange-500 bg-orange-500 text-white" : "border-muted-foreground/30"
                    )}>
                      {enabled && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <Icon className="h-3.5 w-3.5" />
                    {mod.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Button onClick={handleRunArena} disabled={running || !modelA.apiKey || !modelB.apiKey || selectedModules.length === 0} className="rounded-xl bg-gradient-to-r from-orange-500 to-red-600 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-shadow">
              {running ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Battle in progress...</>) : (<><Swords className="mr-2 h-4 w-4" />Start Arena ({selectedModules.length} Modules)</>)}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Progress */}
      {running && currentInfo && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass rounded-2xl ring-1 ring-orange-500/20 p-4">
            <p className="mb-2 text-sm font-semibold">{currentInfo}</p>
            <EvalProgressBar current={progress.current} total={progress.total} />
          </div>
        </motion.div>
      )}

      {/* Scoreboard */}
      {doneResults.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-3 gap-3">
            <div className={cn("glass rounded-2xl p-5 text-center ring-1", winsA > winsB ? "ring-sky-500/40" : "ring-border/30")}>
              {winsA > winsB && <Crown className="mx-auto mb-1 h-5 w-5 text-sky-500" />}
              <p className="text-3xl font-bold text-sky-500">{winsA}</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">{modelA.name}</p>
            </div>
            <div className="glass rounded-2xl p-5 text-center">
              <Trophy className="mx-auto mb-1 h-5 w-5 text-muted-foreground/50" />
              <p className="text-3xl font-bold text-muted-foreground">{draws}</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">Draws</p>
            </div>
            <div className={cn("glass rounded-2xl p-5 text-center ring-1", winsB > winsA ? "ring-orange-500/40" : "ring-border/30")}>
              {winsB > winsA && <Crown className="mx-auto mb-1 h-5 w-5 text-orange-400" />}
              <p className="text-3xl font-bold text-orange-400">{winsB}</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">{modelB.name}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Per-module comparison */}
      <div className="space-y-3">
        {results.filter((r) => r.statusA !== "skipped").map((r, i) => {
          const mod = MODULES.find((m) => m.slug === r.slug)!;
          const Icon = iconMap[mod.icon] || FlaskConical;

          const scoreA = r.modelA ? getResultScore(r.slug, r.modelA) : 0;
          const scoreB = r.modelB ? getResultScore(r.slug, r.modelB) : 0;
          const isRunning = r.statusA === "running" || r.statusB === "running";
          const isDone = r.statusA === "done" && r.statusB === "done";
          const winner = isDone ? (Math.abs(scoreA - scoreB) < 2 ? "draw" : scoreA > scoreB ? "A" : "B") : null;

          return (
            <motion.div key={r.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className={cn("glass rounded-2xl p-4 transition-all", isRunning && "ring-1 ring-orange-500/20")}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="font-semibold flex-1">{mod.name}</h3>
                  {isRunning && <Loader2 className="h-4 w-4 animate-spin text-orange-500" />}
                </div>

                {isDone && (
                  <div className="grid grid-cols-2 gap-3">
                    {mod.metricDefinitions.map((def) => {
                      const rawA = r.modelA?.metrics[def.key] ?? 0;
                      const rawB = r.modelB?.metrics[def.key] ?? 0;
                      const valA = def.unit === "%" ? Math.min(Math.max(rawA, 0), 100) : rawA;
                      const valB = def.unit === "%" ? Math.min(Math.max(rawB, 0), 100) : rawB;
                      const aWins = def.higherIsBetter ? valA > valB : valA < valB;
                      const bWins = def.higherIsBetter ? valB > valA : valB < valA;
                      const tied = Math.abs(valA - valB) < 0.5;

                      return (
                        <div key={def.key} className="glass-subtle rounded-xl p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-2">{def.label}</p>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-sky-500" />
                              <span className={cn("font-mono font-bold text-sm", aWins && !tied ? "text-sky-500" : "text-muted-foreground")}>
                                {valA.toFixed(1)}{def.unit}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-muted-foreground/40">VS</span>
                            <div className="flex items-center gap-2">
                              <span className={cn("font-mono font-bold text-sm", bWins && !tied ? "text-orange-400" : "text-muted-foreground")}>
                                {valB.toFixed(1)}{def.unit}
                              </span>
                              <div className="h-2 w-2 rounded-full bg-orange-500" />
                            </div>
                          </div>
                          <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-muted/30">
                            <div className="bg-sky-500 transition-all" style={{ width: `${valA + valB > 0 ? (valA / (valA + valB)) * 100 : 50}%` }} />
                            <div className="bg-orange-500 transition-all flex-1" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {isDone && (
                  <div className="mt-3 flex items-center justify-between">
                    <PassFailBadge passed={r.modelA?.passed ?? false} />
                    <span className={cn("text-xs font-bold px-3 py-1 rounded-lg", winner === "A" ? "text-sky-500 bg-sky-500/10" : winner === "B" ? "text-orange-500 bg-orange-500/10" : "text-muted-foreground bg-muted/30")}>
                      {winner === "A" ? `${modelA.name} wins` : winner === "B" ? `${modelB.name} wins` : "Draw"}
                    </span>
                    <PassFailBadge passed={r.modelB?.passed ?? false} />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
