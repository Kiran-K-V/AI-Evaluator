"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import {
  Zap, Play, Loader2,
  Wrench, Brain, BookOpen, Shield, Braces, Tags, Gauge, FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/metrics/metric-card";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { EvalProgressBar } from "@/components/evaluation/progress-bar";
import { MODULES } from "@/lib/modules";
import { getModelConfig } from "@/lib/settings";
import { saveRun } from "@/lib/storage";
import { runEvaluation } from "@/lib/evaluators";
import type { ModuleSlug, EvaluationResult } from "@/lib/types";
import { getResultScore } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = { Wrench, Brain, BookOpen, Shield, Braces, Tags, Gauge };

interface ModuleResult {
  slug: ModuleSlug;
  result: EvaluationResult | null;
  status: "pending" | "running" | "done" | "error";
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

  const handleRunAll = async () => {
    if (!apiKey) { toast.error("Configure API key first"); return; }

    setRunning(true);
    const config = { apiKey, model, baseUrl };
    const updatedResults: ModuleResult[] = MODULES.map((m) => ({ slug: m.slug, result: null, status: "pending" as const }));
    setModuleResults(updatedResults);

    for (let i = 0; i < MODULES.length; i++) {
      const mod = MODULES[i];
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

        saveRun({
          id: uuidv4(), module: mod.slug, timestamp: new Date().toISOString(),
          metrics: evalResult.metrics, cases: evalResult.results, passed: evalResult.passed,
          modelConfig: { model: config.model, baseUrl: config.baseUrl },
        });
      } catch (err) {
        updatedResults[i] = { slug: mod.slug, result: null, status: "error", error: err instanceof Error ? err.message : "Unknown error" };
      }

      setModuleResults([...updatedResults]);
    }

    setCurrentModule(null);
    setRunning(false);
    toast.success("All modules evaluated!");
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Run All Modules</h2>
              <p className="text-sm text-muted-foreground">Execute all 7 evaluation benchmarks sequentially using sample data</p>
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

          <Button onClick={handleRunAll} disabled={running || !apiKey} className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-shadow">
            {running ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running all modules...</>) : (<><Play className="mr-2 h-4 w-4" />Run All 7 Modules</>)}
          </Button>
        </div>
      </motion.div>

      {/* Progress */}
      {running && currentModule && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass rounded-2xl ring-1 ring-violet-500/20 p-4">
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
        {moduleResults.map((mr, i) => {
          const mod = MODULES.find((m) => m.slug === mr.slug)!;
          const Icon = iconMap[mod.icon] || FlaskConical;

          return (
            <motion.div key={mr.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className={`glass rounded-2xl p-4 transition-all ${mr.status === "running" ? "ring-1 ring-violet-500/30 animate-pulse" : ""}`}>
                <div className="flex items-center gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                    mr.status === "done" && mr.result?.passed ? "bg-emerald-500/10 text-emerald-400" :
                    mr.status === "done" && !mr.result?.passed ? "bg-red-500/10 text-red-400" :
                    mr.status === "running" ? "bg-violet-500/20 text-violet-400" :
                    mr.status === "error" ? "bg-red-500/10 text-red-400" :
                    "bg-muted/50 text-muted-foreground"
                  }`}>
                    {mr.status === "running" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{mod.name}</p>
                    {mr.status === "done" && mr.result && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {mod.metricDefinitions.map((def) => (
                          <span key={def.key} className="text-xs text-muted-foreground">
                            {def.label}: <span className="font-mono font-semibold text-foreground">{(mr.result!.metrics[def.key] ?? 0).toFixed(1)}{def.unit}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {mr.status === "error" && <p className="text-xs text-red-400 mt-1">{mr.error}</p>}
                    {mr.status === "pending" && <p className="text-xs text-muted-foreground mt-1">Waiting...</p>}
                  </div>
                  <div>
                    {mr.status === "done" && mr.result && <PassFailBadge passed={mr.result.passed} />}
                    {mr.status === "error" && <PassFailBadge passed={false} />}
                    {mr.status === "running" && <span className="text-xs font-semibold text-violet-400">Running</span>}
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
