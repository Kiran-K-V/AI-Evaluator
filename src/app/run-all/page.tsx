"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import {
  Zap, Play, Loader2, Check,
  Wrench, Shield, Braces, Tags, Gauge, GraduationCap, RefreshCcw, FileText, Microscope, FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/metrics/metric-card";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { EvalProgressBar } from "@/components/evaluation/progress-bar";
import { MODULES } from "@/lib/modules";
import { getModelConfig } from "@/lib/settings";
import { saveRun } from "@/lib/db";
import { runEvaluation } from "@/lib/evaluators";
import type { ModuleSlug, EvaluationResult } from "@/lib/types";
import { cn, getResultScore } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = { Wrench, Shield, Braces, Tags, Gauge, GraduationCap, RefreshCcw, FileText, Microscope };

interface ModuleResult {
  slug: ModuleSlug;
  result: EvaluationResult | null;
  status: "pending" | "running" | "done" | "error" | "skipped";
  error?: string;
}

export default function RunAllPage() {
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentModule, setCurrentModule] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULES.map((m) => [m.slug, true]))
  );
  const [moduleResults, setModuleResults] = useState<ModuleResult[]>(
    MODULES.map((m) => ({ slug: m.slug, result: null, status: "pending" }))
  );

  useEffect(() => {
    const config = getModelConfig();
    requestAnimationFrame(() => {
      setModel(config.model);
      setApiKey(config.apiKey);
      setBaseUrl(config.baseUrl);
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

  const handleRunAll = async () => {
    if (!apiKey) { toast.error("Configure API key first"); return; }
    if (selectedModules.length === 0) { toast.error("Select at least one module"); return; }

    setRunning(true);
    const config = { apiKey, model, baseUrl };
    const batchGroupId = uuidv4();
    const updatedResults: ModuleResult[] = MODULES.map((m) => ({
      slug: m.slug,
      result: null,
      status: enabledModules[m.slug] ? "pending" as const : "skipped" as const,
    }));
    setModuleResults(updatedResults);

    for (let i = 0; i < MODULES.length; i++) {
      const mod = MODULES[i];
      if (!enabledModules[mod.slug]) continue;

      setCurrentModule(mod.slug);
      updatedResults[i] = { ...updatedResults[i], status: "running" };
      setModuleResults([...updatedResults]);

      try {
        const evalResult = await runEvaluation(
          mod.slug,
          mod.sampleInput as unknown[],
          config,
          (completed, total) => setProgress({ current: completed, total })
        );

        updatedResults[i] = { slug: mod.slug, result: evalResult, status: "done" };

        await saveRun({
          id: uuidv4(), module: mod.slug, timestamp: new Date().toISOString(),
          metrics: evalResult.metrics, cases: evalResult.results, passed: evalResult.passed,
          modelConfig: { model: config.model, baseUrl: config.baseUrl },
          runType: "batch",
          groupId: batchGroupId,
          groupLabel: `Batch: ${config.model} (${selectedModules.length} modules)`,
          tags: [config.model],
        });
      } catch (err) {
        updatedResults[i] = { slug: mod.slug, result: null, status: "error", error: err instanceof Error ? err.message : "Unknown error" };
      }

      setModuleResults([...updatedResults]);
    }

    setCurrentModule(null);
    setRunning(false);
    toast.success("Evaluation complete!");
  };

  if (!mounted) return null;

  const completedModules = moduleResults.filter((m) => m.status === "done");
  const passedModules = completedModules.filter((m) => m.result?.passed);
  const overallScore = completedModules.length > 0
    ? completedModules.reduce((sum, m) => {
        if (!m.result) return sum;
        return sum + getResultScore(m.slug, m.result);
      }, 0) / completedModules.length
    : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Config */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="glass rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Run All Modules</h2>
              <p className="text-sm text-muted-foreground">Execute evaluation benchmarks sequentially using sample data</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 mb-5">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} className="glass-subtle rounded-xl" placeholder="gpt-4o-mini" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">API Key</Label>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="glass-subtle rounded-xl" placeholder="sk-..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Base URL</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="glass-subtle rounded-xl" placeholder="https://api.openai.com/v1" />
            </div>
          </div>

          {/* Module selection */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Modules to Evaluate</Label>
              <button onClick={toggleAll} className="text-[10px] font-semibold text-orange-500 hover:text-orange-400 transition-colors">
                {MODULES.every((m) => enabledModules[m.slug]) ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
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

          <Button onClick={handleRunAll} disabled={running || !apiKey || selectedModules.length === 0} className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-shadow">
            {running ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running {selectedModules.length} modules...</>) : (<><Play className="mr-2 h-4 w-4" />Run {selectedModules.length} Module{selectedModules.length !== 1 ? "s" : ""}</>)}
          </Button>
        </div>
      </motion.div>

      {/* Progress */}
      {running && currentModule && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass rounded-2xl ring-1 ring-orange-500/20 p-4">
            <p className="mb-2 text-sm font-semibold">
              Running: {MODULES.find((m) => m.slug === currentModule)?.name}
            </p>
            <EvalProgressBar current={progress.current} total={progress.total} />
          </div>
        </motion.div>
      )}

      {/* Aggregate scores */}
      {completedModules.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard label="Modules Passed" value={passedModules.length} unit={`/ ${MODULES.length}`} status={passedModules.length === MODULES.length ? "pass" : passedModules.length > 0 ? "warning" : "fail"} decimals={0} />
            <MetricCard label="Overall Score" value={overallScore} unit="%" status={overallScore >= 70 ? "pass" : overallScore >= 50 ? "warning" : "fail"} />
            <MetricCard label="Total Cases" value={completedModules.reduce((s, m) => s + (m.result?.results.length ?? 0), 0)} status="neutral" decimals={0} />
          </div>
        </motion.div>
      )}

      {/* Per-module results */}
      <div className="space-y-3">
        {moduleResults.filter((mr) => mr.status !== "skipped").map((mr, i) => {
          const mod = MODULES.find((m) => m.slug === mr.slug)!;
          const Icon = iconMap[mod.icon] || FlaskConical;

          return (
            <motion.div key={mr.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className={cn("glass rounded-2xl p-4 transition-all", mr.status === "running" && "ring-1 ring-orange-500/30 animate-pulse")}>
                <div className="flex items-center gap-4">
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                    mr.status === "done" && mr.result?.passed ? "bg-emerald-500/10 text-emerald-400" :
                    mr.status === "done" && !mr.result?.passed ? "bg-red-500/10 text-red-400" :
                    mr.status === "running" ? "bg-orange-500/15 text-orange-500" :
                    mr.status === "error" ? "bg-red-500/10 text-red-400" :
                    "bg-muted/50 text-muted-foreground"
                  )}>
                    {mr.status === "running" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{mod.name}</p>
                    {mr.status === "done" && mr.result && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {mod.metricDefinitions.map((def) => {
                          const val = mr.result!.metrics[def.key] ?? 0;
                          const display = def.unit === "%" ? Math.min(Math.max(val, 0), 100).toFixed(1) : val.toFixed(1);
                          return (
                            <span key={def.key} className="text-xs text-muted-foreground">
                              {def.label}: <span className="font-mono font-semibold text-foreground">{display}{def.unit}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {mr.status === "error" && <p className="text-xs text-red-400 mt-1">{mr.error}</p>}
                    {mr.status === "pending" && <p className="text-xs text-muted-foreground mt-1">Waiting...</p>}
                  </div>
                  <div>
                    {mr.status === "done" && mr.result && <PassFailBadge passed={mr.result.passed} />}
                    {mr.status === "error" && <PassFailBadge passed={false} />}
                    {mr.status === "running" && <span className="text-xs font-semibold text-orange-500">Running</span>}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
