"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  GitCompareArrows, Play, Loader2, Trophy, MessageSquare,
  Copy, Check, ChevronDown, SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { callModel } from "@/lib/api";
import { getAppConfig, getJudgeConfig, getJudgeModelName, isConfigured } from "@/lib/settings";
import { llmJudge } from "@/lib/evaluators/llm-judge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ModelEntry } from "@/lib/types";

const AB_JUDGE_SYSTEM = `You are an expert pairwise evaluator. You compare two AI model responses to the same question and determine which one is better.

You will receive:
1. The original question/prompt
2. Response A
3. Response B
4. (Optional) Evaluation criteria specified by the user

Evaluate on these dimensions unless overridden by custom criteria:
- **Accuracy**: Which response is more factually correct?
- **Completeness**: Which response addresses all parts of the question more thoroughly?
- **Clarity**: Which response is better written and easier to understand?
- **Relevance**: Which response stays more focused on the actual question?
- **Depth**: Which response provides more useful detail and insight?

Respond with ONLY a JSON object:
{
  "passed": true,
  "score": 0.0-1.0,
  "winner": "A" | "B" | "tie",
  "reasoning": "detailed comparison explaining why the winner is better",
  "confidence": 0.0-1.0,
  "dimension_scores": {
    "accuracy": { "A": 0.0-1.0, "B": 0.0-1.0 },
    "completeness": { "A": 0.0-1.0, "B": 0.0-1.0 },
    "clarity": { "A": 0.0-1.0, "B": 0.0-1.0 },
    "relevance": { "A": 0.0-1.0, "B": 0.0-1.0 },
    "depth": { "A": 0.0-1.0, "B": 0.0-1.0 }
  }
}

Be fair and unbiased. If both responses are equally good, declare a tie.`;

const DEFAULT_PROMPTS = [
  "Explain the difference between TCP and UDP. When would you use each?",
  "What are the pros and cons of microservices vs monolithic architecture?",
  "Describe how a neural network learns through backpropagation.",
];

interface ABResult {
  winner: "A" | "B" | "tie";
  reasoning: string;
  confidence: number;
  dimensionScores: Record<string, { A: number; B: number }>;
  responseA: string;
  responseB: string;
}

