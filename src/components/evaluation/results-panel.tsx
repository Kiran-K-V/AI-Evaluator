"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MetricCard } from "@/components/metrics/metric-card";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import type { CaseResult, MetricDefinition } from "@/lib/types";

interface ResultsPanelProps {
  metrics: Record<string, number>;
  cases: CaseResult[];
  passed: boolean;
  metricDefinitions: MetricDefinition[];
}

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

export function ResultsPanel({ metrics, cases, passed, metricDefinitions }: ResultsPanelProps) {
  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3">
        <PassFailBadge passed={passed} size="lg" />
        <span className="text-sm text-muted-foreground">
          {cases.filter((c) => c.passed).length} of {cases.length} cases passed
        </span>
      </motion.div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metricDefinitions.map((def, i) => {
          const value = metrics[def.key] ?? 0;
          return (
            <MetricCard
              key={def.key}
              label={def.label}
              value={value}
              unit={def.unit}
              status={getMetricStatus(value, def)}
              delay={i * 0.08}
              decimals={def.unit === "$" ? 4 : def.unit === "" && value < 1 ? 3 : 1}
            />
          );
        })}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-4 pb-2">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Per-Case Results</h3>
        </div>
        <div className="divide-y divide-border/30">
          {cases.map((c, i) => (
            <CaseRow key={i} caseResult={c} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CaseRow({ caseResult, index }: { caseResult: CaseResult; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const inputSummary = Object.entries(caseResult.input)
    .map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}: ${val.length > 50 ? val.slice(0, 50) + "..." : val}`;
    })
    .join(" | ");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.02 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg glass-subtle text-[10px] font-bold">
          {index + 1}
        </span>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="flex-1 truncate text-xs text-muted-foreground">{inputSummary}</span>
        {caseResult.score !== undefined && (
          <span className="text-[10px] font-mono text-muted-foreground">{(caseResult.score * 100).toFixed(1)}%</span>
        )}
        {caseResult.passed
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          : <XCircle className="h-4 w-4 shrink-0 text-red-400" />
        }
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="grid gap-3 border-t border-border/20 bg-accent/10 px-4 py-3 sm:grid-cols-3">
              <DetailBlock label="Input" content={JSON.stringify(caseResult.input, null, 2)} />
              <DetailBlock label="Model Output" content={caseResult.modelOutput} />
              <DetailBlock label="Expected" content={caseResult.expected} />
              {caseResult.metadata && Object.keys(caseResult.metadata).length > 0 && (
                <div className="sm:col-span-3">
                  <DetailBlock label="Metadata" content={JSON.stringify(caseResult.metadata, null, 2)} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl glass-subtle p-2.5 text-xs font-mono">{content || "(empty)"}</pre>
    </div>
  );
}
