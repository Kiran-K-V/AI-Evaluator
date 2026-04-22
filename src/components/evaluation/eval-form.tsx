"use client";

import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Upload, FileJson, Loader2, AlertCircle, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isConfigured } from "@/lib/settings";
import Link from "next/link";

interface EvalFormProps {
  sampleInput: unknown[];
  onRun: (cases: unknown[]) => void;
  running: boolean;
}

export function EvalForm({ sampleInput, onRun, running }: EvalFormProps) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [usingSample, setUsingSample] = useState(true);
  const [configured, setConfigured] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const json = JSON.stringify(sampleInput, null, 2);
    requestAnimationFrame(() => {
      setJsonText(json);
      setUsingSample(true);
      setConfigured(isConfigured());
    });
  }, [sampleInput]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setJsonText(text);
      setUsingSample(false);
      setShowEditor(true);
      setError(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleRun = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        setError("Input must be a JSON array");
        return;
      }
      if (parsed.length === 0) {
        setError("Input array cannot be empty");
        return;
      }
      setError(null);
      onRun(parsed);
    } catch {
      setError("Invalid JSON. Please check your input.");
    }
  };

  const resetToSample = () => {
    setJsonText(JSON.stringify(sampleInput, null, 2));
    setUsingSample(true);
    setError(null);
  };

  const caseCount = (() => {
    try { const p = JSON.parse(jsonText); return Array.isArray(p) ? p.length : 0; } catch { return 0; }
  })();

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/15 to-amber-500/15">
            <FileJson className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <h3 className="font-bold">Test Cases</h3>
            <p className="text-xs text-muted-foreground">
              {usingSample ? (
                <span className="text-orange-500">{caseCount} sample cases loaded</span>
              ) : (
                <span>{caseCount} custom cases</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground glass-subtle transition-all hover:text-foreground"
        >
          {showEditor ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {showEditor ? "Hide" : "Edit"}
        </button>
      </div>

      <AnimatePresence>
        {showEditor && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setUsingSample(false);
                setError(null);
              }}
              className="mb-4 min-h-[260px] glass-subtle rounded-xl font-mono text-xs"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center gap-2 rounded-xl ring-1 ring-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </motion.div>
      )}

      {!configured && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex items-center gap-2 rounded-xl ring-1 ring-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>API not configured. <Link href="/settings" className="underline font-semibold">Go to Settings</Link></span>
        </motion.div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleRun} disabled={running || !jsonText.trim() || !configured} className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-shadow">
          {running ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</>) : (<><Play className="mr-2 h-4 w-4" />Run Evaluation</>)}
        </Button>
        {!usingSample && (
          <Button variant="outline" onClick={resetToSample} className="rounded-xl glass-subtle">
            <RotateCcw className="mr-2 h-4 w-4" />Reset to Sample
          </Button>
        )}
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-xl glass-subtle">
          <Upload className="mr-2 h-4 w-4" />Upload JSON
        </Button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
      </div>
    </div>
  );
}
