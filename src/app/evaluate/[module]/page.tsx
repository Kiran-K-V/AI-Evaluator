"use client";

import { use, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { AlertCircle, FlaskConical } from "lucide-react";
import { EvalForm } from "@/components/evaluation/eval-form";
import { EvalProgressBar } from "@/components/evaluation/progress-bar";
import { ResultsPanel } from "@/components/evaluation/results-panel";
import { getModule } from "@/lib/modules";
import { getModelConfig } from "@/lib/settings";
import { saveRun } from "@/lib/storage";
import { runEvaluation } from "@/lib/evaluators";
import type { EvaluationResult, ModuleSlug } from "@/lib/types";

export default function EvaluateModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: moduleSlug } = use(params);
  const router = useRouter();
  const mod = getModule(moduleSlug);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<EvaluationResult | null>(null);

  const handleRun = useCallback(async (cases: unknown[]) => {
    if (!mod) return;
    const config = getModelConfig();
    if (!config.apiKey) { toast.error("Please configure your API key in Settings first."); return; }

    setRunning(true);
    setResult(null);
    setProgress({ current: 0, total: cases.length });

    try {
      const evalResult = await runEvaluation(mod.slug, cases, config, (completed, total) => { setProgress({ current: completed, total }); });
      setResult(evalResult);

      const run = {
        id: uuidv4(), module: mod.slug as ModuleSlug, timestamp: new Date().toISOString(),
        metrics: evalResult.metrics, cases: evalResult.results, passed: evalResult.passed,
        modelConfig: { model: config.model, baseUrl: config.baseUrl },
      };
      saveRun(run);
      toast.success(evalResult.passed ? "Evaluation passed!" : "Evaluation completed (some checks failed).", {
        action: { label: "View Details", onClick: () => router.push(`/results/${run.id}`) },
      });
    } catch (err) {
      toast.error(`Evaluation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  }, [mod, router]);

  if (!mod) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="glass rounded-2xl border-dashed p-12 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
          <h2 className="text-xl font-bold">Module Not Found</h2>
          <p className="mt-2 text-muted-foreground">
            The module &quot;{moduleSlug}&quot; doesn&apos;t exist or is coming soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-muted-foreground">{mod.description}</motion.p>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
          <EvalForm sampleInput={mod.sampleInput} onRun={handleRun} running={running} />
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="space-y-4">
          {running && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="glass rounded-2xl ring-1 ring-orange-500/20 p-4">
                <EvalProgressBar current={progress.current} total={progress.total} />
              </div>
            </motion.div>
          )}

          {result && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <ResultsPanel metrics={result.metrics} cases={result.results} passed={result.passed} metricDefinitions={mod.metricDefinitions} />
            </motion.div>
          )}

          {!running && !result && (
            <div className="glass rounded-2xl border-dashed p-16 text-center">
              <FlaskConical className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
              <p className="text-lg font-semibold text-muted-foreground">No results yet</p>
              <p className="mt-1 text-sm text-muted-foreground/60">Click &quot;Run Evaluation&quot; to get started</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
