"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getModelConfig, saveModelConfig } from "@/lib/settings";
import { testConnection } from "@/lib/api";
import { Loader2, CheckCircle2, Key, Server, Bot, Sparkles } from "lucide-react";

const PROVIDERS = [
  { name: "OpenAI", url: "https://api.openai.com/v1", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { name: "Groq", url: "https://api.groq.com/openai/v1", models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"] },
  { name: "Together AI", url: "https://api.together.xyz/v1", models: ["meta-llama/Llama-3-70b-chat-hf", "mistralai/Mixtral-8x7B-Instruct-v0.1"] },
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1", models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet", "google/gemini-pro"] },
  { name: "Fireworks", url: "https://api.fireworks.ai/inference/v1", models: ["accounts/fireworks/models/llama-v3p1-70b-instruct"] },
  { name: "Local (Ollama)", url: "http://localhost:11434/v1", models: ["llama3.1", "mistral", "codellama"] },
];

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [testing, setTesting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const config = getModelConfig();
    requestAnimationFrame(() => {
      setApiKey(config.apiKey);
      setModel(config.model);
      setBaseUrl(config.baseUrl);
      setMounted(true);
    });
  }, []);

  const handleSave = () => {
    saveModelConfig({ apiKey, model, baseUrl });
    toast.success("Configuration saved successfully!");
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const ok = await testConnection({ apiKey, model, baseUrl });
      if (ok) {
        toast.success("Connection successful! Model is reachable.");
      } else {
        toast.error("Connection failed. Check your API key and base URL.");
      }
    } catch {
      toast.error("Connection failed. Check your settings.");
    } finally {
      setTesting(false);
    }
  };

  if (!mounted) return null;

  const currentProvider = PROVIDERS.find((p) => p.url === baseUrl);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="glass rounded-2xl p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Model Configuration</h2>
              <p className="text-sm text-muted-foreground">
                Supports any OpenAI-compatible API endpoint
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Key className="h-3 w-3" /> API Key
              </Label>
              <Input id="apiKey" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="glass-subtle rounded-xl font-mono" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Bot className="h-3 w-3" /> Model Name
              </Label>
              <Input id="model" type="text" placeholder="gpt-4o-mini" value={model} onChange={(e) => setModel(e.target.value)} className="glass-subtle rounded-xl" />
              {currentProvider && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {currentProvider.models.map((m) => (
                    <button
                      key={m}
                      onClick={() => setModel(m)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                        model === m
                          ? "bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30"
                          : "glass-subtle text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseUrl" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Server className="h-3 w-3" /> Base URL
              </Label>
              <Input id="baseUrl" type="text" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="glass-subtle rounded-xl" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-shadow">
                Save Configuration
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={testing || !apiKey} className="rounded-xl glass-subtle">
                {testing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Testing...</>
                ) : (
                  <><CheckCircle2 className="mr-2 h-4 w-4" />Test Connection</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
        <div className="glass rounded-2xl p-6">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground">Quick Select Provider</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.name}
                onClick={() => {
                  setBaseUrl(provider.url);
                  setModel(provider.models[0]);
                }}
                className={`group flex flex-col items-start rounded-xl p-3 text-left transition-all neu-hover ${
                  baseUrl === provider.url
                    ? "glass ring-1 ring-violet-500/40 shadow-violet-500/10"
                    : "glass-subtle hover:ring-1 hover:ring-violet-500/20"
                }`}
              >
                <span className="text-sm font-semibold">{provider.name}</span>
                <span className="mt-0.5 truncate w-full text-[10px] text-muted-foreground">
                  {provider.url}
                </span>
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
