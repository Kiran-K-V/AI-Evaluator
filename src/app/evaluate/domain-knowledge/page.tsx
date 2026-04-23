"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import {
  GraduationCap, Play, Loader2, FlaskConical,
  HeartPulse, Landmark, Scale, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Sparkles, AlertCircle, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metrics/metric-card";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { EvalProgressBar } from "@/components/evaluation/progress-bar";
import { getModule } from "@/lib/modules";
import { getModelConfig, isConfigured } from "@/lib/settings";
import { saveRun } from "@/lib/storage";
import { runEvaluation } from "@/lib/evaluators";
import type { EvaluationResult, CaseResult, MetricDefinition, ModuleSlug } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

const DOMAIN_CONFIG = {
  health: {
    label: "Health & Medicine",
    icon: HeartPulse,
    gradient: "from-rose-500 to-pink-600",
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    ring: "ring-rose-500/30",
    tagBg: "bg-rose-500/15",
  },
  finance: {
    label: "Finance & Economics",
    icon: Landmark,
    gradient: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    ring: "ring-emerald-500/30",
    tagBg: "bg-emerald-500/15",
  },
  law: {
    label: "Law & Regulation",
    icon: Scale,
    gradient: "from-violet-500 to-purple-600",
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    ring: "ring-violet-500/30",
    tagBg: "bg-violet-500/15",
  },
} as const;

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

export default function DomainKnowledgePage() {
  const router = useRouter();
  const mod = getModule("domain-knowledge");

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [configured, setConfigured] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      setConfigured(isConfigured());
      setMounted(true);
    });
  }, []);

  const handleRun = useCallback(async () => {
    if (!mod) return;
    const config = getModelConfig();
    if (!config.apiKey) {
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
      };
      saveRun(run);
      toast.success(
        evalResult.passed
          ? "Domain knowledge evaluation passed!"
          : "Evaluation completed (some domains need improvement).",
        { action: { label: "View Details", onClick: () => router.push(`/results/${run.id}`) } }
      );
    } catch (err) {
      toast.error(`Evaluation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  }, [mod, router]);

  if (!mounted || !mod) return null;

  const cases = mod.sampleInput as { question: string; domain: string; difficulty: string }[];
  const domainGroups = Object.entries(DOMAIN_CONFIG).map(([key, config]) => ({
    key,
    ...config,
    questions: cases.filter((c) => c.domain === key),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="glass rounded-2xl p-6 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-orange-500/5 via-transparent to-transparent rounded-bl-full" />
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 shadow-lg shadow-orange-500/25">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Domain Knowledge</h2>
                <p className="text-sm text-muted-foreground">{mod.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-5">
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 glass-subtle text-xs font-medium">
                <Sparkles className="h-3 w-3 text-orange-500" />
                LLM-as-Judge Evaluation
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 glass-subtle text-xs font-medium">
                3 Domains &middot; 6 Expert Questions
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
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Evaluating 6 questions...</>
              ) : (
                <><Play className="mr-2 h-4 w-4" />Run Domain Knowledge Evaluation</>
              )}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Progress */}
      {running && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass rounded-2xl ring-1 ring-orange-500/20 p-4">
            <p className="mb-2 text-sm font-semibold">Evaluating domain expertise...</p>
            <EvalProgressBar current={progress.current} total={progress.total} />
          </div>
        </motion.div>
      )}

      {/* Domain cards — always visible */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {domainGroups.map((group, gi) => {
          const DomainIcon = group.icon;
          const domainResults = result?.results.filter(
            (r) => (r.metadata as Record<string, unknown>)?.domain === group.key
          );
          const domainScore = domainResults && domainResults.length > 0
            ? (domainResults.reduce((s, r) => s + (r.score ?? 0), 0) / domainResults.length) * 100
            : null;

          return (
            <motion.div
              key={group.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.08 }}
            >
              <div className={cn("glass rounded-2xl p-5 h-full transition-all", result && `ring-1 ${group.ring}`)}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg", group.gradient)}>
                    <DomainIcon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-sm">{group.label}</h3>
                    <p className="text-xs text-muted-foreground">{group.questions.length} questions</p>
                  </div>
                  {domainScore !== null && (
                    <div className={cn("text-right")}>
                      <p className={cn("text-xl font-bold font-mono", domainScore >= 60 ? "text-emerald-400" : domainScore >= 40 ? "text-amber-400" : "text-red-400")}>
                        {domainScore.toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {group.questions.map((q, qi) => {
                    const caseResult = domainResults?.[qi];
                    return (
                      <DomainQuestion
                        key={qi}
                        question={q.question}
                        index={qi}
                        domain={group.key}
                        domainConfig={group}
                        caseResult={caseResult}
                      />
                    );
                  })}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Aggregate results */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <PassFailBadge passed={result.passed} size="lg" />
              <span className="text-sm text-muted-foreground">
                {result.results.filter((c) => c.passed).length} of {result.results.length} questions passed
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {mod.metricDefinitions.map((def, i) => {
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
              Click &quot;Run Domain Knowledge Evaluation&quot; to test expert-level accuracy across Health, Finance, and Law
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function DomainQuestion({
  question,
  index,
  domain,
  domainConfig,
  caseResult,
}: {
  question: string;
  index: number;
  domain: string;
  domainConfig: { tagBg: string; text: string; label: string };
  caseResult?: CaseResult;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl glass-subtle overflow-hidden">
      <button
        onClick={() => caseResult && setExpanded(!expanded)}
        className={cn(
          "flex w-full items-start gap-3 p-3 text-left transition-colors",
          caseResult && "hover:bg-accent/30 cursor-pointer"
        )}
      >
        <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold", domainConfig.tagBg, domainConfig.text)}>
          Q{index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-relaxed text-foreground/80 line-clamp-2">{question}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {caseResult && (
            <>
              {caseResult.score !== undefined && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {(caseResult.score * 100).toFixed(0)}%
                </span>
              )}
              {caseResult.passed
                ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                : <XCircle className="h-4 w-4 text-red-400" />
              }
              {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </>
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && caseResult && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/20 bg-accent/10 p-3 space-y-3">
              <DetailBlock label="Model Answer" content={caseResult.modelOutput} />
              {caseResult.metadata && (
                <>
                  <DetailBlock
                    label="Judge Reasoning"
                    content={
                      (caseResult.metadata as Record<string, unknown>)?.judgeReasoning as string || ""
                    }
                  />
                  <div className="flex gap-3 text-xs">
                    <span className="text-muted-foreground">
                      Confidence: <span className="font-mono font-semibold text-foreground">
                        {(((caseResult.metadata as Record<string, unknown>)?.judgeConfidence as number) * 100).toFixed(0)}%
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      Latency: <span className="font-mono font-semibold text-foreground">
                        {Math.round((caseResult.metadata as Record<string, unknown>)?.latency as number)}ms
                      </span>
                    </span>
                  </div>
                </>
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
