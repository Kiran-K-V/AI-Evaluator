"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  SlidersHorizontal, Play, Loader2, Plus, X, Trash2,
  Copy, Check, ChevronDown, MessageSquare, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { callModel } from "@/lib/api";
import { getModelConfig, getJudgeConfig, getActiveModelName, getJudgeModelName, isConfigured } from "@/lib/settings";
import { llmJudge } from "@/lib/evaluators/llm-judge";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Criterion {
  id: string;
  name: string;
  description: string;
  weight: number;
}

interface EvalResult {
  modelResponse: string;
  overallScore: number;
  overallPassed: boolean;
  reasoning: string;
  confidence: number;
  criterionScores: Record<string, { score: number; reasoning: string }>;
}

const DEFAULT_CRITERIA: Criterion[] = [
  { id: "1", name: "Accuracy", description: "Is the information factually correct?", weight: 1 },
  { id: "2", name: "Completeness", description: "Does the response address all parts of the question?", weight: 1 },
  { id: "3", name: "Clarity", description: "Is the response well-written and easy to understand?", weight: 1 },
];

const DEFAULT_QUESTIONS = [
  "Explain the concept of database sharding. When should you use it and what are the trade-offs?",
  "What is the difference between authentication and authorization? Provide examples.",
  "Describe the CAP theorem and its implications for distributed system design.",
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export default function GeneralEvalPage() {
  const [question, setQuestion] = useState(DEFAULT_QUESTIONS[0]);
  const [criteria, setCriteria] = useState<Criterion[]>(DEFAULT_CRITERIA);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [passThreshold, setPassThreshold] = useState(0.7);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [copied, setCopied] = useState(false);

  const addCriterion = () => {
    setCriteria((prev) => [...prev, { id: generateId(), name: "", description: "", weight: 1 }]);
  };

  const removeCriterion = (id: string) => {
    if (criteria.length <= 1) { toast.error("Need at least one criterion"); return; }
    setCriteria((prev) => prev.filter((c) => c.id !== id));
  };

  const updateCriterion = (id: string, updates: Partial<Criterion>) => {
    setCriteria((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  };

  const handleRun = useCallback(async () => {
    if (!question.trim()) { toast.error("Enter a question"); return; }
    const validCriteria = criteria.filter((c) => c.name.trim());
    if (validCriteria.length === 0) { toast.error("Add at least one named criterion"); return; }

    setRunning(true);
    setResult(null);

    try {
      const config = getModelConfig();
      const response = await callModel({
        messages: [
          ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
          { role: "user" as const, content: question },
        ],
        config,
      });

      const criteriaStr = validCriteria
        .map((c, i) => `${i + 1}. ${c.name} (weight: ${c.weight}): ${c.description || "No description"}`)
        .join("\n");

      const criterionKeys = validCriteria.map((c) => `"${c.name.toLowerCase().replace(/\s+/g, "_")}": { "score": 0.0-1.0, "reasoning": "brief explanation" }`).join(",\n    ");

      const judgeSystem = `You are an expert evaluator. Assess the AI model's response against user-defined criteria.

You will receive:
1. The question asked
2. The model's response
3. Evaluation criteria with weights

Score each criterion from 0.0 to 1.0 where:
- 0.9-1.0: Excellent — fully meets the criterion
- 0.7-0.89: Good — mostly meets with minor gaps
- 0.5-0.69: Acceptable — partially meets
- 0.3-0.49: Poor — significant gaps
- 0.0-0.29: Failed — does not meet

Respond with ONLY a JSON object:
{
  "passed": true/false,
  "score": 0.0-1.0,
  "reasoning": "overall assessment",
  "confidence": 0.0-1.0,
  "criterion_scores": {
    ${criterionKeys}
  }
}

The overall score should be a weighted average of criterion scores.
"passed" = true means overall score >= ${passThreshold}.`;

      const verdict = await llmJudge(
        getJudgeConfig(),
        judgeSystem,
        `Question:\n${question}\n\nModel's Response:\n${response.content}\n\nEvaluation Criteria:\n${criteriaStr}`
      );

      let criterionScores: Record<string, { score: number; reasoning: string }> = {};
      try {
        const raw = verdict.reasoning.match(/\{[\s\S]*\}/);
        if (raw) {
          const parsed = JSON.parse(raw[0]);
          criterionScores = parsed.criterion_scores || {};
        }
      } catch { /* use empty */ }

      const totalWeight = validCriteria.reduce((s, c) => s + c.weight, 0);
      let weightedScore = verdict.score;
      if (Object.keys(criterionScores).length > 0) {
        let ws = 0;
        for (const c of validCriteria) {
          const key = c.name.toLowerCase().replace(/\s+/g, "_");
          const s = criterionScores[key]?.score ?? verdict.score;
          ws += s * c.weight;
        }
        weightedScore = totalWeight > 0 ? ws / totalWeight : verdict.score;
      }

      setResult({
        modelResponse: response.content,
        overallScore: weightedScore,
        overallPassed: weightedScore >= passThreshold,
        reasoning: verdict.reasoning,
        confidence: verdict.confidence,
        criterionScores,
      });

      toast.success("Evaluation complete!");
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  }, [question, criteria, systemPrompt, passThreshold]);

  const configured = isConfigured();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-muted-foreground">Define custom evaluation criteria, ask any question, and get LLM-judged scores on each dimension.</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Left: Config */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                <SlidersHorizontal className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold">General Evaluation</h2>
                <p className="text-xs text-muted-foreground">
                  Model: <span className="font-semibold text-emerald-400">{getActiveModelName()}</span>
                  &middot; Judge: <span className="font-semibold text-violet-400">{getJudgeModelName()}</span>
                </p>
              </div>
            </div>

            {/* Question */}
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <MessageSquare className="inline h-3 w-3 mr-1" />Question
              </Label>
              <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask any question..." className="glass-subtle rounded-xl text-sm min-h-[80px]" />
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_QUESTIONS.map((q, i) => (
                  <button key={i} onClick={() => setQuestion(q)} className={cn("rounded-lg px-2 py-1 text-[10px] font-medium transition-all", question === q ? "bg-violet-500/15 text-violet-400" : "glass-subtle text-muted-foreground/60 hover:text-foreground")}>
                    Preset {i + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* System prompt */}
            <div>
              <button onClick={() => setShowSystemPrompt(!showSystemPrompt)} className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all", showSystemPrompt ? "glass ring-1 ring-violet-500/30 text-violet-400" : "glass-subtle text-muted-foreground hover:text-foreground")}>
                <MessageSquare className="h-4 w-4" /><span className="flex-1 text-left">System Prompt</span>
                {systemPrompt && !showSystemPrompt && <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-400">Active</span>}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showSystemPrompt && "rotate-180")} />
              </button>
              <AnimatePresence>
                {showSystemPrompt && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Optional system prompt for the model..." className="mt-2 glass-subtle rounded-xl text-xs min-h-[80px]" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Pass threshold */}
            <div className="flex items-center gap-3">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Pass Threshold</Label>
              <Input type="number" min={0} max={1} step={0.05} value={passThreshold} onChange={(e) => setPassThreshold(Number(e.target.value))} className="glass-subtle rounded-lg h-8 w-20 text-xs font-mono" />
              <span className="text-[10px] text-muted-foreground/60">{(passThreshold * 100).toFixed(0)}%</span>
            </div>
          </div>

          {!configured && (
            <div className="flex items-center gap-2 rounded-xl ring-1 ring-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
              API not configured. <Link href="/settings" className="underline font-semibold">Go to Settings</Link>
            </div>
          )}

          <Button onClick={handleRun} disabled={running || !question.trim()} className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-shadow">
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Evaluating...</> : <><Play className="mr-2 h-4 w-4" />Run Evaluation</>}
          </Button>
        </motion.div>

        {/* Right: Criteria */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Evaluation Criteria ({criteria.length})</h3>
              <Button size="sm" onClick={addCriterion} className="rounded-lg bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 h-8 text-xs">
                <Plus className="mr-1 h-3 w-3" />Add
              </Button>
            </div>

            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {criteria.map((c, i) => (
                <motion.div key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-subtle rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10 text-violet-400 text-[10px] font-bold">{i + 1}</span>
                    <Input value={c.name} onChange={(e) => updateCriterion(c.id, { name: e.target.value })} placeholder="Criterion name" className="glass rounded-lg h-8 text-xs font-semibold flex-1" />
                    <Input type="number" min={0.1} max={5} step={0.1} value={c.weight} onChange={(e) => updateCriterion(c.id, { weight: Number(e.target.value) })} className="glass rounded-lg h-8 w-16 text-xs font-mono" title="Weight" />
                    <button onClick={() => removeCriterion(c.id)} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-red-500/10">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-400" />
                    </button>
                  </div>
                  <Input value={c.description} onChange={(e) => updateCriterion(c.id, { description: e.target.value })} placeholder="Description (optional)" className="glass rounded-lg h-7 text-[11px] text-muted-foreground" />
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Results */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Overall score */}
          <div className={cn("glass rounded-2xl p-6 ring-1", result.overallPassed ? "ring-emerald-500/30" : "ring-red-500/30")}>
            <div className="flex items-center gap-4">
              {result.overallPassed
                ? <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                : <XCircle className="h-8 w-8 text-red-400" />
              }
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold">{result.overallPassed ? "Passed" : "Failed"}</h3>
                  <span className={cn("rounded-lg px-2.5 py-1 text-sm font-mono font-bold", result.overallScore >= 0.7 ? "bg-emerald-500/10 text-emerald-400" : result.overallScore >= 0.5 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400")}>
                    {(result.overallScore * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Confidence: {(result.confidence * 100).toFixed(0)}% &middot; Threshold: {(passThreshold * 100).toFixed(0)}%
                </p>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground glass-subtle hover:text-foreground">
                {copied ? <><Check className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></> : <><Copy className="h-3 w-3" />Copy</>}
              </button>
            </div>

            {/* Criterion scores with visual bar */}
            {Object.keys(result.criterionScores).length > 0 && (
              <div className="mt-5 space-y-3">
                {Object.entries(result.criterionScores).map(([key, val]) => {
                  const pct = (val.score || 0) * 100;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold capitalize">{key.replace(/_/g, " ")}</span>
                        <span className={cn("font-mono font-bold", pct >= 70 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400")}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden bg-muted/30">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className={cn("h-full rounded-full", pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500")}
                        />
                      </div>
                      {val.reasoning && <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{val.reasoning}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Model response */}
          <div className="glass rounded-2xl p-5">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Model Response</h4>
            <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-muted-foreground glass-subtle rounded-xl p-4 max-h-64 overflow-auto">{result.modelResponse}</pre>
          </div>

          {/* Judge reasoning */}
          <div className="glass rounded-2xl p-5">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Judge Reasoning</h4>
            <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-muted-foreground glass-subtle rounded-xl p-4 max-h-48 overflow-auto">{result.reasoning}</pre>
          </div>
        </motion.div>
      )}
    </div>
  );
}
