"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import {
  Microscope, Play, Loader2, FlaskConical,
  ShieldCheck, BrainCircuit, Target, Award,
  ShieldAlert, Ban,
  CheckCircle2, XCircle, ChevronDown, ChevronRight,
  Sparkles, AlertCircle, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metrics/metric-card";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { EvalProgressBar } from "@/components/evaluation/progress-bar";
import { getModule } from "@/lib/modules";
import { getModelConfig, isConfigured } from "@/lib/settings";
import { saveRun } from "@/lib/db";
import { runEvaluation } from "@/lib/evaluators";
import type { EvaluationResult, CaseResult, MetricDefinition, ModuleSlug } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

const METRIC_EXPLANATIONS: Record<string, { icon: React.ElementType; gradient: string; bg: string; text: string; title: string; description: string }> = {
  groundingAccuracy: {
    icon: Target,
    gradient: "from-sky-500 to-cyan-600",
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    title: "Grounding Accuracy",
    description: "Measures whether the model derives its answer from the provided context rather than its own training data. High grounding means the model sticks to what it was given.",
  },
  avgFaithfulness: {
    icon: ShieldCheck,
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    title: "Faithfulness",
    description: "Checks if every factual claim in the response is directly supported by the context. A faithful model never adds unsupported details or extrapolates beyond the evidence.",
  },
  answerRelevancy: {
    icon: BrainCircuit,
    gradient: "from-violet-500 to-purple-600",
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    title: "Answer Relevancy",
    description: "Evaluates whether the response actually addresses the specific question asked. A relevant answer is direct, on-topic, and doesn't wander into irrelevant tangents.",
  },
  overallScore: {
    icon: Award,
    gradient: "from-orange-500 to-amber-600",
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    title: "Overall Score",
    description: "Composite score averaging grounding, faithfulness, relevancy, and inverse hallucination rate. Represents the model's overall contextual reasoning ability.",
  },
};

const SAFETY_METRICS: Record<string, { icon: React.ElementType; bg: string; text: string; title: string; description: string }> = {
  correctRefusalRate: {
    icon: ShieldAlert,
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    title: "Correct Refusal Rate",
    description: "When context is missing or irrelevant, the model should refuse to answer rather than guess. This measures how often it correctly says \"I don't know\" instead of hallucinating.",
  },
  hallucinationRate: {
    icon: Ban,
    bg: "bg-red-500/10",
    text: "text-red-400",
    title: "Hallucination Rate",
    description: "Percentage of cases where the model fabricated facts, figures, or details not present in the context. Lower is better — a 0% rate means no fabrication detected.",
  },
};

function getMetricStatus(value: number, def: MetricDefinition): "pass" | "fail" | "warning" {
  if (def.passThreshold === undefined) return "pass";
  if (def.higherIsBetter) {
    if (value >= def.passThreshold) return "pass";
    if (value >= def.passThreshold * 0.8) return "warning";
    return "fail";
  } else {
    if (value <= def.passThreshold) return "pass";
    if (value <= def.passThreshold * 1.2) return "warning";
    return "fail";
  }
}