export default function ABTestingPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPTS[0]);
  const [responseA, setResponseA] = useState("");
  const [responseB, setResponseB] = useState("");
  const [criteria, setCriteria] = useState("");
  const [mode, setMode] = useState<"generate" | "paste">("generate");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ABResult | null>(null);
  const [showCriteria, setShowCriteria] = useState(false);
  const [copied, setCopied] = useState(false);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selectedModelA, setSelectedModelA] = useState("");
  const [selectedModelB, setSelectedModelB] = useState("");

  useEffect(() => {
    const config = getAppConfig();
    setModels(config.models);
    if (config.models.length >= 2) {
      setSelectedModelA(config.models[0].id);
      setSelectedModelB(config.models[1].id);
    } else if (config.models.length === 1) {
      setSelectedModelA(config.models[0].id);
      setSelectedModelB(config.models[0].id);
    }
  }, []);

  const getSelectedModelConfig = (modelId: string) => {
    const entry = models.find((m) => m.id === modelId);
    if (!entry) return null;
    return { apiKey: entry.apiKey, model: entry.model, baseUrl: entry.baseUrl };
  };

  const getModelLabel = (modelId: string) => {
    const entry = models.find((m) => m.id === modelId);
    return entry?.name || entry?.model || "Not selected";
  };

  const handleRun = useCallback(async () => {
    if (!prompt.trim()) { toast.error("Enter a prompt"); return; }

    if (mode === "generate") {
      const configA = getSelectedModelConfig(selectedModelA);
      const configB = getSelectedModelConfig(selectedModelB);
      if (!configA || !configB) { toast.error("Select both models"); return; }
      const isLocalA = configA.baseUrl.includes("localhost") || configA.baseUrl.includes("127.0.0.1");
      const isLocalB = configB.baseUrl.includes("localhost") || configB.baseUrl.includes("127.0.0.1");
      if (!isLocalA && !configA.apiKey) { toast.error("Model A has no API key configured"); return; }
      if (!isLocalB && !configB.apiKey) { toast.error("Model B has no API key configured"); return; }
    }
    if (mode === "paste" && (!responseA.trim() || !responseB.trim())) { toast.error("Paste both responses"); return; }

    setRunning(true);
    setResult(null);

    try {
      let resA = responseA;
      let resB = responseB;

      if (mode === "generate") {
        const configA = getSelectedModelConfig(selectedModelA)!;
        const configB = getSelectedModelConfig(selectedModelB)!;
        const [respA, respB] = await Promise.all([
          callModel({ messages: [{ role: "user", content: prompt }], config: configA }),
          callModel({ messages: [{ role: "user", content: prompt }], config: configB }),
        ]);
        resA = respA.content;
        resB = respB.content;
        setResponseA(resA);
        setResponseB(resB);
      }

      const judgeConfig = getJudgeConfig();
      const criteriaSection = criteria.trim()
        ? `\n\nCustom Evaluation Criteria:\n${criteria.trim()}`
        : "";

      const verdict = await llmJudge(
        judgeConfig,
        AB_JUDGE_SYSTEM,
        `Question/Prompt:\n${prompt}\n\nResponse A:\n${resA}\n\nResponse B:\n${resB}${criteriaSection}`
      );

      let dimensionScores: Record<string, { A: number; B: number }> = {};
      let winner: "A" | "B" | "tie" = "tie";
      try {
        const raw = verdict.reasoning.match(/\{[\s\S]*\}/);
        if (raw) {
          const parsed = JSON.parse(raw[0]);
          dimensionScores = parsed.dimension_scores || {};
          winner = parsed.winner || (verdict.score > 0.6 ? "A" : verdict.score < 0.4 ? "B" : "tie");
        } else {
          winner = verdict.score > 0.6 ? "A" : verdict.score < 0.4 ? "B" : "tie";
        }
      } catch {
        winner = verdict.score > 0.6 ? "A" : verdict.score < 0.4 ? "B" : "tie";
      }

      setResult({
        winner,
        reasoning: verdict.reasoning,
        confidence: verdict.confidence,
        dimensionScores,
        responseA: resA,
        responseB: resB,
      });

      toast.success("Comparison complete!");
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  }, [prompt, responseA, responseB, criteria, mode, selectedModelA, selectedModelB, models]);

  const configured = isConfigured();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-muted-foreground">Compare two model outputs side-by-side. An LLM judge picks the winner with dimensional scoring and detailed reasoning.</p>
      </motion.div>

      {/* Config */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/25">
              <GitCompareArrows className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">A/B Pairwise Comparison</h2>
              <p className="text-xs text-muted-foreground">
                Judge: <span className="font-semibold text-violet-400">{getJudgeModelName()}</span>
                {mode === "generate" && <>
                  {" "}&middot; A: <span className="font-semibold text-sky-400">{getModelLabel(selectedModelA)}</span>
                  {" "}&middot; B: <span className="font-semibold text-orange-400">{getModelLabel(selectedModelB)}</span>
                </>}
              </p>
            </div>
          </div>

          {/* Mode selector */}
          <div className="flex gap-2">
            {(["generate", "paste"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setResult(null); }}
                className={cn(
                  "rounded-xl px-4 py-2.5 text-xs font-semibold transition-all",
                  mode === m ? "glass ring-1 ring-orange-500/30 text-foreground" : "glass-subtle text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "generate" ? "Generate & Compare" : "Paste Responses"}
              </button>
            ))}
          </div>

          {/* Model selectors (generate mode only) */}
          {mode === "generate" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Model A</Label>
                {models.length > 0 ? (
                  <select
                    value={selectedModelA}
                    onChange={(e) => setSelectedModelA(e.target.value)}
                    className="w-full glass-subtle rounded-xl px-3 py-2.5 text-sm bg-transparent border-0 ring-1 ring-border/30 focus:ring-sky-500/50 transition-all"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name || m.model} ({m.provider})</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground">No models configured. <Link href="/settings" className="underline text-sky-400">Add models in Settings</Link></p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-orange-400">Model B</Label>
                {models.length > 0 ? (
                  <select
                    value={selectedModelB}
                    onChange={(e) => setSelectedModelB(e.target.value)}
                    className="w-full glass-subtle rounded-xl px-3 py-2.5 text-sm bg-transparent border-0 ring-1 ring-border/30 focus:ring-orange-500/50 transition-all"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name || m.model} ({m.provider})</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground">No models configured. <Link href="/settings" className="underline text-orange-400">Add models in Settings</Link></p>
                )}
              </div>
            </div>
          )}

          {/* Prompt */}
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <MessageSquare className="inline h-3 w-3 mr-1" />Question / Prompt
            </Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter a question for both models..."
              className="glass-subtle rounded-xl text-sm min-h-[80px]"
            />
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(p)}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[10px] font-medium transition-all",
                    prompt === p ? "bg-orange-500/15 text-orange-500" : "glass-subtle text-muted-foreground/60 hover:text-foreground"
                  )}
                >
                  Preset {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Paste mode inputs */}
          {mode === "paste" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Response A</Label>
                <Textarea value={responseA} onChange={(e) => setResponseA(e.target.value)} placeholder="Paste model A output..." className="glass-subtle rounded-xl text-xs font-mono min-h-[120px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-orange-400">Response B</Label>
                <Textarea value={responseB} onChange={(e) => setResponseB(e.target.value)} placeholder="Paste model B output..." className="glass-subtle rounded-xl text-xs font-mono min-h-[120px]" />
              </div>
            </div>
          )}

          {/* Custom criteria */}
          <div>
            <button
              onClick={() => setShowCriteria(!showCriteria)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all",
                showCriteria ? "glass ring-1 ring-violet-500/30 text-violet-400" : "glass-subtle text-muted-foreground hover:text-foreground"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="flex-1 text-left">Custom Evaluation Criteria</span>
              {criteria && !showCriteria && <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-400">Active</span>}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showCriteria && "rotate-180")} />
            </button>
            <AnimatePresence>
              {showCriteria && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <Textarea
                    value={criteria}
                    onChange={(e) => setCriteria(e.target.value)}
                    placeholder="e.g. Prioritize conciseness over depth. Check for code correctness. Prefer responses that cite sources..."
                    className="mt-2 glass-subtle rounded-xl text-xs min-h-[80px]"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!configured && mode === "paste" && (
            <div className="flex items-center gap-2 rounded-xl ring-1 ring-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
              Judge model not configured. <Link href="/settings" className="underline font-semibold">Go to Settings</Link>
            </div>
          )}
          {models.length < 2 && mode === "generate" && (
            <div className="flex items-center gap-2 rounded-xl ring-1 ring-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
              Add at least 2 models for A/B comparison. <Link href="/settings" className="underline font-semibold">Go to Settings</Link>
            </div>
          )}

          <Button
            onClick={handleRun}
            disabled={running || !prompt.trim() || (mode === "paste" && (!responseA.trim() || !responseB.trim())) || (mode === "generate" && (!selectedModelA || !selectedModelB || models.length === 0))}
            className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/40 transition-shadow"
          >
            {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Comparing...</> : <><Play className="mr-2 h-4 w-4" />Run Comparison</>}
          </Button>
        </div>
      </motion.div>

      {/* Results */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Winner card */}
          <div className={cn(
            "glass rounded-2xl p-6 ring-1",
            result.winner === "A" ? "ring-sky-500/30" : result.winner === "B" ? "ring-orange-500/30" : "ring-border/30"
          )}>
            <div className="flex items-center gap-4">
              <Trophy className={cn(
                "h-8 w-8",
                result.winner === "A" ? "text-sky-400" : result.winner === "B" ? "text-orange-400" : "text-muted-foreground/50"
              )} />
              <div className="flex-1">
                <h3 className="text-lg font-bold">
                  {result.winner === "tie" ? "It's a Tie" : `Response ${result.winner} Wins`}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Confidence: <span className="font-semibold">{(result.confidence * 100).toFixed(0)}%</span>
                </p>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground glass-subtle transition-all hover:text-foreground"
              >
                {copied ? <><Check className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></> : <><Copy className="h-3 w-3" />Copy</>}
              </button>
            </div>
          </div>

          {/* Dimension scores bar chart */}
          {Object.keys(result.dimensionScores).length > 0 && (
            <div className="glass rounded-2xl p-5 space-y-3">
              <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Dimension Scores</h4>
              {Object.entries(result.dimensionScores).map(([dim, scores]) => {
                const total = (scores.A || 0) + (scores.B || 0);
                const pctA = total > 0 ? ((scores.A || 0) / total) * 100 : 50;
                return (
                  <div key={dim} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-sky-400">{((scores.A || 0) * 100).toFixed(0)}%</span>
                      <span className="font-semibold capitalize text-muted-foreground">{dim}</span>
                      <span className="font-mono font-semibold text-orange-400">{((scores.B || 0) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
                      <div className="bg-sky-500 transition-all" style={{ width: `${pctA}%` }} />
                      <div className="bg-orange-500 flex-1" />
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between text-[10px] font-bold text-muted-foreground/60 pt-1">
                <span className="text-sky-400">Response A</span>
                <span className="text-orange-400">Response B</span>
              </div>
            </div>
          )}

          {/* Reasoning */}
          <div className="glass rounded-2xl p-5">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Judge Reasoning</h4>
            <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-muted-foreground glass-subtle rounded-xl p-4 max-h-64 overflow-auto">{result.reasoning}</pre>
          </div>

          {/* Side-by-side responses */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={cn("glass rounded-2xl p-5", result.winner === "A" && "ring-1 ring-sky-500/30")}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-3 w-3 rounded-full bg-sky-500" />
                <h4 className="text-sm font-bold">Response A {mode === "generate" && <span className="font-normal text-muted-foreground">({getModelLabel(selectedModelA)})</span>}</h4>
                {result.winner === "A" && <Trophy className="h-4 w-4 text-sky-400" />}
              </div>
              <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-muted-foreground glass-subtle rounded-xl p-3 max-h-60 overflow-auto">{result.responseA}</pre>
            </div>
            <div className={cn("glass rounded-2xl p-5", result.winner === "B" && "ring-1 ring-orange-500/30")}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-3 w-3 rounded-full bg-orange-500" />
                <h4 className="text-sm font-bold">Response B {mode === "generate" && <span className="font-normal text-muted-foreground">({getModelLabel(selectedModelB)})</span>}</h4>
                {result.winner === "B" && <Trophy className="h-4 w-4 text-orange-400" />}
              </div>
              <pre className="whitespace-pre-wrap text-xs font-mono leading-relaxed text-muted-foreground glass-subtle rounded-xl p-3 max-h-60 overflow-auto">{result.responseB}</pre>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
