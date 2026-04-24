"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Database, Play, Loader2, Plus, Trash2, Upload, Download,
  Copy, Check, CheckCircle2, XCircle, FileJson, AlertTriangle,
  ChevronDown, ChevronLeft, ChevronRight, Pencil, RotateCcw, X, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { callModel } from "@/lib/api";
import {
  getModelConfig, getJudgeConfig, getActiveModelName,
  getJudgeModelName, isConfigured,
} from "@/lib/settings";
import { llmJudge } from "@/lib/evaluators/llm-judge";
import { cn } from "@/lib/utils";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TestCase {
  id: string;
  question: string;
  expected_answer: string;
}

interface CaseRunResult {
  caseId: string;
  question: string;
  expectedAnswer: string;
  modelOutput: string;
  passed: boolean;
  score: number;
  reasoning: string;
  confidence: number;
  latency: number;
}

interface DatasetRunResult {
  cases: CaseRunResult[];
  passRate: number;
  avgScore: number;
  avgLatency: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  threshold: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SAMPLE_DATASET: TestCase[] = [
  { id: "s1", question: "What is the capital of France?", expected_answer: "Paris" },
  { id: "s2", question: "What is the chemical formula for water?", expected_answer: "H2O" },
  { id: "s3", question: "Who wrote the play Romeo and Juliet?", expected_answer: "William Shakespeare" },
];

const SAMPLE_JSON = JSON.stringify(
  [
    { question: "What is the capital of France?", expected_answer: "Paris" },
    { question: "What is the chemical formula for water?", expected_answer: "H2O" },
    { question: "Who wrote the play Romeo and Juliet?", expected_answer: "William Shakespeare" },
  ],
  null, 2
);

function generateId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/* ------------------------------------------------------------------ */
/*  Case Detail Modal                                                  */
/* ------------------------------------------------------------------ */

function CaseDetailModal({
  cases,
  index,
  threshold,
  onClose,
  onNavigate,
}: {
  cases: CaseRunResult[];
  index: number;
  threshold: number;
  onClose: () => void;
  onNavigate: (idx: number) => void;
}) {
  const cr = cases[index];
  const total = cases.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      if (e.key === "ArrowRight" && index < total - 1) onNavigate(index + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, total, onClose, onNavigate]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-hidden glass rounded-2xl ring-1 ring-border/30 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/20">
          <div className="flex items-center gap-3">
            <span className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold",
              cr.passed ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
            )}>
              {cr.passed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-sm font-bold">Case {index + 1} of {total}</p>
              <p className="text-[10px] text-muted-foreground">
                {cr.passed ? "Passed" : "Failed"} &middot; Score: {(cr.score * 100).toFixed(1)}% &middot; Threshold: {threshold}%
              </p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted/20 transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Question */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Question</p>
            <div className="glass-subtle rounded-xl px-4 py-3">
              <p className="text-sm leading-relaxed">{cr.question}</p>
            </div>
          </div>

          {/* Expected vs Actual side by side */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/60">Expected Answer</p>
              <div className="glass-subtle rounded-xl px-4 py-3 ring-1 ring-emerald-500/10">
                <p className="text-xs leading-relaxed text-muted-foreground">{cr.expectedAnswer}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className={cn("text-[10px] font-bold uppercase tracking-widest", cr.passed ? "text-emerald-400/60" : "text-red-400/60")}>Model Output</p>
              <div className={cn("glass-subtle rounded-xl px-4 py-3 ring-1", cr.passed ? "ring-emerald-500/10" : "ring-red-500/10")}>
                <p className="text-xs leading-relaxed text-muted-foreground">{cr.modelOutput}</p>
              </div>
            </div>
          </div>

          {/* Score visualization */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Score</span>
              <span className={cn("font-mono font-bold text-sm", cr.passed ? "text-emerald-400" : "text-red-400")}>
                {(cr.score * 100).toFixed(1)}%
              </span>
            </div>
            <div className="relative h-3 rounded-full overflow-hidden bg-muted/30">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${cr.score * 100}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={cn("h-full rounded-full", cr.passed ? "bg-emerald-500" : "bg-red-500")}
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                style={{ left: `${threshold}%` }}
                title={`Threshold: ${threshold}%`}
              />
            </div>
            <p className="text-[9px] text-muted-foreground/40 text-right">Threshold: {threshold}%</p>
          </div>

          {/* Judge reasoning */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Judge Reasoning</p>
            <div className="glass-subtle rounded-xl px-4 py-3">
              <p className="text-xs leading-relaxed text-muted-foreground/70">{cr.reasoning}</p>
            </div>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/40 pt-1">
            <span>Confidence: <span className="font-mono font-semibold text-muted-foreground">{(cr.confidence * 100).toFixed(0)}%</span></span>
            <span>Latency: <span className="font-mono font-semibold text-muted-foreground">{cr.latency.toFixed(0)}ms</span></span>
          </div>
        </div>

        {/* Footer: navigation */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/20">
          <button
            onClick={() => onNavigate(index - 1)}
            disabled={index === 0}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all",
              index === 0 ? "text-muted-foreground/20 cursor-not-allowed" : "glass-subtle text-muted-foreground hover:text-foreground"
            )}
          >
            <ChevronLeft className="h-4 w-4" />Back
          </button>

          {/* Dot indicators */}
          <div className="flex items-center gap-1">
            {cases.map((c, i) => (
              <button
                key={i}
                onClick={() => onNavigate(i)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === index ? "w-5 bg-teal-400" : "w-2",
                  i !== index && (c.passed ? "bg-emerald-500/30 hover:bg-emerald-500/60" : "bg-red-500/30 hover:bg-red-500/60")
                )}
              />
            ))}
          </div>

          <button
            onClick={() => onNavigate(index + 1)}
            disabled={index === total - 1}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all",
              index === total - 1 ? "text-muted-foreground/20 cursor-not-allowed" : "glass-subtle text-muted-foreground hover:text-foreground"
            )}
          >
            Next<ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function CustomDatasetPage() {
  const [cases, setCases] = useState<TestCase[]>(SAMPLE_DATASET);
  const [threshold, setThreshold] = useState(70);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentCase, setCurrentCase] = useState(0);
  const [result, setResult] = useState<DatasetRunResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON);
  const [jsonError, setJsonError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (jsonMode) {
      setJsonInput(JSON.stringify(
        cases.map(({ question, expected_answer }) => ({ question, expected_answer })),
        null, 2
      ));
    }
  }, [jsonMode]);

  /* -- Case management -- */

  const addCase = () => {
    setCases((prev) => [...prev, { id: generateId(), question: "", expected_answer: "" }]);
    setEditingId(null);
  };

  const removeCase = (id: string) => {
    if (cases.length <= 1) { toast.error("Need at least one test case"); return; }
    setCases((prev) => prev.filter((c) => c.id !== id));
  };

  const updateCase = (id: string, updates: Partial<TestCase>) => {
    setCases((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  };

  const clearAll = () => {
    setCases([{ id: generateId(), question: "", expected_answer: "" }]);
    setResult(null);
    toast.success("Cleared all test cases");
  };

  /* -- JSON handling -- */

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      const validated: TestCase[] = parsed.map((item: Record<string, unknown>, i: number) => {
        if (typeof item.question !== "string" || !item.question.trim())
          throw new Error(`Item ${i + 1}: "question" must be a non-empty string`);
        if (typeof item.expected_answer !== "string" || !item.expected_answer.trim())
          throw new Error(`Item ${i + 1}: "expected_answer" must be a non-empty string`);
        return { id: generateId(), question: item.question.trim(), expected_answer: item.expected_answer.trim() };
      });
      if (validated.length === 0) throw new Error("Array must contain at least one test case");
      setCases(validated);
      setJsonError("");
      setJsonMode(false);
      toast.success(`Loaded ${validated.length} test cases`);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJsonInput(text);
      setJsonMode(true);
      setJsonError("");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadJson = () => {
    const data = cases.map(({ question, expected_answer }) => ({ question, expected_answer }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dataset.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded dataset.json");
  };

  /* -- Run evaluation -- */

  const handleRun = useCallback(async () => {
    const validCases = cases.filter((c) => c.question.trim() && c.expected_answer.trim());
    if (validCases.length === 0) {
      toast.error("Add at least one test case with both question and expected answer");
      return;
    }

    setRunning(true);
    setResult(null);
    setCurrentCase(0);

    const config = getModelConfig();
    const judgeConfig = getJudgeConfig();
    const caseResults: CaseRunResult[] = [];

    for (let i = 0; i < validCases.length; i++) {
      const tc = validCases[i];
      setCurrentCase(i + 1);

      try {
        const response = await callModel({
          messages: [
            ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
            { role: "user" as const, content: tc.question },
          ],
          config,
        });

        const judgeSystem = `You are a precise answer-correctness evaluator. Compare the model's output to the expected answer and determine if the model's response is correct.

RULES:
- The model output does NOT need to be word-for-word identical to the expected answer.
- It IS correct if it conveys the same factual information, even with different wording, extra explanation, or additional context.
- It is INCORRECT if it contradicts the expected answer, provides a wrong answer, or misses the key information.
- Partial credit: if the response contains the correct answer but also includes incorrect information, reduce the score proportionally.

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "brief explanation of correctness assessment",
  "confidence": 0.0-1.0
}

"passed" = true means the model's output is substantively correct compared to the expected answer.
Score >= ${threshold / 100} means pass.`;

        const verdict = await llmJudge(
          judgeConfig,
          judgeSystem,
          `Question: ${tc.question}\n\nExpected Answer: ${tc.expected_answer}\n\nModel Output: ${response.content}`
        );

        caseResults.push({
          caseId: tc.id,
          question: tc.question,
          expectedAnswer: tc.expected_answer,
          modelOutput: response.content,
          passed: verdict.score >= threshold / 100,
          score: verdict.score,
          reasoning: verdict.reasoning,
          confidence: verdict.confidence,
          latency: response.latency,
        });
      } catch (err) {
        caseResults.push({
          caseId: tc.id,
          question: tc.question,
          expectedAnswer: tc.expected_answer,
          modelOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
          passed: false,
          score: 0,
          reasoning: "Model call failed",
          confidence: 0,
          latency: 0,
        });
      }
    }

    const passedCases = caseResults.filter((r) => r.passed).length;
    setResult({
      cases: caseResults,
      passRate: (passedCases / caseResults.length) * 100,
      avgScore: (caseResults.reduce((s, r) => s + r.score, 0) / caseResults.length) * 100,
      avgLatency: caseResults.reduce((s, r) => s + r.latency, 0) / caseResults.length,
      totalCases: caseResults.length,
      passedCases,
      failedCases: caseResults.length - passedCases,
      threshold,
    });

    setRunning(false);
    setCurrentCase(0);
    toast.success(`Evaluation complete — ${passedCases}/${caseResults.length} passed`);
  }, [cases, threshold, systemPrompt]);

  const configured = isConfigured();
  const validCount = cases.filter((c) => c.question.trim() && c.expected_answer.trim()).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Case Detail Modal */}
      <AnimatePresence>
        {modalIndex !== null && result && (
          <CaseDetailModal
            cases={result.cases}
            index={modalIndex}
            threshold={result.threshold}
            onClose={() => setModalIndex(null)}
            onNavigate={(idx) => setModalIndex(idx)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-muted-foreground">
          Upload or define test cases with expected answers. The model&apos;s outputs are compared to ground truth and scored by an LLM judge.
        </p>
      </motion.div>

      {/* Config bar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="glass rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/25">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold">Custom Dataset Evaluation</h2>
              <p className="text-xs text-muted-foreground">
                Model: <span className="font-semibold text-emerald-400">{getActiveModelName()}</span>
                {" "}&middot; Judge: <span className="font-semibold text-violet-400">{getJudgeModelName()}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pass Threshold</Label>
                <span className={cn("text-sm font-mono font-bold", threshold >= 70 ? "text-emerald-400" : threshold >= 50 ? "text-amber-400" : "text-red-400")}>{threshold}%</span>
              </div>
              <input
                type="range" min={0} max={100} step={5} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted/40 accent-teal-500"
              />
              <p className="text-[9px] text-muted-foreground/40">Model output score must reach this threshold to pass each case</p>
            </div>

            <div className="flex-1 min-w-[200px]">
              <button onClick={() => setShowSystemPrompt(!showSystemPrompt)} className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all", showSystemPrompt ? "glass ring-1 ring-teal-500/30 text-teal-400" : "glass-subtle text-muted-foreground hover:text-foreground")}>
                <Sparkles className="h-4 w-4" /><span className="flex-1 text-left">System Prompt</span>
                {systemPrompt && !showSystemPrompt && <span className="rounded-md bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-400">Active</span>}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showSystemPrompt && "rotate-180")} />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showSystemPrompt && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Optional system prompt for the model..." className="glass-subtle rounded-xl text-xs min-h-[70px]" />
              </motion.div>
            )}
          </AnimatePresence>

          {!configured && (
            <div className="flex items-center gap-2 rounded-xl ring-1 ring-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
              API not configured. <Link href="/settings" className="underline font-semibold">Go to Settings</Link>
            </div>
          )}
        </div>
      </motion.div>

      {/* Dataset editor */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="glass rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Test Cases <span className="text-teal-400">({validCount} of {cases.length} valid)</span>
              </h3>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">Each case needs a question and expected answer</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setJsonMode(!jsonMode)} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all", jsonMode ? "glass ring-1 ring-teal-500/30 text-teal-400" : "glass-subtle text-muted-foreground hover:text-foreground")}>
                <FileJson className="h-3.5 w-3.5" />{jsonMode ? "Card View" : "JSON Editor"}
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold glass-subtle text-muted-foreground hover:text-foreground transition-all">
                <Upload className="h-3.5 w-3.5" />Import
              </button>
              <button onClick={downloadJson} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold glass-subtle text-muted-foreground hover:text-foreground transition-all">
                <Download className="h-3.5 w-3.5" />Export
              </button>
              <button onClick={clearAll} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold glass-subtle text-muted-foreground hover:text-red-400 transition-all">
                <RotateCcw className="h-3.5 w-3.5" />Clear
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {jsonMode ? (
              <motion.div key="json" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <Textarea
                  value={jsonInput}
                  onChange={(e) => { setJsonInput(e.target.value); setJsonError(""); }}
                  placeholder={`[\n  { "question": "...", "expected_answer": "..." }\n]`}
                  className="glass-subtle rounded-xl text-xs font-mono min-h-[280px] leading-relaxed"
                  spellCheck={false}
                />
                {jsonError && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-500/10 ring-1 ring-red-500/20 px-3 py-2 text-xs text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>{jsonError}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground/40">
                    Format: <code className="text-teal-400/60">[{`{ "question": "...", "expected_answer": "..." }`}]</code>
                  </p>
                  <Button size="sm" onClick={applyJson} className="rounded-lg bg-teal-500/15 text-teal-400 hover:bg-teal-500/25 h-8 text-xs">
                    <Check className="mr-1 h-3 w-3" />Apply JSON
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {cases.map((tc, i) => {
                  const isEditing = editingId === tc.id;
                  const isValid = tc.question.trim() && tc.expected_answer.trim();
                  const caseResult = result?.cases.find((r) => r.caseId === tc.id);
                  const caseResultIdx = result?.cases.findIndex((r) => r.caseId === tc.id) ?? -1;

                  return (
                    <motion.div
                      key={tc.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={cn(
                        "glass-subtle rounded-xl transition-all",
                        caseResult?.passed === true && "ring-1 ring-emerald-500/20",
                        caseResult?.passed === false && "ring-1 ring-red-500/20",
                      )}
                    >
                      <div
                        className={cn("flex items-center gap-3 px-3 py-2.5", caseResult && "cursor-pointer hover:bg-muted/10 transition-colors")}
                        onClick={() => { if (caseResult && caseResultIdx >= 0) setModalIndex(caseResultIdx); }}
                      >
                        <span className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold shrink-0",
                          caseResult?.passed === true ? "bg-emerald-500/10 text-emerald-400" :
                          caseResult?.passed === false ? "bg-red-500/10 text-red-400" :
                          isValid ? "bg-teal-500/10 text-teal-400" : "bg-muted/30 text-muted-foreground/40"
                        )}>
                          {caseResult?.passed === true ? <CheckCircle2 className="h-4 w-4" /> :
                           caseResult?.passed === false ? <XCircle className="h-4 w-4" /> :
                           i + 1}
                        </span>

                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-medium truncate", !tc.question && "text-muted-foreground/40 italic")}>
                            {tc.question || "Empty question"}
                          </p>
                          <p className="text-[10px] text-muted-foreground/50 truncate">
                            Expected: {tc.expected_answer || "—"}
                          </p>
                        </div>

                        {caseResult && (
                          <span className={cn(
                            "text-[11px] font-mono font-bold shrink-0",
                            caseResult.passed ? "text-emerald-400" : "text-red-400"
                          )}>
                            {(caseResult.score * 100).toFixed(0)}%
                          </span>
                        )}

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setEditingId(isEditing ? null : tc.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-teal-500/10"
                          >
                            {isEditing ? <X className="h-3.5 w-3.5 text-teal-400" /> : <Pencil className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-teal-400" />}
                          </button>
                          <button onClick={() => removeCase(tc.id)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-red-500/10" disabled={cases.length <= 1}>
                            <Trash2 className={cn("h-3.5 w-3.5", cases.length <= 1 ? "text-muted-foreground/20" : "text-muted-foreground/50 hover:text-red-400")} />
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isEditing && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="px-3 pb-3 space-y-2 border-t border-border/20 pt-2">
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Question</Label>
                                <Textarea value={tc.question} onChange={(e) => updateCase(tc.id, { question: e.target.value })} placeholder="Enter the question..." className="glass rounded-lg text-xs min-h-[60px]" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Expected Answer (ground truth)</Label>
                                <Textarea value={tc.expected_answer} onChange={(e) => updateCase(tc.id, { expected_answer: e.target.value })} placeholder="Enter the expected correct answer..." className="glass rounded-lg text-xs min-h-[60px]" />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {!jsonMode && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={addCase} className="rounded-lg bg-teal-500/15 text-teal-400 hover:bg-teal-500/25 h-9 text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" />Add Test Case
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Progress */}
      {running && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass rounded-2xl ring-1 ring-teal-500/20 p-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-teal-400" />
              <p className="text-sm font-semibold">Running case {currentCase} of {validCount}...</p>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-muted/30">
              <motion.div className="h-full bg-teal-500 rounded-full" initial={{ width: 0 }} animate={{ width: `${(currentCase / Math.max(validCount, 1)) * 100}%` }} transition={{ duration: 0.3 }} />
            </div>
          </div>
        </motion.div>
      )}

      {/* Run button */}
      <Button
        onClick={handleRun}
        disabled={running || validCount === 0}
        className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40 transition-shadow h-12 text-sm"
      >
        {running
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Evaluating {currentCase}/{validCount}...</>
          : <><Play className="mr-2 h-4 w-4" />Run Dataset ({validCount} cases)</>
        }
      </Button>

      {/* Results summary */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Score overview */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className={cn("glass rounded-2xl p-4 text-center ring-1", result.passRate >= 80 ? "ring-emerald-500/30" : result.passRate >= 50 ? "ring-amber-500/30" : "ring-red-500/30")}>
              <p className={cn("text-3xl font-bold font-mono", result.passRate >= 80 ? "text-emerald-400" : result.passRate >= 50 ? "text-amber-400" : "text-red-400")}>{result.passRate.toFixed(1)}%</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Pass Rate</p>
            </div>
            <div className="glass rounded-2xl p-4 text-center">
              <p className="text-3xl font-bold font-mono text-foreground">{result.avgScore.toFixed(1)}%</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Avg Score</p>
            </div>
            <div className="glass rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-bold text-emerald-400">{result.passedCases}</span>
                <span className="text-muted-foreground/40">/</span>
                <span className="text-lg font-bold text-red-400">{result.failedCases}</span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Pass / Fail</p>
            </div>
            <div className="glass rounded-2xl p-4 text-center">
              <p className="text-3xl font-bold font-mono text-foreground">{result.avgLatency.toFixed(0)}<span className="text-sm text-muted-foreground ml-0.5">ms</span></p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Avg Latency</p>
            </div>
          </div>

          {/* Per-case result table — clickable rows */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 border-b border-border/30">
              <span>#</span><span>Question</span><span>Expected</span><span className="text-right">Score</span><span className="text-center">Result</span>
            </div>
            {result.cases.map((cr, i) => (
              <motion.div
                key={cr.caseId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setModalIndex(i)}
                className={cn(
                  "grid grid-cols-[auto_1fr_1fr_auto_auto] gap-2 px-4 py-2.5 text-xs items-center cursor-pointer transition-colors hover:bg-muted/10",
                  i % 2 === 0 ? "bg-transparent" : "bg-muted/5"
                )}
              >
                <span className="text-muted-foreground/40 font-mono w-6">{i + 1}</span>
                <span className="truncate font-medium" title={cr.question}>{cr.question}</span>
                <span className="truncate text-muted-foreground/60" title={cr.expectedAnswer}>{cr.expectedAnswer}</span>
                <span className={cn("text-right font-mono font-bold", cr.passed ? "text-emerald-400" : "text-red-400")}>
                  {(cr.score * 100).toFixed(0)}%
                </span>
                <span className="flex justify-center">
                  {cr.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Hint + Copy */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground/30">Click any row to view full details with back/next navigation</p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground glass-subtle hover:text-foreground transition-all"
            >
              {copied ? <><Check className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></> : <><Copy className="h-3 w-3" />Copy Results JSON</>}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
