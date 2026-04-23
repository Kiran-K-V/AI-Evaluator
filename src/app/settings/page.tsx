"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getAppConfig, saveAppConfig } from "@/lib/settings";
import { testConnection } from "@/lib/api";
import type { ModelEntry, AppConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Loader2, CheckCircle2, Key, Server, Bot, Sparkles,
  Plus, Trash2, Star, Scale, Copy,
  ChevronDown, ChevronRight, Pencil, Wifi, WifiOff, X,
} from "lucide-react";

const PROVIDERS = [
  { name: "OpenAI", url: "https://api.openai.com/v1", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini", "o3-mini"] },
  { name: "Groq", url: "https://api.groq.com/openai/v1", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "deepseek-r1-distill-llama-70b"] },
  { name: "Together AI", url: "https://api.together.xyz/v1", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "mistralai/Mixtral-8x7B-Instruct-v0.1", "deepseek-ai/DeepSeek-R1"] },
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1", models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-2.0-flash-001", "deepseek/deepseek-r1"] },
  { name: "Fireworks", url: "https://api.fireworks.ai/inference/v1", models: ["accounts/fireworks/models/llama-v3p3-70b-instruct"] },
  { name: "Local (Ollama)", url: "http://localhost:11434/v1", models: ["gemma4:e2b", "llama3.1", "mistral", "deepseek-r1:8b", "codellama"] },
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>({ models: [], activeModelId: "", judgeModelId: "" });
  const [mounted, setMounted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
  const [showAddForm, setShowAddForm] = useState(false);

  // New model form state
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("https://api.openai.com/v1");
  const [newProvider, setNewProvider] = useState("OpenAI");

  useEffect(() => {
    const appConfig = getAppConfig();
    requestAnimationFrame(() => {
      setConfig(appConfig);
      setMounted(true);
    });
  }, []);

  const persistConfig = useCallback((updated: AppConfig) => {
    setConfig(updated);
    saveAppConfig(updated);
  }, []);

  const isLocalProvider = newBaseUrl.includes("localhost") || newBaseUrl.includes("127.0.0.1") || newBaseUrl.includes("0.0.0.0");

  const handleAddModel = () => {
    if (!newModel.trim()) {
      toast.error("Model ID is required");
      return;
    }
    if (!isLocalProvider && !newApiKey.trim()) {
      toast.error("API key is required for remote providers");
      return;
    }
    const entry: ModelEntry = {
      id: generateId(),
      name: newName.trim() || newModel.trim(),
      provider: newProvider,
      apiKey: newApiKey.trim(),
      baseUrl: newBaseUrl.trim(),
      model: newModel.trim(),
    };
    const updated = { ...config, models: [...config.models, entry] };
    if (!updated.activeModelId) updated.activeModelId = entry.id;
    if (!updated.judgeModelId) updated.judgeModelId = entry.id;
    persistConfig(updated);
    resetForm();
    toast.success(`Model "${entry.name}" added`);
  };

  const handleDeleteModel = (id: string) => {
    const updated = {
      ...config,
      models: config.models.filter((m) => m.id !== id),
    };
    if (updated.activeModelId === id) updated.activeModelId = updated.models[0]?.id || "";
    if (updated.judgeModelId === id) updated.judgeModelId = updated.models[0]?.id || "";
    persistConfig(updated);
    if (editingId === id) setEditingId(null);
    toast.success("Model removed");
  };

  const handleUpdateModel = (id: string, updates: Partial<ModelEntry>) => {
    const updated = {
      ...config,
      models: config.models.map((m) => m.id === id ? { ...m, ...updates } : m),
    };
    persistConfig(updated);
  };

  const handleSetActive = (id: string) => {
    persistConfig({ ...config, activeModelId: id });
    toast.success("Active model updated");
  };

  const handleSetJudge = (id: string) => {
    persistConfig({ ...config, judgeModelId: id });
    toast.success("Judge model updated");
  };

  const handleTestModel = async (entry: ModelEntry) => {
    setTestingId(entry.id);
    try {
      const ok = await testConnection({ apiKey: entry.apiKey, model: entry.model, baseUrl: entry.baseUrl });
      setTestResults((prev) => ({ ...prev, [entry.id]: ok }));
      if (ok) toast.success(`${entry.name}: Connection successful`);
      else toast.error(`${entry.name}: Connection failed`);
    } catch {
      setTestResults((prev) => ({ ...prev, [entry.id]: false }));
      toast.error(`${entry.name}: Connection failed`);
    } finally {
      setTestingId(null);
    }
  };

  const handleTestAll = async () => {
    for (const entry of config.models) {
      await handleTestModel(entry);
    }
  };

  const resetForm = () => {
    setNewName("");
    setNewModel("");
    setNewApiKey("");
    setNewBaseUrl("https://api.openai.com/v1");
    setNewProvider("OpenAI");
    setShowAddForm(false);
  };

  const handleProviderPreset = (provider: typeof PROVIDERS[0]) => {
    setNewBaseUrl(provider.url);
    setNewProvider(provider.name);
    if (!newModel) setNewModel(provider.models[0]);
  };

  const duplicateModel = (entry: ModelEntry) => {
    const dup: ModelEntry = { ...entry, id: generateId(), name: `${entry.name} (copy)` };
    persistConfig({ ...config, models: [...config.models, dup] });
    toast.success("Model duplicated");
  };

  if (!mounted) return null;

  const activeModel = config.models.find((m) => m.id === config.activeModelId);
  const judgeModel = config.models.find((m) => m.id === config.judgeModelId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Status bar */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Model Configuration</h2>
              <p className="text-sm text-muted-foreground">Manage multiple models, assign roles, and test connections</p>
            </div>
          </div>

          {/* Active + Judge display */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl glass-subtle p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <Star className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active Model</p>
                <p className="text-sm font-semibold truncate">{activeModel?.name || "Not configured"}</p>
                {activeModel && <p className="text-[10px] text-muted-foreground truncate">{activeModel.model} via {activeModel.provider}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl glass-subtle p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                <Scale className="h-4 w-4 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Judge Model</p>
                <p className="text-sm font-semibold truncate">{judgeModel?.name || "Same as active"}</p>
                {judgeModel && <p className="text-[10px] text-muted-foreground truncate">{judgeModel.model} via {judgeModel.provider}</p>}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Model list */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Models ({config.models.length})
            </h3>
            <div className="flex gap-2">
              {config.models.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleTestAll} className="rounded-lg glass-subtle text-xs h-8">
                  <Wifi className="mr-1.5 h-3 w-3" />Test All
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
                className="rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-xs h-8 shadow-lg shadow-orange-500/20"
              >
                <Plus className="mr-1.5 h-3 w-3" />{showAddForm ? "Cancel" : "Add Model"}
              </Button>
            </div>
          </div>

          {/* Empty state */}
          {config.models.length === 0 && !showAddForm && (
            <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
              <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
              <p className="font-semibold text-muted-foreground">No models configured</p>
              <p className="mt-1 text-sm text-muted-foreground/60">Add your first model to start evaluating</p>
            </div>
          )}

          {/* Model entries */}
          <div className="space-y-2">
            {config.models.map((entry) => {
              const isActive = entry.id === config.activeModelId;
              const isJudge = entry.id === config.judgeModelId;
              const isEditing = editingId === entry.id;
              const isTesting = testingId === entry.id;
              const testResult = testResults[entry.id];

              return (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "rounded-xl glass-subtle transition-all",
                    isActive && "ring-1 ring-emerald-500/30",
                    isJudge && !isActive && "ring-1 ring-violet-500/30"
                  )}
                >
                  {/* Model row header */}
                  <div className="flex items-center gap-3 p-3">
                    <button onClick={() => setEditingId(isEditing ? null : entry.id)} className="shrink-0">
                      {isEditing
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{entry.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono truncate">{entry.model}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md glass text-muted-foreground">{entry.provider}</span>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold">Active</span>
                        )}
                        {isJudge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 font-semibold">Judge</span>
                        )}
                      </div>
                    </div>

                    {/* Connection status indicator */}
                    <div className="shrink-0">
                      {testResult === true && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      {testResult === false && <WifiOff className="h-4 w-4 text-red-400" />}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => handleTestModel(entry)}
                        disabled={isTesting}
                        className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-accent/50"
                        title="Test connection"
                      >
                        {isTesting ? <Loader2 className="h-4 w-4 animate-spin text-orange-500" /> : <Wifi className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      {!isActive && (
                        <button
                          onClick={() => handleSetActive(entry.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-emerald-500/10"
                          title="Set as active"
                        >
                          <Star className="h-4 w-4 text-muted-foreground hover:text-emerald-400" />
                        </button>
                      )}
                      {!isJudge && (
                        <button
                          onClick={() => handleSetJudge(entry.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-violet-500/10"
                          title="Set as judge"
                        >
                          <Scale className="h-4 w-4 text-muted-foreground hover:text-violet-400" />
                        </button>
                      )}
                      <button
                        onClick={() => duplicateModel(entry)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-accent/50"
                        title="Duplicate"
                      >
                        <Copy className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDeleteModel(entry.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-red-500/10"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-400" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded edit form */}
                  <AnimatePresence>
                    {isEditing && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border/20 p-4 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Display Name</Label>
                              <Input
                                value={entry.name}
                                onChange={(e) => handleUpdateModel(entry.id, { name: e.target.value })}
                                className="glass rounded-lg h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model ID</Label>
                              <Input
                                value={entry.model}
                                onChange={(e) => handleUpdateModel(entry.id, { model: e.target.value })}
                                className="glass rounded-lg h-9 text-sm font-mono"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              API Key
                              {(entry.baseUrl.includes("localhost") || entry.baseUrl.includes("127.0.0.1")) && (
                                <span className="ml-1 text-muted-foreground/50 normal-case tracking-normal">(optional for local models)</span>
                              )}
                            </Label>
                            <Input
                              type="password"
                              placeholder={(entry.baseUrl.includes("localhost") || entry.baseUrl.includes("127.0.0.1")) ? "Not required for local models" : "sk-..."}
                              value={entry.apiKey}
                              onChange={(e) => handleUpdateModel(entry.id, { apiKey: e.target.value })}
                              className="glass rounded-lg h-9 text-sm font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Base URL</Label>
                            <Input
                              value={entry.baseUrl}
                              onChange={(e) => handleUpdateModel(entry.id, { baseUrl: e.target.value })}
                              className="glass rounded-lg h-9 text-sm font-mono"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {/* Add model form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-xl ring-1 ring-orange-500/20 bg-orange-500/5 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold">Add New Model</h4>
                    <button onClick={resetForm} className="rounded-lg p-1 hover:bg-accent/50 transition-colors">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Provider presets */}
                  <div>
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Provider Preset</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {PROVIDERS.map((p) => (
                        <button
                          key={p.name}
                          onClick={() => handleProviderPreset(p)}
                          className={cn(
                            "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                            newProvider === p.name
                              ? "bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30"
                              : "glass text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <Pencil className="inline h-2.5 w-2.5 mr-1" />Display Name
                      </Label>
                      <Input
                        placeholder="e.g. GPT-4o Production"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="glass rounded-lg h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <Bot className="inline h-2.5 w-2.5 mr-1" />Model ID
                      </Label>
                      <Input
                        placeholder="gpt-4o-mini"
                        value={newModel}
                        onChange={(e) => setNewModel(e.target.value)}
                        className="glass rounded-lg h-9 text-sm font-mono"
                      />
                      {/* Quick model suggestions */}
                      {newProvider && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {PROVIDERS.find((p) => p.name === newProvider)?.models.map((m) => (
                            <button
                              key={m}
                              onClick={() => setNewModel(m)}
                              className={cn(
                                "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-all",
                                newModel === m
                                  ? "bg-orange-500/15 text-orange-500"
                                  : "glass text-muted-foreground/60 hover:text-foreground"
                              )}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Key className="inline h-2.5 w-2.5 mr-1" />API Key
                      {isLocalProvider && <span className="ml-1 text-muted-foreground/50 normal-case tracking-normal">(optional for local models)</span>}
                    </Label>
                    <Input
                      type="password"
                      placeholder={isLocalProvider ? "Not required for local models" : "sk-..."}
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      className="glass rounded-lg h-9 text-sm font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Server className="inline h-2.5 w-2.5 mr-1" />Base URL
                    </Label>
                    <Input
                      placeholder="https://api.openai.com/v1"
                      value={newBaseUrl}
                      onChange={(e) => setNewBaseUrl(e.target.value)}
                      className="glass rounded-lg h-9 text-sm font-mono"
                    />
                  </div>

                  {/* Ollama setup hint */}
                  {isLocalProvider && (
                    <div className="rounded-lg bg-amber-500/5 ring-1 ring-amber-500/20 p-3 text-xs text-muted-foreground leading-relaxed space-y-1.5">
                      <p className="font-semibold text-amber-400">Local Model Setup</p>
                      <p>1. Start Ollama: <code className="rounded bg-accent/30 px-1 py-0.5 font-mono text-[10px]">OLLAMA_ORIGINS=* ollama serve</code></p>
                      <p>2. Pull your model: <code className="rounded bg-accent/30 px-1 py-0.5 font-mono text-[10px]">ollama pull gemma3:4b</code></p>
                      <p>3. No API key needed — leave it blank.</p>
                      <p className="text-muted-foreground/60">The <code className="font-mono text-[10px]">OLLAMA_ORIGINS=*</code> flag allows browser connections. Alternatively, this app routes local requests through a server-side proxy to bypass CORS.</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={handleAddModel}
                      disabled={!newModel.trim() || (!isLocalProvider && !newApiKey.trim())}
                      className="rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/20 h-9 text-sm"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Add Model
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!newModel.trim() || !newBaseUrl.trim() || testingId === "new"}
                      onClick={async () => {
                        setTestingId("new");
                        try {
                          const ok = await testConnection({ apiKey: newApiKey, model: newModel, baseUrl: newBaseUrl });
                          if (ok) toast.success("Connection successful — ready to add!");
                          else toast.error("Connection failed. Check the settings.");
                        } catch { toast.error("Connection failed."); }
                        finally { setTestingId(null); }
                      }}
                      className="rounded-lg glass-subtle h-9 text-sm"
                    >
                      {testingId === "new"
                        ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Testing...</>
                        : <><Wifi className="mr-1.5 h-3.5 w-3.5" />Test Connection</>
                      }
                    </Button>
                    <Button variant="outline" onClick={resetForm} className="rounded-lg glass-subtle h-9 text-sm">
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* How judge model works */}
      {config.models.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="glass rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 mt-0.5">
                <Scale className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1">About the Judge Model</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The judge model evaluates outputs from the active model in modules that use LLM-as-judge scoring
                  (Hallucination, Safety, RAG Grounding, Domain Knowledge, Consistency, Summarization).
                  For best results, use a different — ideally stronger — model as the judge to avoid self-evaluation bias.
                  For example, use GPT-4o as judge while evaluating GPT-4o-mini, or use Claude as judge for GPT models.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Danger zone */}
      {config.models.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Data Management</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const json = JSON.stringify(config, null, 2);
                  navigator.clipboard.writeText(json);
                  toast.success("Configuration copied to clipboard");
                }}
                className="rounded-lg glass-subtle text-xs h-8"
              >
                <Copy className="mr-1.5 h-3 w-3" />Export Config
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".json";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const imported = JSON.parse(ev.target?.result as string);
                        if (imported.models && Array.isArray(imported.models)) {
                          persistConfig(imported);
                          toast.success(`Imported ${imported.models.length} models`);
                        } else {
                          toast.error("Invalid config format");
                        }
                      } catch { toast.error("Failed to parse config file"); }
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }}
                className="rounded-lg glass-subtle text-xs h-8"
              >
                <Plus className="mr-1.5 h-3 w-3" />Import Config
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm("Remove all models? This cannot be undone.")) {
                    persistConfig({ models: [], activeModelId: "", judgeModelId: "" });
                    toast.success("All models removed");
                  }
                }}
                className="rounded-lg glass-subtle text-xs h-8 text-red-400 hover:text-red-300 hover:ring-1 hover:ring-red-500/30"
              >
                <Trash2 className="mr-1.5 h-3 w-3" />Clear All
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
