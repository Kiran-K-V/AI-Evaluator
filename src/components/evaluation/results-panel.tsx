"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MetricCard } from "@/components/metrics/metric-card";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import {
  ChevronDown, ChevronRight, CheckCircle2, XCircle,
  Copy, Check, ClipboardList, Info,
} from "lucide-react";
import type { CaseResult, MetricDefinition } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ResultsPanelProps {
  metrics: Record<string, number>;
  cases: CaseResult[];
  passed: boolean;
  metricDefinitions: MetricDefinition[];
}

const PERF_NO_EXPECTED = new Set(["N/A (performance test)", "N/A"]);

function shouldShowExpected(c: CaseResult): boolean {
  if (PERF_NO_EXPECTED.has(c.expected)) return false;
  if (!c.expected || c.expected.trim() === "") return false;
  return true;
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

interface ScaleRef {
  label: string;
  value: number;
  color: string;
}

const LATENCY_SCALE: ScaleRef[] = [
  { label: "Excellent", value: 500, color: "#22c55e" },
  { label: "Good", value: 1500, color: "#84cc16" },
  { label: "Acceptable", value: 3000, color: "#eab308" },
  { label: "Slow", value: 6000, color: "#f97316" },
  { label: "Very Slow", value: 10000, color: "#ef4444" },
];

const COST_SCALE: ScaleRef[] = [
  { label: "Cheap", value: 0.001, color: "#22c55e" },
  { label: "Low", value: 0.01, color: "#84cc16" },
  { label: "Moderate", value: 0.05, color: "#eab308" },
  { label: "Expensive", value: 0.15, color: "#f97316" },
  { label: "Very Expensive", value: 0.5, color: "#ef4444" },
];

function getScaleForMetric(key: string): ScaleRef[] | null {
  if (key === "avgTTFT" || key === "avgResponseTime") return LATENCY_SCALE;
  if (key === "estimatedCost") return COST_SCALE;
  return null;
}

function getPositionOnScale(value: number, scale: ScaleRef[]): { pct: number; color: string; label: string } {
  if (value <= scale[0].value) return { pct: 5, color: scale[0].color, label: scale[0].label };
  for (let i = 1; i < scale.length; i++) {
    if (value <= scale[i].value) {
      const lo = scale[i - 1].value;
      const hi = scale[i].value;
      const rangePct = (value - lo) / (hi - lo);
      const segmentWidth = 100 / scale.length;
      const pct = ((i - 1) + rangePct) * segmentWidth;
      return { pct: Math.min(95, Math.max(5, pct)), color: scale[i].color, label: scale[i].label };
    }
  }
  return { pct: 95, color: scale[scale.length - 1].color, label: scale[scale.length - 1].label };
}

function ScaleBar({ value, scale, unit }: { value: number; scale: ScaleRef[]; unit: string }) {
  const pos = getPositionOnScale(value, scale);
  return (
    <div className="mt-2 space-y-1">
      <div className="relative h-3 rounded-full overflow-hidden flex">
        {scale.map((s, i) => (
          <div key={i} className="flex-1 h-full" style={{ backgroundColor: s.color, opacity: 0.35 }} />
        ))}
        <motion.div
          initial={{ left: "0%" }}
          animate={{ left: `${pos.pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full border-2 border-white/80 shadow-lg z-10"
          style={{ backgroundColor: pos.color }}
          title={`${value.toLocaleString()}${unit} — ${pos.label}`}
        />
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground/50">
        {scale.map((s, i) => (
          <span key={i} style={{ color: s.color }} className="font-semibold">{s.label}</span>
        ))}
      </div>
    </div>
  );
}

export function ResultsPanel({ metrics, cases, passed, metricDefinitions }: ResultsPanelProps) {
  const isPerformance = metricDefinitions.some((d) => d.key === "avgTTFT" || d.key === "avgResponseTime");

  return (
    <div className="space-y-5">
      {/* Header row */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <PassFailBadge passed={passed} size="lg" />
          <span className="text-sm text-muted-foreground">
            {cases.filter((c) => c.passed).length} of {cases.length} cases passed
          </span>
        </div>
        <CopyAllButton cases={cases} metrics={metrics} />
      </motion.div>

      {/* Metrics grid — responsive columns based on count */}
      <div className={cn(
        "grid grid-cols-1 gap-3",
        metricDefinitions.length <= 3 ? "sm:grid-cols-3" :
        metricDefinitions.length <= 4 ? "sm:grid-cols-2 lg:grid-cols-4" :
        "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      )}>
        {metricDefinitions.map((def, i) => {
          const value = metrics[def.key] ?? 0;
          const scale = getScaleForMetric(def.key);
          return (
            <div key={def.key}>
              <MetricCard
                label={def.label}
                value={value}
                unit={def.unit}
                status={isPerformance ? "neutral" : getMetricStatus(value, def)}
                delay={i * 0.08}
                decimals={def.unit === "$" ? 4 : def.unit === "" && value < 1 ? 3 : 1}
              />
              {scale && <ScaleBar value={value} scale={scale} unit={def.unit} />}
            </div>
          );
        })}
      </div>

      {/* Performance legend */}
      {isPerformance && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
          <Info className="h-3 w-3" />
          Scale shows reference ranges. Position indicates where your model sits relative to typical performance.
        </div>
      )}

      {/* Per-case results — full-width */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-4 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">Per-Case Results</h3>
          <span className="text-[10px] font-medium text-muted-foreground/60">
            Click any row to expand details
          </span>
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

function CopyAllButton({ cases, metrics }: { cases: CaseResult[]; metrics: Record<string, number> }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const data = { metrics, cases };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [cases, metrics]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground glass-subtle transition-all hover:text-foreground hover:ring-1 hover:ring-orange-500/20"
    >
      {copied ? (
        <><Check className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Copied!</span></>
      ) : (
        <><ClipboardList className="h-3 w-3" />Copy All Results</>
      )}
    </button>
  );
}

function CaseRow({ caseResult, index }: { caseResult: CaseResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const showExpected = shouldShowExpected(caseResult);

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
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30",
          expanded && "bg-accent/20"
        )}
      >
        <span className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold",
          caseResult.passed
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400"
        )}>
          {index + 1}
        </span>
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        }
        <span className="flex-1 truncate text-xs text-muted-foreground">{inputSummary}</span>
        {caseResult.score !== undefined && (
          <span className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-mono font-semibold",
            caseResult.score >= 0.8 ? "bg-emerald-500/10 text-emerald-400" :
            caseResult.score >= 0.5 ? "bg-amber-500/10 text-amber-400" :
            "bg-red-500/10 text-red-400"
          )}>
            {(caseResult.score * 100).toFixed(1)}%
          </span>
        )}
        {caseResult.passed
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          : <XCircle className="h-4 w-4 shrink-0 text-red-400" />
        }
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="border-t border-border/20 bg-accent/5 px-4 py-4">
              <div className={cn("grid gap-4", showExpected ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                <DetailBlock label="Input" content={JSON.stringify(caseResult.input, null, 2)} />
                <DetailBlock label="Model Output" content={caseResult.modelOutput} />
                {showExpected && (
                  <DetailBlock label="Expected" content={caseResult.expected} />
                )}
              </div>
              {caseResult.metadata && Object.keys(caseResult.metadata).length > 0 && (
                <div className="mt-4">
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
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [content]);

  return (
    <div className="group/block">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/50 opacity-0 transition-all hover:text-foreground group-hover/block:opacity-100"
        >
          {copied ? (
            <><Check className="h-2.5 w-2.5 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
          ) : (
            <><Copy className="h-2.5 w-2.5" />Copy</>
          )}
        </button>
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl glass-subtle p-3 text-xs font-mono leading-relaxed">{content || "(empty)"}</pre>
    </div>
  );
}