export default function ContextEvalPage() {
  const router = useRouter();
  const mod = getModule("contextual-intelligence");

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [configured, setConfigured] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"grounding" | "safety">("grounding");

  useEffect(() => {
    requestAnimationFrame(() => {
      setConfigured(isConfigured());
      setMounted(true);
    });
  }, []);

  const handleRun = useCallback(async () => {
    if (!mod) return;
    const config = getModelConfig();
    const isLocal = config.baseUrl.includes("localhost") || config.baseUrl.includes("127.0.0.1");
    if (!isLocal && !config.apiKey) {
      toast.error("Please configure your API key in Settings first.");
      return;
    }

    setRunning(true);
    setResult(null);
    setProgress({ current: 0, total: mod.sampleInput.length });

    try {
      const evalResult = await runEvaluation(
        mod.slug,
        mod.sampleInput,
        config,
        (completed, total) => setProgress({ current: completed, total })
      );
      setResult(evalResult);

      const run = {
        id: uuidv4(),
        module: mod.slug as ModuleSlug,
        timestamp: new Date().toISOString(),
        metrics: evalResult.metrics,
        cases: evalResult.results,
        passed: evalResult.passed,
        modelConfig: { model: config.model, baseUrl: config.baseUrl },
        runType: "single" as const,
        tags: [config.model],
      };
      await saveRun(run);
      toast.success(
        evalResult.passed ? "Context evaluation passed!" : "Evaluation completed (some checks failed).",
        { action: { label: "View Details", onClick: () => router.push(`/results/${run.id}`) } }
      );
    } catch (err) {
      toast.error(`Evaluation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  }, [mod, router]);

  if (!mounted || !mod) return null;

  const coreMetricDefs = mod.metricDefinitions.filter((d) =>
    ["groundingAccuracy", "avgFaithfulness", "answerRelevancy", "overallScore"].includes(d.key)
  );
  const safetyMetricDefs = mod.metricDefinitions.filter((d) =>
    ["correctRefusalRate", "hallucinationRate"].includes(d.key)
  );

  const groundingCases = result?.results.filter((r) => {
    const meta = r.metadata as Record<string, unknown> | undefined;
    return meta?.hasContext === true;
  }) ?? [];

  const refusalCases = result?.results.filter((r) => {
    const meta = r.metadata as Record<string, unknown> | undefined;
    return meta?.hasContext === false || meta?.hasContext === undefined;
  }) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="glass rounded-2xl p-6 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-orange-500/5 via-transparent to-transparent rounded-bl-full" />
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 shadow-lg shadow-orange-500/25">
                <Microscope className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{mod.name}</h2>
                <p className="text-sm text-muted-foreground">{mod.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-5">
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 glass-subtle text-xs font-medium">
                <Sparkles className="h-3 w-3 text-orange-500" />
                LLM-as-Judge Evaluation
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 glass-subtle text-xs font-medium">
                {mod.sampleInput.length} Test Cases
              </div>
            </div>

            {!configured && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center gap-2 rounded-xl ring-1 ring-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>API not configured. <Link href="/settings" className="underline font-semibold">Go to Settings</Link></span>
              </motion.div>
            )}

            <Button
              onClick={handleRun}
              disabled={running || !configured}
              className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-shadow"
            >
              {running ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Evaluating {mod.sampleInput.length} cases...</>
              ) : (
                <><Play className="mr-2 h-4 w-4" />Run Context Evaluation</>
              )}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Progress */}
      {running && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass rounded-2xl ring-1 ring-orange-500/20 p-4">
            <p className="mb-2 text-sm font-semibold">Evaluating contextual intelligence...</p>
            <EvalProgressBar current={progress.current} total={progress.total} />
          </div>
        </motion.div>
      )}

      {/* Metric explanation cards — always visible */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(METRIC_EXPLANATIONS).map(([key, info], i) => {
          const Icon = info.icon;
          const metricDef = coreMetricDefs.find((d) => d.key === key);
          const value = result?.metrics[key] ?? null;

          return (
            <motion.div key={key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <div className={cn("glass rounded-2xl p-5 h-full transition-all", result && `ring-1 ring-${info.text.replace("text-", "")}/30`)}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg", info.gradient)}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-sm">{info.title}</h3>
                  </div>
                  {value !== null && metricDef && (
                    <p className={cn("text-xl font-bold font-mono",
                      getMetricStatus(value, metricDef) === "pass" ? "text-emerald-400" :
                      getMetricStatus(value, metricDef) === "warning" ? "text-amber-400" : "text-red-400"
                    )}>
                      {value.toFixed(0)}%
                    </p>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{info.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Results with tabs */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <PassFailBadge passed={result.passed} size="lg" />
              <span className="text-sm text-muted-foreground">
                {result.results.filter((c) => c.passed).length} of {result.results.length} cases passed
              </span>
            </div>

            {/* Tab navigation */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("grounding")}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                  activeTab === "grounding"
                    ? "bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30"
                    : "glass-subtle text-muted-foreground hover:text-foreground"
                )}
              >
                <Target className="mr-2 inline h-4 w-4" />
                Grounding & Relevancy ({groundingCases.length})
              </button>
              <button
                onClick={() => setActiveTab("safety")}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                  activeTab === "safety"
                    ? "bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30"
                    : "glass-subtle text-muted-foreground hover:text-foreground"
                )}
              >
                <ShieldAlert className="mr-2 inline h-4 w-4" />
                Hallucination & Refusal ({refusalCases.length})
              </button>
            </div>

            {/* Tab content */}
            <AnimatePresence mode="wait">
              {activeTab === "grounding" ? (
                <motion.div key="grounding" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                  {/* Core metric cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
                    {coreMetricDefs.map((def, i) => {
                      const value = result.metrics[def.key] ?? 0;
                      return (
                        <MetricCard
                          key={def.key}
                          label={def.label}
                          value={value}
                          unit={def.unit}
                          status={getMetricStatus(value, def)}
                          delay={i * 0.08}
                        />
                      );
                    })}
                  </div>

                  {/* Grounding cases */}
                  <div className="glass rounded-2xl overflow-hidden">
                    <div className="p-4 pb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Grounding Cases</h3>
                      <span className="text-[10px] font-medium text-muted-foreground/60">
                        Cases with context provided
                      </span>
                    </div>
                    <div className="divide-y divide-border/30">
                      {groundingCases.length > 0 ? groundingCases.map((c, i) => (
                        <CaseRow key={i} caseResult={c} index={i} />
                      )) : (
                        <div className="p-6 text-center text-sm text-muted-foreground">No grounding cases in this run</div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="safety" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                  {/* Safety metric cards */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-5">
                    {safetyMetricDefs.map((def) => {
                      const info = SAFETY_METRICS[def.key];
                      const value = result.metrics[def.key] ?? 0;
                      const Icon = info?.icon || ShieldAlert;
                      const status = getMetricStatus(value, def);

                      return (
                        <div key={def.key} className={cn("glass rounded-2xl p-5 ring-1", status === "pass" ? "ring-emerald-500/20" : status === "warning" ? "ring-amber-500/20" : "ring-red-500/20")}>
                          <div className="flex items-center gap-3 mb-2">
                            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", info?.bg)}>
                              <Icon className={cn("h-4.5 w-4.5", info?.text)} />
                            </div>
                            <div className="flex-1">
                              <h4 className="text-sm font-bold">{info?.title || def.label}</h4>
                            </div>
                            <p className={cn("text-2xl font-bold font-mono",
                              status === "pass" ? "text-emerald-400" : status === "warning" ? "text-amber-400" : "text-red-400"
                            )}>
                              {value.toFixed(0)}%
                            </p>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{info?.description}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Refusal cases */}
                  <div className="glass rounded-2xl overflow-hidden">
                    <div className="p-4 pb-2 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Hallucination & Refusal Cases</h3>
                      <span className="text-[10px] font-medium text-muted-foreground/60">
                        Cases with missing or irrelevant context
                      </span>
                    </div>
                    <div className="divide-y divide-border/30">
                      {refusalCases.length > 0 ? refusalCases.map((c, i) => (
                        <CaseRow key={i} caseResult={c} index={i} isRefusal />
                      )) : (
                        <div className="p-6 text-center text-sm text-muted-foreground">No hallucination/refusal cases in this run</div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {!running && !result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="glass rounded-2xl border-dashed p-12 text-center">
            <FlaskConical className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
            <p className="text-lg font-semibold text-muted-foreground">No results yet</p>
            <p className="mt-1 text-sm text-muted-foreground/60">
              Click &quot;Run Context Evaluation&quot; to test grounding, faithfulness, and hallucination detection
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function CaseRow({ caseResult, index, isRefusal }: { caseResult: CaseResult; index: number; isRefusal?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const meta = caseResult.metadata as Record<string, unknown> | undefined;

  const question = (caseResult.input.question as string) || (caseResult.input.query as string) || "";
  const truncatedQ = question.length > 80 ? question.slice(0, 80) + "..." : question;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-accent/30 cursor-pointer",
          expanded && "bg-accent/20"
        )}
      >
        <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
          caseResult.passed ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        )}>
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-relaxed text-foreground/80">{truncatedQ}</p>
          {isRefusal && meta && (
            <div className="flex gap-2 mt-1">
              {meta.correctlyRefused === true && (
                <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">Correctly Refused</span>
              )}
              {meta.hallucinated === true && (
                <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-400">Hallucinated</span>
              )}
              {meta.correctlyRefused !== true && meta.hallucinated !== true && caseResult.passed && (
                <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">Grounded</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {caseResult.score !== undefined && (
            <span className={cn("text-[10px] font-mono",
              caseResult.score >= 0.8 ? "text-emerald-400" :
              caseResult.score >= 0.5 ? "text-amber-400" : "text-red-400"
            )}>
              {(caseResult.score * 100).toFixed(0)}%
            </span>
          )}
          {caseResult.passed
            ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            : <XCircle className="h-4 w-4 text-red-400" />
          }
          {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/20 bg-accent/10 p-3 space-y-3">
              <DetailBlock label="Model Answer" content={caseResult.modelOutput} />
              {caseResult.expected && caseResult.expected !== "N/A" && (
                <DetailBlock label="Expected" content={caseResult.expected} />
              )}
              {typeof meta?.judgeReasoning === "string" && meta.judgeReasoning && (
                <DetailBlock label="Judge Reasoning" content={meta.judgeReasoning} />
              )}
              {meta && (
                <div className="flex flex-wrap gap-3 text-xs">
                  {typeof meta.faithfulness === "number" && (
                    <span className="text-muted-foreground">
                      Faithfulness: <span className="font-mono font-semibold text-foreground">{((meta.faithfulness as number) * 100).toFixed(0)}%</span>
                    </span>
                  )}
                  {typeof meta.answerRelevancy === "number" && (
                    <span className="text-muted-foreground">
                      Relevancy: <span className="font-mono font-semibold text-foreground">{((meta.answerRelevancy as number) * 100).toFixed(0)}%</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailBlock({ label, content }: { label: string; content: string }) {
  const [show, setShow] = useState(false);
  const isLong = content.length > 300;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        {isLong && (
          <button onClick={() => setShow(!show)} className="flex items-center gap-1 text-[10px] text-orange-500 hover:text-orange-400">
            {show ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            {show ? "Less" : "More"}
          </button>
        )}
      </div>
      <pre className={cn(
        "whitespace-pre-wrap rounded-xl glass-subtle p-2.5 text-xs font-mono",
        !show && isLong && "max-h-24 overflow-hidden"
      )}>
        {content || "(empty)"}
      </pre>
    </div>
  );
}
