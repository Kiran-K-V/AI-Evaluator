"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { format } from "date-fns";
import {
  Search, Wrench, Brain, Shield, Braces, Tags as TagsIcon,
  Gauge, GraduationCap, RefreshCcw, FileText, Microscope,
  FlaskConical, Trash2, Swords, Zap, ChevronDown, ChevronRight,
  Bot, X, Filter,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { getRuns, deleteRun, getAllModels, deleteRunsByGroup } from "@/lib/db";
import { MODULES, getModule } from "@/lib/modules";
import type { EvaluationRun, ModuleSlug, RunType } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  Wrench, Brain, Shield, Braces, Tags: TagsIcon, Gauge, GraduationCap,
  RefreshCcw, FileText, Microscope,
};

interface RunGroup {
  groupId: string;
  groupLabel: string;
  runType: RunType;
  runs: EvaluationRun[];
  timestamp: string;
  passedCount: number;
  totalCount: number;
  models: string[];
}

export default function ResultsPage() {
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [filterModule, setFilterModule] = useState<ModuleSlug | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "pass" | "fail">("all");
  const [filterModel, setFilterModel] = useState<string>("all");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    const [data, models] = await Promise.all([getRuns(), getAllModels()]);
    setRuns(data);
    setAvailableModels(models);
    setMounted(true);
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const { groups, singleRuns } = useMemo(() => {
    const groupMap = new Map<string, RunGroup>();
    const singles: EvaluationRun[] = [];

    for (const r of runs) {
      if (r.groupId && (r.runType === "batch" || r.runType === "arena")) {
        const existing = groupMap.get(r.groupId);
        if (existing) {
          existing.runs.push(r);
          if (r.passed) existing.passedCount++;
          existing.totalCount++;
          if (!existing.models.includes(r.modelConfig.model)) {
            existing.models.push(r.modelConfig.model);
          }
          if (new Date(r.timestamp) > new Date(existing.timestamp)) {
            existing.timestamp = r.timestamp;
          }
        } else {
          groupMap.set(r.groupId, {
            groupId: r.groupId,
            groupLabel: r.groupLabel || `${r.runType === "arena" ? "Arena" : "Batch"} Run`,
            runType: r.runType,
            runs: [r],
            timestamp: r.timestamp,
            passedCount: r.passed ? 1 : 0,
            totalCount: 1,
            models: [r.modelConfig.model],
          });
        }
      } else {
        singles.push(r);
      }
    }

    return { groups: [...groupMap.values()], singleRuns: singles };
  }, [runs]);

  const filteredSingles = useMemo(() => {
    return singleRuns.filter((r) => {
      if (filterModule !== "all" && r.module !== filterModule) return false;
      if (filterStatus === "pass" && !r.passed) return false;
      if (filterStatus === "fail" && r.passed) return false;
      if (filterModel !== "all" && r.modelConfig.model !== filterModel) return false;
      if (search) {
        const mod = getModule(r.module);
        const text = `${mod?.name ?? r.module} ${r.id} ${r.modelConfig.model} ${r.tags?.join(" ") ?? ""} ${format(new Date(r.timestamp), "MMM d yyyy")}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [singleRuns, filterModule, filterStatus, filterModel, search]);

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (filterModel !== "all" && !g.models.includes(filterModel)) return false;
      if (search) {
        const text = `${g.groupLabel} ${g.models.join(" ")} ${format(new Date(g.timestamp), "MMM d yyyy")}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [groups, filterModel, search]);

  const handleDelete = async (id: string) => {
    await deleteRun(id);
    await loadRuns();
    toast.success("Run deleted");
  };

  const handleDeleteGroup = async (groupId: string) => {
    await deleteRunsByGroup(groupId);
    await loadRuns();
    toast.success("Group deleted");
  };

  if (!mounted) return null;

  const totalCount = filteredSingles.length + filteredGroups.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search runs, models, tags..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 glass-subtle rounded-xl" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Module filter */}
          <div className="flex flex-wrap gap-1.5">
            <FilterChip label="All" active={filterModule === "all"} onClick={() => setFilterModule("all")} />
            {MODULES.map((mod) => (
              <FilterChip key={mod.slug} label={mod.name} active={filterModule === mod.slug} onClick={() => setFilterModule(mod.slug)} />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <div className="flex gap-1.5">
            {(["all", "pass", "fail"] as const).map((s) => (
              <FilterChip key={s} label={s} active={filterStatus === s} onClick={() => setFilterStatus(s)} />
            ))}
          </div>

          {/* Model tag filter */}
          {availableModels.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Bot className="h-3 w-3" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Model:</span>
              </div>
              <FilterChip label="All" active={filterModel === "all"} onClick={() => setFilterModel("all")} />
              {availableModels.map((m) => (
                <FilterChip key={m} label={m} active={filterModel === m} onClick={() => setFilterModel(m)} />
              ))}
            </div>
          )}
        </div>

        {(filterModule !== "all" || filterStatus !== "all" || filterModel !== "all" || search) && (
          <div className="flex items-center gap-2">
            <Filter className="h-3 w-3 text-orange-500" />
            <span className="text-xs text-muted-foreground">{totalCount} result{totalCount !== 1 ? "s" : ""}</span>
            <button
              onClick={() => { setFilterModule("all"); setFilterStatus("all"); setFilterModel("all"); setSearch(""); }}
              className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-orange-500 hover:bg-orange-500/10 transition-colors"
            >
              <X className="h-2.5 w-2.5" /> Clear filters
            </button>
          </div>
        )}
      </motion.div>

      {/* Arena & Batch Groups */}
      {filteredGroups.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Arena & Batch Runs</h3>
          {filteredGroups.map((group, i) => (
            <motion.div key={group.groupId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className={cn(
                "glass rounded-2xl transition-all",
                group.runType === "arena" ? "ring-1 ring-red-500/20 hover:ring-red-500/40" : "ring-1 ring-amber-500/20 hover:ring-amber-500/40"
              )}>
                <button
                  onClick={() => setExpandedGroup(expandedGroup === group.groupId ? null : group.groupId)}
                  className="flex w-full items-center gap-4 p-4 text-left"
                >
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    group.runType === "arena" ? "bg-gradient-to-br from-orange-500 to-red-600 shadow-lg shadow-orange-500/20" : "bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-amber-500/20"
                  )}>
                    {group.runType === "arena" ? <Swords className="h-5 w-5 text-white" /> : <Zap className="h-5 w-5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{group.groupLabel}</p>
                      <span className={cn(
                        "rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase",
                        group.runType === "arena" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
                      )}>
                        {group.runType}
                      </span>
                      <span className="glass-subtle rounded-lg px-2 py-0.5 text-[10px] font-bold">{group.totalCount} runs</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{format(new Date(group.timestamp), "MMM d, yyyy 'at' h:mm a")}</span>
                      <span className="text-muted-foreground/30">|</span>
                      <span className="flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        {group.models.join(" vs ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "text-xs font-bold px-2 py-1 rounded-lg",
                      group.passedCount === group.totalCount ? "bg-emerald-500/10 text-emerald-400" :
                      group.passedCount > 0 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
                    )}>
                      {group.passedCount}/{group.totalCount} passed
                    </span>
                    {expandedGroup === group.groupId ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                <AnimatePresence>
                  {expandedGroup === group.groupId && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border/20 px-4 pb-4 pt-3 space-y-2">
                        {group.runs.map((run) => {
                          const mod = getModule(run.module);
                          const Icon = mod ? iconMap[mod.icon] || FlaskConical : FlaskConical;
                          return (
                            <div key={run.id} className="glass-subtle group rounded-xl transition-all hover:ring-1 hover:ring-orange-500/20">
                              <div className="flex items-center gap-3 p-3">
                                <Link href={`/results/${run.id}`} className="flex flex-1 items-center gap-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold">{mod?.name ?? run.module}</p>
                                      <span className="text-[10px] font-mono text-muted-foreground">{run.modelConfig.model}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {run.tags?.map((tag) => (
                                        <span key={tag} className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">{tag}</span>
                                      ))}
                                    </div>
                                  </div>
                                  <PassFailBadge passed={run.passed} />
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex justify-end pt-1">
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteGroup(group.groupId)} className="text-xs text-muted-foreground hover:text-red-400">
                            <Trash2 className="mr-1 h-3 w-3" /> Delete group
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Individual Runs */}
      {filteredSingles.length > 0 && (
        <div className="space-y-2">
          {filteredGroups.length > 0 && (
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mt-4">Individual Runs</h3>
          )}
          {filteredSingles.map((run, i) => {
            const mod = getModule(run.module);
            const Icon = mod ? iconMap[mod.icon] || FlaskConical : FlaskConical;
            return (
              <motion.div key={run.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <div className="glass group rounded-2xl transition-all hover:ring-1 hover:ring-orange-500/30">
                  <div className="flex items-center gap-4 p-4">
                    <Link href={`/results/${run.id}`} className="flex flex-1 items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{mod?.name ?? run.module}</p>
                          <span className="glass-subtle rounded-lg px-2 py-0.5 text-[10px] font-bold">{run.cases.length} cases</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{format(new Date(run.timestamp), "MMM d, yyyy 'at' h:mm a")}</span>
                          <span className="text-muted-foreground/30">|</span>
                          <span>{run.modelConfig.model}</span>
                        </div>
                        {run.tags && run.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {run.tags.filter((t) => t !== run.modelConfig.model).map((tag) => (
                              <span key={tag} className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <PassFailBadge passed={run.passed} />
                    </Link>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400 rounded-xl" onClick={() => handleDelete(run.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="glass rounded-2xl border-dashed p-12 text-center">
          <FlaskConical className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
          <p className="text-lg font-semibold text-muted-foreground">{runs.length === 0 ? "No evaluation runs yet" : "No matching runs"}</p>
          <p className="mt-1 text-sm text-muted-foreground/60">{runs.length === 0 ? "Run an evaluation to see results here" : "Try adjusting your filters"}</p>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
        active
          ? "bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30"
          : "glass-subtle text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
