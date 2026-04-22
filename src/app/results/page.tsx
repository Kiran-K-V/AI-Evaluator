"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { format } from "date-fns";
import {
  Search, Wrench, Brain, BookOpen, Shield, Braces, Tags,
  Gauge, FlaskConical, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PassFailBadge } from "@/components/metrics/pass-fail-badge";
import { getRuns, deleteRun } from "@/lib/storage";
import { MODULES } from "@/lib/modules";
import type { EvaluationRun, ModuleSlug } from "@/lib/types";
import { toast } from "sonner";

const iconMap: Record<string, React.ElementType> = { Wrench, Brain, BookOpen, Shield, Braces, Tags, Gauge };

export default function ResultsPage() {
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [filterModule, setFilterModule] = useState<ModuleSlug | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "pass" | "fail">("all");

  useEffect(() => {
    const data = getRuns();
    requestAnimationFrame(() => { setRuns(data); setMounted(true); });
  }, []);

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (filterModule !== "all" && r.module !== filterModule) return false;
      if (filterStatus === "pass" && !r.passed) return false;
      if (filterStatus === "fail" && r.passed) return false;
      if (search) {
        const mod = MODULES.find((m) => m.slug === r.module);
        const text = `${mod?.name ?? r.module} ${r.id} ${format(new Date(r.timestamp), "MMM d yyyy")}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [runs, filterModule, filterStatus, search]);

  const handleDelete = (id: string) => {
    deleteRun(id);
    setRuns(getRuns());
    toast.success("Run deleted");
  };

  if (!mounted) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search runs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 glass-subtle rounded-xl" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={filterModule === "all"} onClick={() => setFilterModule("all")} />
          {MODULES.map((mod) => (
            <FilterChip key={mod.slug} label={mod.name} active={filterModule === mod.slug} onClick={() => setFilterModule(mod.slug)} />
          ))}
        </div>

        <div className="flex gap-1.5">
          {(["all", "pass", "fail"] as const).map((s) => (
            <FilterChip key={s} label={s} active={filterStatus === s} onClick={() => setFilterStatus(s)} />
          ))}
        </div>
      </motion.div>

      <p className="text-xs text-muted-foreground">{filtered.length} of {runs.length} runs</p>

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl border-dashed p-12 text-center">
          <FlaskConical className="mx-auto mb-4 h-12 w-12 text-muted-foreground/20" />
          <p className="text-lg font-semibold text-muted-foreground">{runs.length === 0 ? "No evaluation runs yet" : "No matching runs"}</p>
          <p className="mt-1 text-sm text-muted-foreground/60">{runs.length === 0 ? "Run an evaluation to see results here" : "Try adjusting your filters"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((run, i) => {
            const mod = MODULES.find((m) => m.slug === run.module);
            const Icon = mod ? iconMap[mod.icon] || FlaskConical : FlaskConical;
            return (
              <motion.div key={run.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <div className="glass group rounded-2xl transition-all hover:ring-1 hover:ring-violet-500/30">
                  <div className="flex items-center gap-4 p-4">
                    <Link href={`/results/${run.id}`} className="flex flex-1 items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
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
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
        active
          ? "bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30"
          : "glass-subtle text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
